/**
 * Upload links: a client opens one from a WhatsApp reminder and sends their documents with no login.
 *
 * The URL carries a random token (https://fynhelp.com/u/<token>). Only its SHA-256 hash is stored.
 * A link is for one chase and one client, expires, and accepts a limited number of files. Files go
 * through the same pipeline as every other channel: stored, deduplicated by content, and read by
 * the Extract agent; the chase closes by itself when the document arrives.
 */
import { createHash, randomBytes } from "node:crypto";
import type { Db } from "./db.server";
import { BUCKET, registerDocument } from "./documents.server";
import { PracticeError } from "./core";

export const LINK_DAYS = 14;
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ALLOWED: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "text/csv": "csv",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(24).toString("base64url");
export const appOrigin = () => (process.env["PUBLIC_APP_URL"] || "https://fynhelp.com").replace(/\/+$/, "");
export const uploadUrl = (token: string) => `${appOrigin()}/u/${token}`;

/** A new link for a chase. Returns the token (shown once, in the message) or null if it could not be made. */
export async function createUploadLink(
  db: Db,
  p: { firmId: string; businessId: string | null; requestId: string | null },
  now: Date = new Date(),
): Promise<{ token: string; url: string } | null> {
  const token = newToken();
  const { error } = await db.from("ca_upload_links").insert({
    token_hash: hashToken(token),
    ca_firm_id: p.firmId,
    business_id: p.businessId,
    request_id: p.requestId,
    expires_at: new Date(now.getTime() + LINK_DAYS * 86_400_000).toISOString(),
  });
  if (error) {
    console.error(`[upload-link] could not create: ${error.message}`);
    return null;
  }
  return { token, url: uploadUrl(token) };
}

interface LinkRow {
  id: string;
  ca_firm_id: string;
  business_id: string | null;
  request_id: string | null;
  expires_at: string;
  files_uploaded: number;
  max_files: number;
  revoked_at: string | null;
}

async function findLink(db: Db, token: string): Promise<LinkRow | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const { data } = await db
    .from("ca_upload_links")
    .select("id, ca_firm_id, business_id, request_id, expires_at, files_uploaded, max_files, revoked_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  return (data as LinkRow | null) ?? null;
}

export type LinkInfo =
  | { ok: true; firmName: string; clientName: string | null; items: string[]; filesLeft: number; expiresAt: string; resolved: boolean }
  | { ok: false; reason: "invalid" | "expired" | "full" };

/** What the page shows: who is asking, for what, and whether the link still works. Nothing else about the firm. */
export async function linkInfo(db: Db, token: string, now: Date = new Date()): Promise<LinkInfo> {
  const link = await findLink(db, token);
  if (!link || link.revoked_at) return { ok: false, reason: "invalid" };
  if (new Date(link.expires_at) <= now) return { ok: false, reason: "expired" };
  const filesLeft = Math.max(0, link.max_files - link.files_uploaded);
  const [{ data: firm }, { data: client }, { data: chase }] = await Promise.all([
    db.from("ca_firms").select("firm_name").eq("id", link.ca_firm_id).maybeSingle(),
    link.business_id ? db.from("ca_clients").select("client_name").eq("ca_firm_id", link.ca_firm_id).eq("business_id", link.business_id).maybeSingle() : Promise.resolve({ data: null }),
    link.business_id
      ? db.from("ca_document_requests").select("title, period, status").eq("ca_firm_id", link.ca_firm_id).eq("business_id", link.business_id).eq("status", "open").limit(5)
      : Promise.resolve({ data: [] }),
  ]);
  const items = (chase ?? []).map((c) => `${c.title}${c.period ? ` (${c.period})` : ""}`);
  if (filesLeft === 0) return { ok: false, reason: "full" };
  return {
    ok: true,
    firmName: (firm?.firm_name as string | undefined) ?? "Your accountant",
    clientName: (client?.client_name as string | undefined) ?? null,
    items,
    filesLeft,
    expiresAt: link.expires_at,
    resolved: items.length === 0,
  };
}

const safeName = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120) || "document";

