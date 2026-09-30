/**
 * WhatsApp Business Cloud API intake (official API only).
 *
 * Meta posts a webhook when a client sends a document or photo to the firm's
 * WhatsApp Business number. We verify the signature, download the media
 * immediately (media URLs expire within minutes), store it, and queue it for
 * the Extract agent. The sender's number is matched to a client; unknown
 * senders land as unassigned documents.
 */
import { adminDb, logActivity, type Db, type FirmContext } from "./db.server";
import { BUCKET, registerDocument } from "./documents.server";
import { PracticeError } from "./core";

const GRAPH = "https://graph.facebook.com/v21.0";

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
}

interface WaChange {
  value?: {
    metadata?: { phone_number_id?: string; display_phone_number?: string };
    contacts?: { wa_id?: string; profile?: { name?: string } }[];
    messages?: WaMessage[];
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
      if (!phoneNumberId || !v.messages?.length) continue;
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
      await db
        .from("ca_whatsapp_channels")
        .update({ last_message_at: new Date().toISOString() })
        .eq("phone_number_id", phoneNumberId);

      for (const m of v.messages) {
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
  };
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
