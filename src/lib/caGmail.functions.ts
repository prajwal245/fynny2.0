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

/** Build the Google consent URL. */
export const startGmailConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { firmId: string; origin?: string }) => {
    if (!input?.firmId) throw new Error("firmId is required");
    return input;
  })
  .handler(async ({ data, context }): Promise<{ url: string; redirectUri: string }> => {
    await assertFirmMember(context.supabase as never, data.firmId);
    const { gmailCredentials, redirectUriFor, GMAIL_SCOPES } = await import("@/lib/caGmail.server");
    const { clientId } = gmailCredentials();
    const redirectUri = redirectUriFor(data.origin ?? null);
    const state = btoa(JSON.stringify({ firmId: data.firmId, userId: context.userId, ts: Date.now() }));
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: GMAIL_SCOPES,
      access_type: "offline",
      include_granted_scopes: "true",
      prompt: "consent",
      state,
    });
    console.log(`[fyn:gmail] consent start — redirect_uri=${redirectUri}`);
    return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`, redirectUri };
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
    const summary = await pollGmailInboxes({ firmId: data.firmId, budgetMs: 30_000 });
    if (summary.documents > 0) {
      const { processQueue } = await import("@/lib/practice/documents.server");
      await processQueue(3).catch(() => undefined);
    }
    const failed = summary.inboxes.some((i) => i.error);
    return { ok: !failed, detail: describePoll(summary), documents: summary.documents };
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
    let parsed: { firmId?: string; userId?: string };
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

/** Temporary diagnostic — reports which Gmail env vars are present (values never returned). */
export const debugGmailEnv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ vars: Record<string, string> }> => {
    const rateKey = `debug-${context.userId}`;
    const now = Date.now();
    // Simple in-memory rate limit: once per 60 seconds per user (best effort per worker)
    const store = globalThis as unknown as Record<string, unknown>;
    const lastCall = store[rateKey] as number | undefined;
    if (lastCall && now - lastCall < 60000) {
      throw new Error("Rate limit: wait 60 seconds between debug calls");
    }
    store[rateKey] = now;
    return {
      vars: {
        GMAIL_CLIENT_ID: process.env["GMAIL_CLIENT_ID"] ? "SET" : "MISSING",
        GOOGLE_OAUTH_CLIENT_ID: process.env["GOOGLE_OAUTH_CLIENT_ID"] ? "SET" : "MISSING",
        GMAIL_CLIENT_SECRET: process.env["GMAIL_CLIENT_SECRET"] ? "SET" : "MISSING",
        GOOGLE_OAUTH_CLIENT_SECRET: process.env["GOOGLE_OAUTH_CLIENT_SECRET"] ? "SET" : "MISSING",
        GMAIL_ENCRYPTION_KEY: process.env["GMAIL_ENCRYPTION_KEY"] ? "SET" : "MISSING",
        SUPABASE_SERVICE_ROLE_KEY: process.env["SUPABASE_SERVICE_ROLE_KEY"] ? "SET" : "MISSING",
        SUPABASE_URL: process.env["SUPABASE_URL"] ? "SET" : "MISSING",
      },
    };
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
