/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Gmail intake — authenticated server functions used by the CA portal.
 * Every call proves the caller belongs to the firm it names before touching tokens.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertFirmMember(
  supabase: { from: (t: string) => any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  firmId: string,
): Promise<void> {
  const { data } = await supabase.from("ca_firm_members").select("id").eq("ca_firm_id", firmId).limit(1);
  if (data && data.length > 0) return;
  const { data: owned } = await supabase.from("ca_firms").select("id").eq("id", firmId).limit(1);
  if (owned && owned.length > 0) return;
  throw new Error("You do not have access to this practice");
}

/** Connecting or disconnecting the firm's inbox is firm administration: partners only. */
async function assertFirmPartner(userId: string, firmId: string): Promise<void> {
  const { adminDb, firmContext, canSignOff } = await import("@/lib/practice/db.server");
  const ctx = await firmContext(await adminDb(), userId);
  if (ctx.firmId !== firmId) throw new Error("You do not have access to this practice");
  if (!canSignOff(ctx)) throw new Error("Only a partner can connect or disconnect the firm's Gmail.");
}

/** Build the Google consent URL. */
export const startGmailConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { firmId: string; origin?: string; enableSending?: boolean }) => {
    if (!input?.firmId) throw new Error("firmId is required");
    return input;
  })
  .handler(async ({ data, context }): Promise<{ url: string; redirectUri: string }> => {
    await assertFirmMember(context.supabase as never, data.firmId);
    await assertFirmPartner(context.userId, data.firmId);
    const { gmailCredentials, redirectUriFor, GMAIL_SCOPES, GMAIL_SEND_SCOPE } = await import("@/lib/caGmail.server");
    const { clientId } = gmailCredentials();
    const redirectUri = redirectUriFor(data.origin ?? null);
    const state = btoa(JSON.stringify({ firmId: data.firmId, userId: context.userId, ts: Date.now(), sending: data.enableSending === true }));
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      // Sending is asked for only when a partner turns on "send chasers from my Gmail".
      scope: data.enableSending ? `${GMAIL_SCOPES} ${GMAIL_SEND_SCOPE}` : GMAIL_SCOPES,
      access_type: "offline",
      include_granted_scopes: "true",
      prompt: "consent",
      state,
    });
    console.log(`[fyn:gmail] consent start — redirect_uri=${redirectUri}`);
    // GOOGLE_AUTH_URL exists only so tests and demos can use a stand-in Google.
    const authUrl = process.env.GOOGLE_AUTH_URL || "https://accounts.google.com/o/oauth2/v2/auth";
    return { url: `${authUrl}?${params.toString()}`, redirectUri };
  });

/** "Check now": check this firm's inboxes immediately and read what arrived. */
export const pollGmailNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { firmId: string; origin?: string }) => {
    if (!input?.firmId) throw new Error("firmId is required");
    return input;
  })
  .handler(async ({ data, context }): Promise<{ ok: boolean; detail: string; documents: number }> => {
    await assertFirmMember(context.supabase as never, data.firmId);
    const { pollGmailInboxes, describePoll } = await import("@/lib/practice/gmailIntake.server");
    const summary = await pollGmailInboxes({ firmId: data.firmId, budgetMs: 30_000, trigger: "manual" });
    if (summary.documents > 0) {
      const { processQueue } = await import("@/lib/practice/documents.server");
      await processQueue(3).catch(() => undefined);
    }
    const failed = Boolean(summary.problem) || summary.inboxes.some((i) => i.error);
    return { ok: !failed, detail: describePoll(summary), documents: summary.documents };
  });

/** Runs every step of Gmail intake for real and reports which one fails. */
export const gmailHealthCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { firmId: string }) => {
    if (!input?.firmId) throw new Error("firmId is required");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertFirmMember(context.supabase as never, data.firmId);
    const { gmailHealth } = await import("@/lib/practice/gmailIntake.server");
    return gmailHealth(data.firmId);
  });

