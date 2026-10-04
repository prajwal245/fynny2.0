/**
 * The decisions Gmail intake makes about one email, as pure functions so
 * every rule is tested on its own (tests/unit/practice/gmail-rules.test.ts).
 *
 * The server side (gmailIntake.server.ts) only fetches and stores; what to
 * take, what to skip and who sent it is decided here.
 */

export type GmailHeader = { name: string; value: string };
export type GmailPart = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { attachmentId?: string; size?: number; data?: string };
  parts?: GmailPart[];
};

/** Largest file the Extract agent will read (same limit as uploads and storage). */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const SUPPORTED_EXT = /\.(pdf|csv|tsv|txt|xls|xlsx|xml|jpe?g|png|webp|heic|heif)$/i;
// Not readable, but clients do send these: take them so the firm sees a clear
// "send it as PDF or Excel" message instead of the email silently vanishing.
const EXPLAINED_EXT = /\.(zip|rar|7z|docx?|odt)$/i;
const NEVER_EXT = /\.(ics|vcs|vcf|p7s|p7m|p7c|asc|sig|gpg|eml|msg|html?|gif|bmp|svg|mp3|mp4|mov|wav|exe|bat|js)$/i;
const NEVER_NAMES = /^(winmail\.dat|att\d*\.(htm|dat)|smime\.p7s)$/i;

export type PickedAttachment = {
  partId: string;
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string | null;
  /** Small attachments Gmail sends inline in the message itself (base64url). */
  inlineData: string | null;
};
export type SkippedAttachment = { partId: string; filename: string; reason: SkipReason };
export type SkipReason = "unsupported" | "signature_image" | "too_large" | "empty" | "system_file";

const header = (headers: GmailHeader[] | undefined, name: string) =>
  headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

function extFromMime(mime: string): string {
  if (mime.includes("pdf")) return ".pdf";
  if (mime.includes("png")) return ".png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return ".jpg";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("heic") || mime.includes("heif")) return ".heic";
  if (mime.includes("csv")) return ".csv";
  if (mime.includes("spreadsheetml")) return ".xlsx";
  if (mime.includes("ms-excel")) return ".xls";
  return "";
}

/**
 * Which attachments of an email are documents. Walks nested parts (forwarded
 * emails, attached .eml files) and drops what is never a client document:
 * signature logos, calendar invites, digital signatures, Outlook's winmail.dat.
 */
export function pickAttachments(payload: GmailPart): { take: PickedAttachment[]; skipped: SkippedAttachment[] } {
  const take: PickedAttachment[] = [];
  const skipped: SkippedAttachment[] = [];
  const walk = (part: GmailPart, depth: number) => {
    if (depth > 8) return;
    const mime = (part.mimeType ?? "").toLowerCase();
    const size = part.body?.size ?? 0;
    const hasBody = Boolean(part.body?.attachmentId || part.body?.data);
    let filename = (part.filename ?? "").trim();
    const disposition = header(part.headers, "Content-Disposition").toLowerCase();
    const isAttachmentPart = Boolean(filename) || disposition.startsWith("attachment");
    const partId = part.partId ?? String(take.length + skipped.length);

    if (isAttachmentPart && hasBody && !mime.startsWith("multipart/") && mime !== "message/rfc822") {
      // Phone mail apps sometimes attach a photo or PDF with no file name.
      if (!filename) filename = `attachment-${partId}${extFromMime(mime)}`;
      const isImage = mime.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(filename);
      const inline = disposition.startsWith("inline") || Boolean(header(part.headers, "Content-ID"));

      if (NEVER_NAMES.test(filename) || NEVER_EXT.test(filename) || mime === "text/calendar" || mime.includes("pkcs7")) {
        skipped.push({ partId, filename, reason: "system_file" });
      } else if (size === 0 && !part.body?.data) {
        skipped.push({ partId, filename, reason: "empty" });
      } else if (size > MAX_ATTACHMENT_BYTES) {
        skipped.push({ partId, filename, reason: "too_large" });
      } else if (isImage && (size < 12 * 1024 || (inline && size < 300 * 1024))) {
        // Logos and signature images: small, or embedded in the body. A real
        // photo of a bill is larger and attached, not inline.
        skipped.push({ partId, filename, reason: "signature_image" });
      } else if (SUPPORTED_EXT.test(filename) || EXPLAINED_EXT.test(filename) || extFromMime(mime)) {
        take.push({
          partId,
          filename: SUPPORTED_EXT.test(filename) || EXPLAINED_EXT.test(filename) ? filename : `${filename}${extFromMime(mime)}`,
          mimeType: mime || "application/octet-stream",
          size,
          attachmentId: part.body?.attachmentId ?? null,
          inlineData: part.body?.attachmentId ? null : (part.body?.data ?? null),
        });
      } else {
        skipped.push({ partId, filename, reason: "unsupported" });
      }
    }
    for (const child of part.parts ?? []) walk(child, depth + 1);
  };
  walk(payload, 0);
  return { take, skipped };
}