/** True when the bytes start like the type the client says they are (a renamed .exe is not a PDF). */
export function looksLike(mime: string, b: Uint8Array): boolean {
  const starts = (...sig: number[]) => sig.every((v, i) => b[i] === v);
  switch (mime) {
    case "application/pdf":
      return starts(0x25, 0x50, 0x44, 0x46);
    case "image/jpeg":
      return starts(0xff, 0xd8, 0xff);
    case "image/png":
      return starts(0x89, 0x50, 0x4e, 0x47);
    case "image/webp":
      return starts(0x52, 0x49, 0x46, 0x46);
    case "image/heic":
      return b.length > 12 && String.fromCharCode(...b.slice(4, 8)) === "ftyp";
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return starts(0x50, 0x4b);
    case "application/vnd.ms-excel":
      return starts(0xd0, 0xcf, 0x11, 0xe0) || b.length > 0;
    case "text/csv":
      return !b.slice(0, 512).includes(0);
    default:
      return false;
  }
}

export type UploadResult = { ok: true; duplicate: boolean; filesLeft: number } | { ok: false; reason: "invalid" | "expired" | "full" | "type" | "size" | "empty" | "failed"; message: string };

const MESSAGES = {
  invalid: "This link is not valid. Ask your accountant to send a new one.",
  expired: "This link has expired. Ask your accountant to send a new one.",
  full: "This link has reached its limit of files. Ask your accountant for a new one.",
  type: "We can read PDF, photos (JPG, PNG, WebP, HEIC), Excel and CSV files. Please choose one of those.",
  size: "That file is larger than 15 MB. Please send a smaller or compressed copy.",
  empty: "That file is empty.",
  failed: "We could not save that file. Please try again.",
} as const;

/** Takes one file from the page. Every check happens here, on the server. */
export async function acceptUpload(
  db: Db,
  token: string,
  file: { name: string; mime: string; bytes: Uint8Array },
  now: Date = new Date(),
): Promise<UploadResult> {
  const fail = (reason: keyof typeof MESSAGES): UploadResult => ({ ok: false, reason, message: MESSAGES[reason] });
  const link = await findLink(db, token);
  if (!link || link.revoked_at) return fail("invalid");
  if (new Date(link.expires_at) <= now) return fail("expired");
  if (link.files_uploaded >= link.max_files) return fail("full");
  const mime = file.mime.toLowerCase().split(";")[0].trim();
  if (!ALLOWED[mime] || !looksLike(mime, file.bytes)) return fail("type");
  if (file.bytes.length === 0) return fail("empty");
  if (file.bytes.length > MAX_FILE_BYTES) return fail("size");

  const { data: took } = await db.rpc("ca_upload_link_take", { p_link: link.id });
  if (!took) return fail("full");

  const baseName = safeName(file.name || `upload.${ALLOWED[mime]}`);
  const path = `${link.ca_firm_id}/${link.business_id ?? "unassigned"}/upload-link/${Date.now()}_${baseName}`;
  try {
    const { error: upErr } = await db.storage.from(BUCKET).upload(path, file.bytes, { contentType: mime, upsert: false });
    if (upErr) throw new Error(upErr.message);
    const res = await registerDocument(
      db,
      { firmId: link.ca_firm_id, userId: null },
      {
        storage_path: path,
        filename: baseName,
        mime,
        business_id: link.business_id,
        channel: "Upload link",
        request_id: link.request_id,
        process: false,
        source_metadata: { upload_link_id: link.id },
      },
    );
    const { logActivity } = await import("./db.server");
    await logActivity(db, link.ca_firm_id, link.business_id, "extract", `${baseName} uploaded by the client through a secure link.`).catch(() => undefined);
    return { ok: true, duplicate: res.duplicate, filesLeft: Math.max(0, link.max_files - link.files_uploaded - 1) };
  } catch (e) {
    console.error(`[upload-link] ${(e as Error).message}`);
    // The file was not kept, so the slot goes back.
    await db.rpc("ca_upload_link_give_back", { p_link: link.id });
    if (e instanceof PracticeError) return { ok: false, reason: "failed", message: e.message };
    return fail("failed");
  }
}