/** Exchange the Google code for tokens and store the connection. */
export const completeGmailConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { code: string; state: string; origin?: string }) => {
    if (!input?.code || typeof input.code !== "string" || input.code.trim().length === 0) {
      throw new Error("Invalid authorisation code");
    }
    if (!input?.state || typeof input.state !== "string" || input.state.trim().length === 0) {
      throw new Error("Invalid state parameter");
    }
    if (input.origin !== undefined && typeof input.origin === "string") {
      if (!input.origin.startsWith("https://") && !input.origin.startsWith("http://localhost")) {
        throw new Error("Invalid origin");
      }
    }
    return input;
  })
  .handler(async ({ data, context }): Promise<{ ok: true; gmailAddress: string }> => {
    let parsed: { firmId?: string; userId?: string; sending?: boolean };
    try {
      parsed = JSON.parse(atob(data.state));
    } catch {
      throw new Error("The Google authorisation could not be verified. Please try again.");
    }
    if (!parsed.firmId || parsed.userId !== context.userId) {
      throw new Error("The Google authorisation did not match your session. Please try again.");
    }
    await assertFirmMember(context.supabase as never, parsed.firmId);

    const g = await import("@/lib/caGmail.server");
    const redirectUri = g.redirectUriFor(data.origin ?? null);
    console.log(`[fyn:gmail] oauth callback — exchanging code, redirect_uri=${redirectUri}`);
    console.log("[fyn:gmail] attempting token exchange with redirect_uri:", redirectUri);
    let tokens: Awaited<ReturnType<typeof g.exchangeCode>>;
    try {
      tokens = await g.exchangeCode(data.code, redirectUri);
      console.log("[fyn:gmail] token exchange success — has_refresh_token:", !!tokens.refresh_token);
    } catch (exchangeErr) {
      console.error("[fyn:gmail] token exchange failed:", exchangeErr instanceof Error ? exchangeErr.message : exchangeErr);
      throw exchangeErr;
    }
    // Google lets people untick "read your email" on the consent screen; the
    // connection would then look fine but never see a single message.
    if (tokens.scope && !tokens.scope.includes("gmail.readonly")) {
      await g.revokeToken(tokens.access_token);
      throw new Error(
        "Google did not give FynHelp permission to read this inbox. Connect again and tick the box that lets FynHelp view your email messages.",
      );
    }
    if (!tokens.refresh_token) {
      throw new Error("Google did not return a refresh token. Remove FynHelp from your Google account permissions and connect again.");
    }
    const gmailAddress = await g.fetchGmailAddress(tokens.access_token);

    let dbClient: { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // The admin proxy throws lazily on first use — probe it so the fallback catches init failures.
      await supabaseAdmin.from("ca_gmail_connections").select("id").limit(1);
      dbClient = supabaseAdmin as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
      console.log("[fyn:gmail] using supabaseAdmin for upsert");
    } catch (adminErr) {
      console.warn("[fyn:gmail] supabaseAdmin unavailable, falling back to session client:", adminErr instanceof Error ? adminErr.message : adminErr);
      dbClient = context.supabase as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
    }

    const payload = {
      ca_firm_id: parsed.firmId,
      user_id: context.userId,
      gmail_address: gmailAddress,
      access_token_enc: await g.encryptToken(tokens.access_token),
      refresh_token_enc: await g.encryptToken(tokens.refresh_token),
      token_expiry: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      is_active: true,
      error_message: null,
    };

    console.log("[fyn:gmail] attempting db upsert for:", gmailAddress, "firm:", parsed.firmId);

    const { error } = await dbClient
      .from("ca_gmail_connections")
      .upsert(payload as never, { onConflict: "ca_firm_id,gmail_address" });

    if (error) {
      console.error("[fyn:gmail] db upsert failed:", error.code, error.message, error.details);
      throw new Error(`Could not save Gmail connection: ${error.message}`);
    }
    console.log("[fyn:gmail] connection saved successfully for", gmailAddress);

    // Record whether Google actually granted sending; turn chasing from Gmail on when that was the point.
    if (tokens.scope) {
      const grantedSend = tokens.scope.includes("gmail.send");
      try {
        const { data: f } = await dbClient.from("ca_firms").select("notification_prefs").eq("id", parsed.firmId).maybeSingle();
        const prev = ((f as { notification_prefs?: Record<string, unknown> } | null)?.notification_prefs ?? {}) as Record<string, unknown>;
        await dbClient
          .from("ca_firms")
          .update({
            notification_prefs: {
              ...prev,
              gmail_send_granted: grantedSend,
              ...(grantedSend && parsed.sending ? { chaser_via_gmail: true } : {}),
              ...(!grantedSend ? { chaser_via_gmail: false } : {}),
            },
          } as never)
          .eq("id", parsed.firmId);
      } catch (e) {
        console.warn("[fyn:gmail] could not save send permission", e instanceof Error ? e.message : e);
      }
    }

    try {
      await dbClient.from("ca_brain_events").insert({
        ca_firm_id: parsed.firmId,
        business_id: null,
        event_type: "gmail_connected",
        payload: { connected_at: new Date().toISOString() },
      } as never);
    } catch { /* fire and forget */ }

    return { ok: true, gmailAddress };
  });

