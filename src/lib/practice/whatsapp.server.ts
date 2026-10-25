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
import { advances, classifyInbound, explainWaError, isWaDelivery, parseJoinCode, phoneTail, pickAutoRoute, type WaDelivery } from "./whatsappFlow";
import { bindRoute, chaseTemplate, chaseTemplateLang, ensureJoinCode, firmCountryCode, resolveSender, sendPlainText, sharedDisplayNumber, sharedPhoneNumberId } from "./whatsappSend.server";
import { samePhone } from "./chaser/rules";

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

/**
 * On FynHelp's shared number: which firm a first-time sender belongs to, judged by the phone
 * numbers in the firms' client lists. Only firms that actually use the shared number count, and
 * only an unambiguous match is taken (and remembered for next time).
 */
async function autoRoute(db: Db, from: string): Promise<string | null> {
  const tail = phoneTail(from);
  if (!tail) return null;
  const { data } = await db.from("ca_clients").select("ca_firm_id").eq("phone_tail", tail).limit(20);
  const firms = [...new Set((data ?? []).map((r) => r.ca_firm_id as string))];
  const usingShared: string[] = [];
  for (const id of firms) if ((await resolveSender(db, id)).sender?.shared) usingShared.push(id);
  const firmId = pickAutoRoute(usingShared);
  if (firmId) await bindRoute(db, from, firmId, "auto");
  return firmId;
}

/**
 * Checks Meta's signature. FynHelp's own app secret is tried first; a number on a firm's own
 * Meta app is signed with that app's secret, found through the phone number ID in the payload.
 * The ID only selects which secret to test: without the real secret nothing verifies.
 */
export async function verifyWebhook(
  rawBody: string,
  header: string | null,
): Promise<{ configured: boolean; valid: boolean }> {
  const secrets: string[] = [];
  const global = env("WHATSAPP_APP_SECRET");
  if (global) secrets.push(global);
  try {
    const ids = new Set<string>();
    const body = JSON.parse(rawBody) as { entry?: { changes?: WaChange[] }[] };
    for (const e of body.entry ?? [])
      for (const c of e.changes ?? []) {
        const id = c.value?.metadata?.phone_number_id;
        if (id && /^\d{6,20}$/.test(id)) ids.add(id);
      }
    if (ids.size) {
      const db = await adminDb();
      const { data } = await db.from("ca_whatsapp_channels").select("app_secret_enc").in("phone_number_id", [...ids]).not("app_secret_enc", "is", null);
      const { decryptToken } = await import("@/lib/caGmail.server");
      for (const row of data ?? []) {
        try {
          secrets.push(await decryptToken(row.app_secret_enc as string));
        } catch {
          /* unreadable secret: skip */
        }
      }
    }
  } catch {
    /* not JSON or lookup failed: only the global secret applies */
  }
  if (!secrets.length) return { configured: false, valid: false };
  for (const sec of secrets) if (await verifySignature(rawBody, header, sec)) return { configured: true, valid: true };
  return { configured: true, valid: false };
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
  cc: string,
): Promise<string | null> {
  if (last10(from).length < 8) return null;
  const { data } = await db
    .from("ca_clients")
    .select("business_id, client_phone")
    .eq("ca_firm_id", firmId)
    .not("client_phone", "is", null);
  // Only a number that belongs to exactly one client files automatically.
  const hits = [
    ...new Set(
      (data ?? [])
        .filter((c) => samePhone(c.client_phone, from, cc) && c.business_id)
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
        .filter((c) => samePhone(c.contact_phone, from, cc) && c.business_id)
        .map((c) => c.business_id as string),
    ),
  ];
  return chaseHits.length === 1 ? chaseHits[0] : null;
}

const snippet = (s: string) => (s.length > 140 ? `${s.slice(0, 137)}...` : s).replace(/\s+/g, " ");

