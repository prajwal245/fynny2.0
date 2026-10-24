/**
 * WhatsApp Business Cloud API intake (official API only).
 *
 * Meta posts a webhook when a client sends a document or photo to the firm's
 * WhatsApp Business number. We verify the signature, download the media
 * immediately (media URLs expire within minutes), store it, and queue it for
 * the Extract agent. The sender's number is matched to a client; unknown
 * senders land as unassigned documents.
 */
import { adminDb, chaserEvent, logActivity, type Db, type FirmContext } from "./db.server";
import { BUCKET, registerDocument } from "./documents.server";
import { PracticeError } from "./core";
import { advances, classifyInbound, explainWaError, isWaDelivery, type WaDelivery } from "./whatsappFlow";
import { chaseTemplate, chaseTemplateLang } from "./whatsappSend.server";

// WHATSAPP_GRAPH_BASE exists only so tests and demos can use a stand-in Meta Graph API.
const GRAPH = process.env["WHATSAPP_GRAPH_BASE"] || "https://graph.facebook.com/v21.0";

function env(name: string) {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

export async function verifySignature(
  rawBody: string,
  header: string | null,
  secret: string,
): Promise<boolean> {
  if (!header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)),
  );
  const expected = Array.from(sig)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const given = header.slice(7).toLowerCase();
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++)
    diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

interface WaMessage {
  id: string;
  from: string;
  timestamp?: string;
  type: string;
  document?: {
    id: string;
    filename?: string;
    mime_type?: string;
    caption?: string;
  };
  image?: { id: string; mime_type?: string; caption?: string };
  text?: { body?: string };
}

interface WaStatus {
  id: string;
  status: string;
  recipient_id?: string;
  errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[];
}

interface WaChange {
  value?: {
    metadata?: { phone_number_id?: string; display_phone_number?: string };
    contacts?: { wa_id?: string; profile?: { name?: string } }[];
    messages?: WaMessage[];
    statuses?: WaStatus[];
  };
}

const last10 = (p: string | null | undefined) =>
  String(p ?? "")
    .replace(/\D/g, "")
    .slice(-10);
const safeName = (s: string) =>
  s.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120) || "document";
const EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "text/csv": "csv",
  "application/xml": "xml",
  "text/xml": "xml",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xls",
};