/** Revoke the Google grant and mark the connection inactive. */
export const disconnectGmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { connectionId: string; firmId: string }) => {
    if (!input?.connectionId || !input?.firmId) throw new Error("connectionId and firmId are required");
    return input;
  })
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertFirmMember(context.supabase as never, data.firmId);
    await assertFirmPartner(context.userId, data.firmId);
    let dbClient: { from: (t: string) => any };
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("ca_gmail_connections").select("id").limit(1);
      dbClient = supabaseAdmin as { from: (t: string) => any };
    } catch (adminErr) {
      console.warn("[fyn:gmail] supabaseAdmin unavailable, falling back to session client:", adminErr instanceof Error ? adminErr.message : adminErr);
      dbClient = context.supabase as { from: (t: string) => any };
    }
    const g = await import("@/lib/caGmail.server");

    const { data: conn } = await dbClient
      .from("ca_gmail_connections")
      .select("access_token_enc")
      .eq("id", data.connectionId)
      .eq("ca_firm_id", data.firmId)
      .maybeSingle();
    const enc = (conn as { access_token_enc?: string } | null)?.access_token_enc;
    if (enc) {
      try {
        await g.revokeToken(await g.decryptToken(enc));
      } catch { /* revocation is best effort */ }
    }

    await dbClient
      .from("ca_gmail_connections")
      .update({ is_active: false, error_message: null } as never)
      .eq("id", data.connectionId)
      .eq("ca_firm_id", data.firmId);

    try {
      await dbClient.from("ca_brain_events").insert({
        ca_firm_id: data.firmId,
        business_id: null,
        event_type: "gmail_disconnected",
        payload: { disconnected_at: new Date().toISOString() },
      } as never);
    } catch { /* fire and forget */ }

    return { ok: true };
  });

export interface ChaserPrefs {
  viaGmail: boolean;
  sendGranted: boolean;
  tone: "gentle" | "standard" | "firm";
}

const readPrefs = (raw: unknown): ChaserPrefs => {
  const p = (raw ?? {}) as Record<string, unknown>;
  const tone = p["chaser_tone"];
  return {
    sendGranted: p["gmail_send_granted"] === true,
    viaGmail: p["chaser_via_gmail"] === true && p["gmail_send_granted"] === true,
    tone: tone === "gentle" || tone === "firm" ? tone : "standard",
  };
};

/** How this firm's chasers go out: from its own Gmail or the FynHelp address, and in what tone. */
export const getChaserPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { firmId: string }) => {
    if (!input?.firmId) throw new Error("firmId is required");
    return input;
  })
  .handler(async ({ data, context }): Promise<ChaserPrefs> => {
    await assertFirmMember(context.supabase as never, data.firmId);
    const { adminDb } = await import("@/lib/practice/db.server");
    const { data: f } = await (await adminDb()).from("ca_firms").select("notification_prefs").eq("id", data.firmId).maybeSingle();
    return readPrefs(f?.notification_prefs);
  });

/** Partner choice: send chasers from the firm's Gmail (needs Google's send permission) and the tone. */
export const setChaserPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { firmId: string; viaGmail?: boolean; tone?: "gentle" | "standard" | "firm" }) => {
    if (!input?.firmId) throw new Error("firmId is required");
    if (input.tone !== undefined && !["gentle", "standard", "firm"].includes(input.tone)) throw new Error("Unknown tone");
    return input;
  })
  .handler(async ({ data, context }): Promise<ChaserPrefs> => {
    await assertFirmMember(context.supabase as never, data.firmId);
    await assertFirmPartner(context.userId, data.firmId);
    const { adminDb } = await import("@/lib/practice/db.server");
    const db = await adminDb();
    const { data: f } = await db.from("ca_firms").select("notification_prefs").eq("id", data.firmId).maybeSingle();
    const prev = (f?.notification_prefs ?? {}) as Record<string, unknown>;
    if (data.viaGmail === true && prev["gmail_send_granted"] !== true) {
      throw new Error("Allow FynHelp to send from your Gmail first.");
    }
    const next = {
      ...prev,
      ...(data.viaGmail !== undefined ? { chaser_via_gmail: data.viaGmail } : {}),
      ...(data.tone ? { chaser_tone: data.tone } : {}),
    };
    const { error } = await db.from("ca_firms").update({ notification_prefs: next }).eq("id", data.firmId);
    if (error) throw new Error(error.message);
    return readPrefs(next);
  });