/** "Priya Rao <priya@x.in>", "priya@x.in", "<priya@x.in>" → { email, name }. */
export function parseAddress(value: string): { email: string; name: string } {
  const angle = value.match(/<([^<>\s]+@[^<>\s]+)>/);
  const bare = value.match(/([A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/);
  const email = (angle?.[1] ?? bare?.[1] ?? "").trim().toLowerCase();
  const name = value.replace(/<[^>]*>/, "").replace(/["']/g, "").trim();
  return { email, name: name.toLowerCase() === email ? "" : name };
}

/**
 * When someone at the firm forwards a client's email, the client is the
 * real sender. Reads the first "From:" after a forwarding marker (Gmail,
 * Outlook and Apple Mail formats).
 */
export function forwardedSender(text: string): string | null {
  const marker = text.search(/-{2,}\s*(forwarded message|original message)\s*-{2,}|^\s*begin forwarded message:|^\s*from:.*\n\s*(sent|date):/im);
  if (marker < 0) return null;
  const from = text.slice(marker).match(/^\s*\*?from:\*?\s*(.+)$/im);
  const email = from ? parseAddress(from[1]).email : "";
  return email || null;
}

/** Gmail's own verdict on whether the From address is genuine. */
export function senderVerdict(authenticationResults: string): "pass" | "fail" | "unknown" {
  const h = authenticationResults.toLowerCase();
  if (!h) return "unknown";
  if (/\bdmarc=fail\b/.test(h)) return "fail";
  const spfFail = /\bspf=(fail|softfail)\b/.test(h);
  const dkimPass = /\bdkim=pass\b/.test(h);
  if (spfFail && !dkimPass) return "fail";
  if (/\bdmarc=pass\b/.test(h) || dkimPass || /\bspf=pass\b/.test(h)) return "pass";
  return "unknown";
}

/**
 * Where to start looking. First check after connecting: the last 7 days, so
 * statements sent just before the firm connected are picked up. After that:
 * from the last complete check, with 6 hours of overlap (already-seen emails
 * are skipped), never more than 30 days back.
 */
export function windowStart(lastPolledAt: string | null, now: Date): Date {
  const day = 24 * 3600 * 1000;
  if (!lastPolledAt) return new Date(now.getTime() - 7 * day);
  const from = new Date(lastPolledAt).getTime() - 6 * 3600 * 1000;
  return new Date(Math.max(from, now.getTime() - 30 * day));
}

/** Emails received with attachments, excluding what the firm sent itself, drafts, spam and trash. */
export function searchQuery(since: Date): string {
  return `has:attachment after:${Math.floor(since.getTime() / 1000)} -from:me -in:sent -in:drafts -in:spam -in:trash -in:chats`;
}

/** Google's answer to a token refresh: revoked for good, or worth retrying. */
export function refreshFailure(status: number, body: { error?: string } | null): "revoked" | "transient" {
  const err = body?.error ?? "";
  if (err === "invalid_grant" || err === "unauthorized_client" || err === "invalid_client") return "revoked";
  if (status === 400 || status === 401) return err ? "revoked" : "transient";
  return "transient";
}

/** Decodes Gmail's base64url body data to bytes. */
export function base64UrlToBytes(data: string): Uint8Array {
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** The plain-text body of an email (for forwarded-sender detection). */
export function plainText(payload: GmailPart): string {
  let found = "";
  const walk = (p: GmailPart) => {
    if (found) return;
    if ((p.mimeType ?? "").toLowerCase() === "text/plain" && p.body?.data && !p.filename) {
      try {
        found = new TextDecoder().decode(base64UrlToBytes(p.body.data));
      } catch {
        /* unreadable body: no forwarded sender */
      }
      return;
    }
    for (const c of p.parts ?? []) walk(c);
  };
  walk(payload);
  return found.slice(0, 20000);
}

export { header as gmailHeader };