/** Delivery receipts for chases we sent: sent, delivered, read or failed. */
async function handleStatuses(db: Db, statuses: WaStatus[]) {
  for (const st of statuses) {
    if (!isWaDelivery(st.status)) continue;
    const { data: ev } = await db
      .from("ca_chaser_events")
      .select("id, chaser_id, ca_firm_id, business_id, metadata")
      .eq("event_type", "sent")
      .eq("metadata->>wamid", st.id)
      .limit(1)
      .maybeSingle();
    if (!ev) continue;
    const firmId = ev.ca_firm_id as string;
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
async function handleText(db: Db, firmId: string, m: WaMessage, cc: string): Promise<string> {
  const body = m.text?.body?.trim() ?? "";
  if (!body) return "ignored empty text";
  const businessId = await matchClient(db, firmId, m.from, cc);
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
      const sharedId = sharedPhoneNumberId();
      const { data: ownChannel } = await db
        .from("ca_whatsapp_channels")
        .select("ca_firm_id, access_token_enc")
        .eq("phone_number_id", phoneNumberId)
        .eq("is_active", true)
        .maybeSingle();
      const isShared = !ownChannel && Boolean(sharedId) && phoneNumberId === sharedId;
      if (!ownChannel && !isShared) {
        results.push({ message: "-", status: `no firm for number ${phoneNumberId}` });
        continue;
      }
      // Receipts for what we already sent are recorded even when the firm is paused.
      if (v.statuses?.length) await handleStatuses(db, v.statuses).catch((e) => console.error(`[fyn:whatsapp] status: ${(e as Error).message}`));
      if (!v.messages?.length) continue;

      // Who the messages belong to: the firm that owns this number, or, on FynHelp's shared
      // number, the firm each client's phone is linked to (by a past chase or a JOIN code).
      let numberToken = token;
      if (ownChannel?.access_token_enc) {
        try {
          numberToken = await (await import("@/lib/caGmail.server")).decryptToken(ownChannel.access_token_enc as string);
        } catch {
          numberToken = undefined;
        }
      }
      const groups = new Map<string, WaMessage[]>();
      if (ownChannel) {
        groups.set(ownChannel.ca_firm_id as string, v.messages);
      } else {
        for (const m of v.messages) {
          const code = m.type === "text" ? parseJoinCode(m.text?.body) : null;
          if (code) {
            const { data: f } = await db.from("ca_firms").select("id, firm_name").eq("whatsapp_join_code", code).maybeSingle();
            if (f && token) {
              await bindRoute(db, m.from, f.id as string, "join");
              await sendPlainText({ phoneNumberId, token }, m.from, `You are linked to ${f.firm_name}. Send your documents here, and we will pass them on.`);
              results.push({ message: m.id, status: "linked to firm by join code" });
            } else {
              results.push({ message: m.id, status: "unknown join code" });
            }
            continue;
          }
          const { data: route } = await db.from("ca_whatsapp_routes").select("ca_firm_id").eq("phone_key", m.from).maybeSingle();
          const fid = (route?.ca_firm_id as string | undefined) ?? (await autoRoute(db, m.from));
          if (!fid) {
            results.push({ message: m.id, status: "sender not linked to a firm on the shared number" });
            continue;
          }
          groups.set(fid, [...(groups.get(fid) ?? []), m]);
        }
      }

      for (const [firmId, messages] of groups) {
      const channel = { ca_firm_id: firmId };
      const token = numberToken;
      if (!(await (await import("./billing.server")).firmCanWork(db, channel.ca_firm_id))) {
        results.push({ message: "-", status: "firm paused: trial or plan ended" });
        continue;
      }
      await db
        .from("ca_whatsapp_channels")
        .update({ last_message_at: new Date().toISOString() })
        .eq("phone_number_id", phoneNumberId);

      const cc = await firmCountryCode(db, channel.ca_firm_id);
      // Any message from a client opens a 24-hour window in which we may reply with plain text.
      const heard = new Map<string, string>();
      for (const m of messages) {
        const at = m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : new Date().toISOString();
        if (!heard.has(m.from) || heard.get(m.from)! < at) heard.set(m.from, at);
      }
      await db
        .from("ca_whatsapp_contacts")
        .upsert(
          [...heard].map(([phone_key, last_inbound_at]) => ({ ca_firm_id: channel.ca_firm_id, phone_key, last_inbound_at })),
          { onConflict: "ca_firm_id,phone_key" },
        )
        .then((r) => r.error && console.error(`[fyn:whatsapp] contact window: ${r.error.message}`));

      for (const m of messages) {
        if (m.type === "text") {
          try {
            results.push({ message: m.id, status: await handleText(db, channel.ca_firm_id, m, cc) });
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
          const businessId = await matchClient(db, channel.ca_firm_id, m.from, cc);
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
  }
  return results;
}

export async function whatsappStatus(db: Db, ctx: FirmContext) {
  const { data } = await db
    .from("ca_whatsapp_channels")
    .select(
      "phone_number_id, display_phone, is_active, last_message_at, created_at, access_token_enc, app_secret_enc",
    )
    .eq("ca_firm_id", ctx.firmId);
  const r = await resolveSender(db, ctx.firmId);
  const sharedConfigured = r.sharedConfigured;
  return {
    configured: {
      access_token: Boolean(env("WHATSAPP_ACCESS_TOKEN")),
      app_secret: Boolean(env("WHATSAPP_APP_SECRET")),
      verify_token: Boolean(env("WHATSAPP_VERIFY_TOKEN")),
    },
    webhook_path: "/api/public/whatsapp-webhook",
    // Never send the stored token to the browser; say only that one is saved.
    channels: (data ?? []).map(({ access_token_enc, app_secret_enc, ...c }) => ({ ...c, has_own_token: Boolean(access_token_enc), has_own_secret: Boolean(app_secret_enc) })),
    // Messages go out through the API (not just open wa.me) when a sender can be resolved.
    send_ready: Boolean(r.sender) || r.test,
    /** A test account: WhatsApp messages are simulated unless they go to the team's own numbers. */
    test: r.test,
    /** The number in use: FynHelp's shared one or the firm's own. */
    sender: r.sender?.choice ?? null,
    sender_pref: r.pref,
    shared: {
      configured: sharedConfigured,
      // Which server settings are still missing, so Settings can say exactly what to add.
      missing: [
        ...(sharedPhoneNumberId() ? [] : ["WHATSAPP_DEFAULT_PHONE_NUMBER_ID"]),
        ...(env("WHATSAPP_ACCESS_TOKEN") ? [] : ["WHATSAPP_ACCESS_TOKEN"]),
      ],
      display: sharedDisplayNumber() ?? null,
      // The code clients send ("JOIN K7M2QX") to link their phone to this firm on the shared number.
      join_code: sharedConfigured ? await ensureJoinCode(db, ctx.firmId).catch(() => null) : null,
    },
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
  const r = await resolveSender(db, ctx.firmId);
  const sender = r.sender;
  steps.push({
    label: "Number in use",
    ok: Boolean(sender),
    detail: sender
      ? sender.shared
        ? `FynHelp's shared number${sharedDisplayNumber() ? ` (${sharedDisplayNumber()})` : ""}.`
        : "Your own number."
      : (r.reason ?? "No WhatsApp number is set up."),
  });
  const { data: ownRow } = await db.from("ca_whatsapp_channels").select("app_secret_enc").eq("ca_firm_id", ctx.firmId).eq("is_active", true).limit(1).maybeSingle();
  const hasSecret = Boolean(env("WHATSAPP_APP_SECRET")) || Boolean(ownRow?.app_secret_enc);
  steps.push({ label: "Webhook secret", ok: hasSecret, detail: hasSecret ? "Set." : "No app secret is set, so incoming messages and receipts are rejected." });
  steps.push({ label: "Verify token", ok: Boolean(env("WHATSAPP_VERIFY_TOKEN")), detail: env("WHATSAPP_VERIFY_TOKEN") ? "Set." : "WHATSAPP_VERIFY_TOKEN is not set, so Meta cannot confirm the webhook." });
  const token = sender?.token;
  if (sender && token) {
    try {
      const res = await fetch(`${GRAPH}/${sender.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`, { headers: { Authorization: `Bearer ${token}` } });
      const b = (await res.json().catch(() => ({}))) as { display_phone_number?: string; verified_name?: string; quality_rating?: string; error?: { code?: number; message?: string } };
      if (res.ok) {
        steps.push({ label: "Meta accepts the token and number", ok: true, detail: `${b.verified_name ?? "Number"} ${b.display_phone_number ?? ""}${b.quality_rating ? ` · quality ${b.quality_rating}` : ""}`.trim() });
      } else {
        steps.push({ label: "Meta accepts the token and number", ok: false, detail: explainWaError(b.error?.code, b.error?.message).message });
      }
    } catch (e) {
      steps.push({ label: "Meta accepts the token and number", ok: false, detail: `Could not reach Meta (${(e as Error).message}).` });
    }
  }
  const waba = sender?.wabaId;
  if (!waba) {
    steps.push({ label: `Template "${chaseTemplate()}"`, ok: null, detail: "Add the WhatsApp Business Account ID to check that the template is approved." });
  } else if (token) {
    try {
      const res = await fetch(`${GRAPH}/${waba}/message_templates?name=${encodeURIComponent(chaseTemplate())}&fields=name,status,language`, { headers: { Authorization: `Bearer ${token}` } });
      const b = (await res.json().catch(() => ({}))) as { data?: { status: string; language: string }[]; error?: { message?: string } };
      const t = b.data?.find((x) => x.language === chaseTemplateLang()) ?? b.data?.[0];
      steps.push({
        label: `Template "${chaseTemplate()}"`,
        ok: res.ok && t?.status === "APPROVED",
        detail: !res.ok ? (b.error?.message ?? "Could not read templates.") : !t ? "No template with this name. Create it in WhatsApp Manager (4 body fields)." : `${t.status} (${t.language}).`,
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
  opts: { accessToken?: string; wabaId?: string; appSecret?: string } = {},
) {
  if (!/^\d{6,20}$/.test(phoneNumberId))
    throw new PracticeError(
      "invalid",
      "The phone number ID is the numeric ID from Meta's WhatsApp Manager, not the phone number.",
    );
  if (phoneNumberId === sharedPhoneNumberId())
    throw new PracticeError("invalid", "That is FynHelp's own number. Choose \"FynHelp's number\" instead of linking it.");
  if (opts.wabaId && !/^\d{6,20}$/.test(opts.wabaId))
    throw new PracticeError("invalid", "The WhatsApp Business Account ID is a number from Meta's WhatsApp Manager.");
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
  let tokenEnc: string | null | undefined;
  if (opts.accessToken?.trim()) {
    // Prove the token and number belong together before saving anything.
    const t = opts.accessToken.trim();
    const check = await fetch(`${GRAPH}/${phoneNumberId}?fields=display_phone_number`, { headers: { Authorization: `Bearer ${t}` } }).catch(() => null);
    if (!check?.ok)
      throw new PracticeError("invalid", "Meta did not accept that access token for this phone number ID. Check both and try again.");
    tokenEnc = await (await import("@/lib/caGmail.server")).encryptToken(t);
  }
  const secretEnc = opts.appSecret?.trim() ? await (await import("@/lib/caGmail.server")).encryptToken(opts.appSecret.trim()) : undefined;
  const { error } = await db.from("ca_whatsapp_channels").upsert(
    {
      ca_firm_id: ctx.firmId,
      phone_number_id: phoneNumberId,
      display_phone: displayPhone ?? null,
      is_active: true,
      ...(tokenEnc !== undefined ? { access_token_enc: tokenEnc } : {}),
      ...(secretEnc !== undefined ? { app_secret_enc: secretEnc } : {}),
      ...(opts.wabaId ? { waba_id: opts.wabaId } : {}),
    },
    { onConflict: "phone_number_id" },
  );
  if (error) throw new PracticeError("db_error", error.message);
  return whatsappStatus(db, ctx);
}