async function downloadMedia(
  mediaId: string,
  token: string,
): Promise<{ bytes: Uint8Array; mime: string }> {
  const meta = await fetch(`${GRAPH}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!meta.ok) throw new Error(`media lookup ${meta.status}`);
  const info = (await meta.json()) as {
    url?: string;
    mime_type?: string;
    file_size?: number;
  };
  if (!info.url) throw new Error("media url missing");
  if ((info.file_size ?? 0) > 25 * 1024 * 1024)
    throw new Error("media larger than 25 MB");
  const file = await fetch(info.url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!file.ok) throw new Error(`media download ${file.status}`);
  return {
    bytes: new Uint8Array(await file.arrayBuffer()),
    mime: info.mime_type ?? "application/octet-stream",
  };
}

async function matchClient(
  db: Db,
  firmId: string,
  from: string,
): Promise<string | null> {
  const want = last10(from);
  if (want.length < 10) return null;
  const { data } = await db
    .from("ca_clients")
    .select("business_id, client_phone")
    .eq("ca_firm_id", firmId)
    .not("client_phone", "is", null);
  // Only a number that belongs to exactly one client files automatically.
  const hits = [
    ...new Set(
      (data ?? [])
        .filter((c) => last10(c.client_phone) === want && c.business_id)
        .map((c) => c.business_id as string),
    ),
  ];
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) return null;
  const { data: chase } = await db
    .from("ca_document_requests")
    .select("business_id, contact_phone")
    .eq("ca_firm_id", firmId)
    .eq("status", "open")
    .not("contact_phone", "is", null);
  const chaseHits = [
    ...new Set(
      (chase ?? [])
        .filter((c) => last10(c.contact_phone) === want && c.business_id)
        .map((c) => c.business_id as string),
    ),
  ];
  return chaseHits.length === 1 ? chaseHits[0] : null;
}

const snippet = (s: string) => (s.length > 140 ? `${s.slice(0, 137)}...` : s).replace(/\s+/g, " ");

/** Delivery receipts for chases we sent: sent, delivered, read or failed. */
async function handleStatuses(db: Db, firmId: string, statuses: WaStatus[]) {
  for (const st of statuses) {
    if (!isWaDelivery(st.status)) continue;
    const { data: ev } = await db
      .from("ca_chaser_events")
      .select("id, chaser_id, business_id, metadata")
      .eq("ca_firm_id", firmId)
      .eq("event_type", "sent")
      .eq("metadata->>wamid", st.id)
      .limit(1)
      .maybeSingle();
    if (!ev) continue;
    const meta = (ev.metadata ?? {}) as Record<string, unknown>;
    const from = isWaDelivery(meta["delivery"]) ? (meta["delivery"] as WaDelivery) : null;
    // Receipts can arrive out of order or twice; only ever move forward.
    if (!advances(from, st.status)) continue;
    const err = st.errors?.[0];
    const why = st.status === "failed" ? explainWaError(err?.code, err?.error_data?.details ?? err?.message) : null;
    await db
      .from("ca_chaser_events")
      .update({ metadata: { ...meta, delivery: st.status, ...(why ? { failure: why.message, code: err?.code ?? null } : {}) } })
      .eq("id", ev.id);
    if (st.status === "sent") continue;
    await chaserEvent(db, {
      chaser_id: ev.chaser_id as string,
      ca_firm_id: firmId,
      business_id: (ev.business_id as string | null) ?? null,
      event_type: "whatsapp_status",
      channel: "whatsapp",
      note:
        st.status === "failed"
          ? `WhatsApp message not delivered: ${why!.message}`
          : st.status === "read"
            ? "WhatsApp message was read by the client"
            : "WhatsApp message delivered",
      metadata: { wamid: st.id, delivery: st.status },
    });
    if (st.status === "failed") {
      await db.from("ca_notifications").insert({
        ca_firm_id: firmId,
        business_id: (ev.business_id as string | null) ?? null,
        type: "whatsapp_failed",
        severity: "warning",
        title: "WhatsApp reminder not delivered",
        message: why!.message,
        is_read: false,
        metadata: { chaser_id: ev.chaser_id },
      });
    }
  }
}

/**
 * A text from a client with an open chase. STOP ends all reminders for that
 * client; anything else is logged for the team and gives the client two days
 * before the next automatic nudge, so nobody is chased straight after replying.
 */
async function handleText(db: Db, firmId: string, m: WaMessage): Promise<string> {
  const body = m.text?.body?.trim() ?? "";
  if (!body) return "ignored empty text";
  const businessId = await matchClient(db, firmId, m.from);
  if (!businessId) return "text from a number not matched to a client";
  const { data: seen } = await db
    .from("ca_chaser_events")
    .select("id")
    .eq("ca_firm_id", firmId)
    .eq("metadata->>wa_message_id", m.id)
    .limit(1)
    .maybeSingle();
  if (seen) return "duplicate delivery";
  const { data: chases } = await db
    .from("ca_document_requests")
    .select("id, next_follow_up_at")
    .eq("ca_firm_id", firmId)
    .eq("business_id", businessId)
    .eq("status", "open")
    .eq("managed_by", "practice");
  if (!chases?.length) return "text, no open chase";

  const kind = classifyInbound(body);
  const pause = new Date(Date.now() + 2 * 86_400_000).toISOString();
  if (kind === "stop") {
    await db.from("ca_clients").update({ do_not_disturb: true }).eq("ca_firm_id", firmId).eq("business_id", businessId);
  }
  for (const c of chases) {
    if (kind === "reply" && c.next_follow_up_at && c.next_follow_up_at > pause) {
      /* already later than the pause */
    } else if (kind === "reply") {
      await db.from("ca_document_requests").update({ next_follow_up_at: pause }).eq("id", c.id);
    }
    await chaserEvent(db, {
      chaser_id: c.id as string,
      ca_firm_id: firmId,
      business_id: businessId,
      event_type: kind === "stop" ? "client_stopped" : "client_replied",
      channel: "whatsapp",
      note:
        kind === "stop"
          ? `Client asked to stop reminders on WhatsApp: "${snippet(body)}". Reminders are off for this client.`
          : `Client replied on WhatsApp: "${snippet(body)}". Next automatic reminder is paused for two days.`,
      metadata: { wa_message_id: m.id, wa_from: m.from },
    });
  }
  await db.from("ca_notifications").insert({
    ca_firm_id: firmId,
    business_id: businessId,
    type: kind === "stop" ? "whatsapp_stop" : "whatsapp_reply",
    severity: kind === "stop" ? "warning" : "info",
    title: kind === "stop" ? "Client asked to stop reminders" : "Client replied on WhatsApp",
    message: `"${snippet(body)}"`,
    is_read: false,
    metadata: { wa_message_id: m.id },
  });
  return kind === "stop" ? "client opted out" : "reply logged";
}

export async function handleWhatsappWebhook(payload: {
  entry?: { changes?: WaChange[] }[];
}) {
  const token = env("WHATSAPP_ACCESS_TOKEN");
  const db = await adminDb();
  const results: { message: string; status: string }[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value ?? {};
      const phoneNumberId = v.metadata?.phone_number_id;
      if (!phoneNumberId || (!v.messages?.length && !v.statuses?.length)) continue;
      const { data: channel } = await db
        .from("ca_whatsapp_channels")
        .select("ca_firm_id")
        .eq("phone_number_id", phoneNumberId)
        .eq("is_active", true)
        .maybeSingle();
      if (!channel) {
        results.push({
          message: "-",
          status: `no firm for number ${phoneNumberId}`,
        });
        continue;
      }
      // Receipts for what we already sent are recorded even when the firm is paused.
      if (v.statuses?.length) await handleStatuses(db, channel.ca_firm_id, v.statuses).catch((e) => console.error(`[fyn:whatsapp] status: ${(e as Error).message}`));
      if (!v.messages?.length) continue;
      if (!(await (await import("./billing.server")).firmCanWork(db, channel.ca_firm_id))) {
        results.push({ message: "-", status: "firm paused: trial or plan ended" });
        continue;
      }
      await db
        .from("ca_whatsapp_channels")
        .update({ last_message_at: new Date().toISOString() })
        .eq("phone_number_id", phoneNumberId);

      for (const m of v.messages) {
        if (m.type === "text") {
          try {
            results.push({ message: m.id, status: await handleText(db, channel.ca_firm_id, m) });
          } catch (e) {
            console.error(`[fyn:whatsapp] ${m.id}: ${(e as Error).message}`);
            results.push({ message: m.id, status: `failed: ${(e as Error).message}` });
          }
          continue;
        }
        const media =
          m.type === "document"
            ? m.document
            : m.type === "image"
              ? m.image
              : undefined;
        if (!media) {
          results.push({ message: m.id, status: `ignored ${m.type}` });
          continue;
        }
        if (!token) {
          results.push({
            message: m.id,
            status: "WHATSAPP_ACCESS_TOKEN not set",
          });
          continue;
        }
        const { data: seen } = await db
          .from("ca_document_extractions")
          .select("id")
          .eq("wa_message_id", m.id)
          .maybeSingle();
        if (seen) {
          results.push({ message: m.id, status: "duplicate delivery" });
          continue;
        }
        try {
          const { bytes, mime } = await downloadMedia(media.id, token);
          const businessId = await matchClient(db, channel.ca_firm_id, m.from);
          const baseName =
            m.type === "document" && m.document?.filename
              ? m.document.filename
              : `whatsapp_${m.id.slice(-8)}.${EXT[mime] ?? "bin"}`;
          const path = `${channel.ca_firm_id}/${businessId ?? "unassigned"}/whatsapp/${Date.now()}_${safeName(baseName)}`;
          const { error: upErr } = await db.storage
            .from(BUCKET)
            .upload(path, bytes, { contentType: mime, upsert: false });
          if (upErr) throw new Error(`storage: ${upErr.message}`);
          const profile =
            v.contacts?.find((c) => c.wa_id === m.from)?.profile?.name ?? null;
          const res = await registerDocument(
            db,
            { firmId: channel.ca_firm_id, userId: null },
            {
              storage_path: path,
              filename: baseName,
              mime,
              business_id: businessId,
              channel: "WhatsApp",
              wa_message_id: m.id,
              process: false,
              source_metadata: {
                wa_message_id: m.id,
                wa_from: m.from,
                wa_media_id: media.id,
                wa_timestamp: m.timestamp ?? null,
                sender_name: profile,
                caption: media.caption ?? null,
              },
            },
          );
          await logActivity(
            db,
            channel.ca_firm_id,
            businessId,
            "extract",
            `${baseName} received on WhatsApp from ${profile ?? m.from}${businessId ? "" : " (sender not matched to a client yet)"}.`,
          );
          if (!businessId) {
            await db.from("ca_notifications").insert({
              ca_firm_id: channel.ca_firm_id,
              type: "whatsapp_unassigned",
              severity: "warning",
              title: "Unassigned WhatsApp document",
              message: `${baseName} arrived from ${m.from}. Assign it to a client in Documents.`,
              is_read: false,
              metadata: { extraction_id: res.extraction_id },
            });
          }
          results.push({
            message: m.id,
            status: res.duplicate ? "duplicate file" : "queued",
          });
        } catch (e) {
          console.error(`[fyn:whatsapp] ${m.id}: ${(e as Error).message}`);
          results.push({
            message: m.id,
            status: `failed: ${(e as Error).message}`,
          });
        }
      }
    }
  }
  return results;
}

export async function whatsappStatus(db: Db, ctx: FirmContext) {
  const { data } = await db
    .from("ca_whatsapp_channels")
    .select(
      "phone_number_id, display_phone, is_active, last_message_at, created_at",
    )
    .eq("ca_firm_id", ctx.firmId);
  return {
    configured: {
      access_token: Boolean(env("WHATSAPP_ACCESS_TOKEN")),
      app_secret: Boolean(env("WHATSAPP_APP_SECRET")),
      verify_token: Boolean(env("WHATSAPP_VERIFY_TOKEN")),
    },
    webhook_path: "/api/public/whatsapp-webhook",
    channels: data ?? [],
    // Messages can go out through the API (not just open wa.me) when a token and an active number exist.
    send_ready: Boolean(env("WHATSAPP_ACCESS_TOKEN")) && (data ?? []).some((c) => c.is_active),
  };
}

export interface WaHealthStep {
  label: string;
  ok: boolean | null;
  detail: string;
}

/** Checks each link in the chain for real and says which one is broken. */
export async function whatsappHealth(db: Db, ctx: FirmContext): Promise<{ ok: boolean; steps: WaHealthStep[] }> {
  const steps: WaHealthStep[] = [];
  const token = env("WHATSAPP_ACCESS_TOKEN");
  steps.push({ label: "Access token", ok: Boolean(token), detail: token ? "Set on the server." : "WHATSAPP_ACCESS_TOKEN is not set." });
  steps.push({ label: "Webhook secret", ok: Boolean(env("WHATSAPP_APP_SECRET")), detail: env("WHATSAPP_APP_SECRET") ? "Set." : "WHATSAPP_APP_SECRET is not set, so incoming messages and receipts are rejected." });
  steps.push({ label: "Verify token", ok: Boolean(env("WHATSAPP_VERIFY_TOKEN")), detail: env("WHATSAPP_VERIFY_TOKEN") ? "Set." : "WHATSAPP_VERIFY_TOKEN is not set, so Meta cannot confirm the webhook." });
  const { data: ch } = await db.from("ca_whatsapp_channels").select("phone_number_id, display_phone").eq("ca_firm_id", ctx.firmId).eq("is_active", true).limit(1).maybeSingle();
  steps.push({ label: "Number linked", ok: Boolean(ch), detail: ch ? `Phone number ID ${ch.phone_number_id}.` : "Link the number's Phone number ID above." });
  if (token && ch) {
    try {
      const r = await fetch(`${GRAPH}/${ch.phone_number_id}?fields=display_phone_number,verified_name,quality_rating`, { headers: { Authorization: `Bearer ${token}` } });
      const b = (await r.json().catch(() => ({}))) as { display_phone_number?: string; verified_name?: string; quality_rating?: string; error?: { code?: number; message?: string } };
      if (r.ok) {
        steps.push({ label: "Meta accepts the token and number", ok: true, detail: `${b.verified_name ?? "Number"} ${b.display_phone_number ?? ""}${b.quality_rating ? ` · quality ${b.quality_rating}` : ""}`.trim() });
      } else {
        steps.push({ label: "Meta accepts the token and number", ok: false, detail: explainWaError(b.error?.code, b.error?.message).message });
      }
    } catch (e) {
      steps.push({ label: "Meta accepts the token and number", ok: false, detail: `Could not reach Meta (${(e as Error).message}).` });
    }
  }
  const waba = env("WHATSAPP_WABA_ID");
  if (!waba) {
    steps.push({ label: `Template "${chaseTemplate()}"`, ok: null, detail: "Set WHATSAPP_WABA_ID to check that the template is approved." });
  } else if (token) {
    try {
      const r = await fetch(`${GRAPH}/${waba}/message_templates?name=${encodeURIComponent(chaseTemplate())}&fields=name,status,language`, { headers: { Authorization: `Bearer ${token}` } });
      const b = (await r.json().catch(() => ({}))) as { data?: { status: string; language: string }[]; error?: { message?: string } };
      const t = b.data?.find((x) => x.language === chaseTemplateLang()) ?? b.data?.[0];
      steps.push({
        label: `Template "${chaseTemplate()}"`,
        ok: r.ok && t?.status === "APPROVED",
        detail: !r.ok ? (b.error?.message ?? "Could not read templates.") : !t ? "No template with this name. Create it in WhatsApp Manager (4 body fields)." : `${t.status} (${t.language}).`,
      });
    } catch (e) {
      steps.push({ label: `Template "${chaseTemplate()}"`, ok: false, detail: `Could not reach Meta (${(e as Error).message}).` });
    }
  }
  return { ok: steps.every((s) => s.ok !== false), steps };
}

export async function connectWhatsappNumber(
  db: Db,
  ctx: FirmContext,
  phoneNumberId: string,
  displayPhone?: string,
) {
  if (!/^\d{6,20}$/.test(phoneNumberId))
    throw new PracticeError(
      "invalid",
      "The phone number ID is the numeric ID from Meta's WhatsApp Manager, not the phone number.",
    );
  const { data: existing } = await db
    .from("ca_whatsapp_channels")
    .select("ca_firm_id")
    .eq("phone_number_id", phoneNumberId)
    .maybeSingle();
  if (existing && existing.ca_firm_id !== ctx.firmId)
    throw new PracticeError(
      "conflict",
      "That WhatsApp number is connected to another practice.",
    );
  const { error } = await db.from("ca_whatsapp_channels").upsert(
    {
      ca_firm_id: ctx.firmId,
      phone_number_id: phoneNumberId,
      display_phone: displayPhone ?? null,
      is_active: true,
    },
    { onConflict: "phone_number_id" },
  );
  if (error) throw new PracticeError("db_error", error.message);
  return whatsappStatus(db, ctx);
}
