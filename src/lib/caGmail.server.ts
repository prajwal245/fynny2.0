/**
 * Gmail intake — server-only helpers.
 *
 * Tokens are encrypted at rest with AES-GCM using GMAIL_ENCRYPTION_KEY.
 * Client identification runs here (server side) only, never in the browser.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { detectAmountPattern, normaliseAmount } from "@/lib/bankAmount";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = SupabaseClient<any, any, any>;

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
].join(" ");

const ALLOWED_ORIGINS = [
  "https://fynhelp.com",
  "https://www.fynhelp.com",
  "https://fynhelp.lovable.app",
  "http://localhost:8080",
];
const ORIGIN_PATTERNS = [/^https:\/\/[a-z0-9-]+\.lovable\.app$/i, /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/i];

export const CALLBACK_PATH = "/ca/integrations/gmail/callback";

/** This deployment's own origins: PUBLIC_APP_URL plus the ones Vercel sets. */
function deploymentOrigins(): string[] {
  const out: string[] = [];
  const app = process.env["PUBLIC_APP_URL"];
  if (app) {
    try {
      out.push(new URL(app).origin);
    } catch {
      /* not a URL; ignore */
    }
  }
  for (const host of [process.env["VERCEL_PROJECT_PRODUCTION_URL"], process.env["VERCEL_BRANCH_URL"], process.env["VERCEL_URL"]]) {
    if (host) out.push(`https://${host}`);
  }
  return out;
}

/** Only ever redirect Google back to one of our own origins. */
export function redirectUriFor(origin: string | null | undefined): string {
  const fallback = process.env["GMAIL_REDIRECT_URI"] ?? `https://fynhelp.com${CALLBACK_PATH}`;
  if (!origin) return fallback;
  const ok =
    ALLOWED_ORIGINS.includes(origin) ||
    deploymentOrigins().includes(origin) ||
    ORIGIN_PATTERNS.some((re) => re.test(origin));
  return ok ? `${origin}${CALLBACK_PATH}` : fallback;
}

export function gmailCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env["GMAIL_CLIENT_ID"] ?? process.env["GOOGLE_OAUTH_CLIENT_ID"] ?? "";
  const clientSecret = process.env["GMAIL_CLIENT_SECRET"] ?? process.env["GOOGLE_OAUTH_CLIENT_SECRET"] ?? "";
  if (!clientId || !clientSecret) {
    throw new Error("GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET are not configured");
  }
  return { clientId, clientSecret };
}

/* ---------------- token encryption ---------------- */

async function aesKey(): Promise<CryptoKey> {
  const raw = process.env["GMAIL_ENCRYPTION_KEY"] ?? "";
  if (!raw) throw new Error("GMAIL_ENCRYPTION_KEY is not configured");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

export async function encryptToken(token: string): Promise<string> {
  const key = await aesKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(token)),
  );
  const out = new Uint8Array(iv.length + cipher.length);
  out.set(iv, 0);
  out.set(cipher, iv.length);
  return toB64(out);
}

export async function decryptToken(enc: string): Promise<string> {
  const key = await aesKey();
  const bytes = fromB64(enc);
  const iv = bytes.slice(0, 12);
  const cipher = bytes.slice(12);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return new TextDecoder().decode(plain);
}

/* ---------------- oauth ---------------- */

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

export async function exchangeCode(code: string, redirectUri: string): Promise<GoogleTokens> {
  const { clientId, clientSecret } = gmailCredentials();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const body = (await res.json()) as GoogleTokens & { error?: string; error_description?: string };
  if (!res.ok || body.error) throw new Error(body.error_description ?? body.error ?? "Token exchange failed");
  return body;
}

export async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  const { clientId, clientSecret } = gmailCredentials();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  const body = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || body.error || !body.access_token) return null;
  return { access_token: body.access_token, expires_in: body.expires_in ?? 3600 };
}

export async function fetchGmailAddress(accessToken: string): Promise<string> {
  const res = await fetch("https://www.googleapis.com/oauth2/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = (await res.json()) as { email?: string };
  if (!body.email) throw new Error("Could not read the Google account email");
  return body.email;
}

export async function revokeToken(accessToken: string): Promise<void> {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`, {
    method: "POST",
  }).catch(() => undefined);
}

/* ---------------- 5-layer client identification ---------------- */

export interface ClientMatch {
  businessId: string | null;
  method: "exact" | "learned" | "domain" | "name" | "gstin" | "none";
  confidence: number;
}

const GSTIN_RE = /[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}/;

export async function identifyClient(
  admin: Admin,
  firmId: string,
  senderEmail: string,
  senderName: string,
  subject: string,
): Promise<ClientMatch> {
  const domain = senderEmail.split("@")[1] ?? "";

  const { data: clients } = await admin
    .from("ca_clients")
    .select("business_id, client_email, client_name, gstin")
    .eq("ca_firm_id", firmId);
  const list = (clients ?? []).filter((c: any) => c.business_id);

  // Layer 1 — exact sender email on the client record.
  const exact = list.find((c: any) => (c.client_email ?? "").toLowerCase() === senderEmail.toLowerCase());
  if (exact) return { businessId: exact.business_id, method: "exact", confidence: 1 };

  // Layer 2 — a mapping a human already confirmed.
  const { data: learned } = await admin
    .from("ca_email_sender_mappings")
    .select("business_id")
    .eq("ca_firm_id", firmId)
    .eq("sender_email", senderEmail)
    .not("confirmed_at", "is", null)
    .maybeSingle();
  if (learned?.business_id) return { businessId: learned.business_id, method: "learned", confidence: 0.95 };

  // Layer 3 — unique domain match (skip shared providers — they match everyone).
  const SHARED_DOMAINS = new Set([
    "gmail.com", "googlemail.com", "yahoo.com", "yahoo.in", "yahoo.co.in",
    "outlook.com", "hotmail.com", "live.com", "rediffmail.com",
    "icloud.com", "me.com", "msn.com", "aol.com",
  ]);
  if (domain && !SHARED_DOMAINS.has(domain.toLowerCase())) {
    const domainMatches = list.filter(
      (c: any) => (c.client_email ?? "").split("@")[1]?.toLowerCase() === domain.toLowerCase(),
    );
    if (domainMatches.length === 1) {
      return { businessId: domainMatches[0].business_id, method: "domain", confidence: 0.75 };
    }
  }

  // Layer 4 — fuzzy sender-name match with Indian business name normalisation.
  const LEGAL_NOISE = /\b(pvt|private|limited|ltd|llp|llc|co|corp|corporation|enterprises|enterprise|trading|industries|solutions|services|group|associates|&|and)\b\.?/gi;
  const normaliseName = (name: string): string =>
    name.toLowerCase().replace(LEGAL_NOISE, " ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

  if (senderName) {
    const senderTokens = normaliseName(senderName).split(/\s+/).filter((t) => t.length > 2);
    let bestScore = 0;
    let bestId: string | null = null;
    for (const c of list) {
      const clientTokens = normaliseName(String(c.client_name ?? "")).split(/\s+/).filter((t) => t.length > 2);
      if (!clientTokens.length || !senderTokens.length) continue;
      const common = senderTokens.filter((t) => clientTokens.includes(t)).length;
      const total = new Set([...senderTokens, ...clientTokens]).size;
      const score = total > 0 ? common / total : 0;
      if (score > bestScore) {
        bestScore = score;
        bestId = c.business_id;
      }
    }
    if (bestScore >= 0.6 && bestId) {
      return { businessId: bestId, method: "name", confidence: Math.min(0.65, 0.4 + bestScore * 0.3) };
    }
  }

  // Layer 5 — GSTIN quoted in the subject line.
  const gstin = subject.match(GSTIN_RE)?.[0];
  if (gstin) {
    const byGstin = list.find((c: any) => (c.gstin ?? "").toUpperCase() === gstin);
    if (byGstin) return { businessId: byGstin.business_id, method: "gstin", confidence: 0.7 };
  }

  return { businessId: null, method: "none", confidence: 0 };
}

/* ---------------- deterministic CSV parsing (server side) ---------------- */

export interface ParsedRow {
  date: string;
  description: string;
  amount: number;
  direction: "debit" | "credit";
}

export function parseBankCsvText(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const sep = text.includes("\t") ? "\t" : text.includes("|") ? "|" : ",";
  let headerIdx = 0;
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    if (lines[i].split(sep).length >= 3) {
      headerIdx = i;
      break;
    }
  }
  const clean = (c: string) => c.replace(/^["']|["']$/g, "").trim();
  const headers = lines[headerIdx].split(sep).map(clean);
  const dataRows = lines.slice(headerIdx + 1).map((l) => l.split(sep).map(clean));
  const detected = detectAmountPattern(headers, dataRows.slice(0, 10));
  const dateIdx = headers.findIndex((h) => /date|dt|value date|transaction date/i.test(h));
  const descIdx = headers.findIndex((h) => /description|narration|particular|remarks|details|memo|note/i.test(h));

  const rows: ParsedRow[] = [];
  for (const cols of dataRows) {
    if (cols.length < 2) continue;
    const rawDate = dateIdx >= 0 ? cols[dateIdx] : "";
    const rawDesc = descIdx >= 0 ? cols[descIdx] : cols[1] ?? "";
    const signed = normaliseAmount(
      detected.amountIdx >= 0 ? cols[detected.amountIdx] : undefined,
      detected.typeIdx >= 0 ? cols[detected.typeIdx] : undefined,
      detected.debitIdx >= 0 ? cols[detected.debitIdx] : undefined,
      detected.creditIdx >= 0 ? cols[detected.creditIdx] : undefined,
    );
    if (signed === 0 && !rawDate) continue;
    rows.push({
      date: rawDate,
      description: rawDesc,
      amount: Math.abs(signed),
      direction: signed < 0 ? "debit" : "credit",
    });
  }
  return rows;
}

/**
 * Parse a Tally XML export byte buffer.
 * Returns rows in the same shape as parseBankCsvText so the poll route
 * does not need to know which parser was used.
 */
export function parseTallyXmlBytes(bytes: Uint8Array): ParsedRow[] {
  try {
    const text = new TextDecoder().decode(bytes);
    // DOMParser is unavailable in the server route, so extract Tally vouchers directly.
    const rows: ParsedRow[] = [];
    const voucherMatches = text.matchAll(/<VOUCHER[^>]*>([\s\S]*?)<\/VOUCHER>/gi);
    for (const voucher of voucherMatches) {
      const inner = voucher[1] ?? "";
      const dateMatch = inner.match(/<DATE>\s*([0-9]{8})\s*<\/DATE>/i);
      const narration = inner.match(/<NARRATION>\s*(.*?)\s*<\/NARRATION>/i)?.[1]
        ?? inner.match(/<VOUCHERTYPENAME>\s*(.*?)\s*<\/VOUCHERTYPENAME>/i)?.[1]
        ?? "";
      if (!dateMatch) continue;
      const raw = dateMatch[1];
      const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
      const ledgerAmounts = inner.matchAll(/<AMOUNT>\s*([-0-9.]+)\s*<\/AMOUNT>/gi);
      for (const ledgerAmount of ledgerAmounts) {
        const amount = Number.parseFloat(ledgerAmount[1] ?? "0");
        if (!Number.isFinite(amount) || amount === 0) continue;
        rows.push({
          date,
          description: narration,
          amount: Math.abs(amount),
          direction: amount < 0 ? "debit" : "credit",
        });
      }
    }
    return rows;
  } catch {
    return [];
  }
}

/** Confidence of a CSV extraction: how complete the parsed rows are. */
export function scoreRows(rows: ParsedRow[]): number {
  if (!rows.length) return 0;
  let filled = 0;
  let total = 0;
  for (const r of rows) {
    for (const v of [r.date, r.description, r.amount, r.direction]) {
      total += 1;
      if (v !== null && v !== undefined && String(v).trim() !== "") filled += 1;
    }
  }
  const completeness = total ? filled / total : 0;
  const volumeFactor = rows.length < 3 ? 0.9 : 1;
  return Math.round(completeness * volumeFactor * 100) / 100;
}

export function classifyByFilename(filename: string): "bank" | "invoice" | "expense" | "challan" | "other" {
  const f = filename.toLowerCase();
  if (/(statement|bank|passbook|acct|account)/.test(f)) return "bank";
  if (/(invoice|inv[-_ ]?\d|bill[-_ ]?to|sales)/.test(f)) return "invoice";
  if (/(expense|purchase|vendor|receipt|voucher)/.test(f)) return "expense";
  if (/(challan|gst|tds|itns|payment[-_ ]?ack)/.test(f)) return "challan";
  return "other";
}

/**
 * Recursively extract all attachments from a Gmail message payload.
 * Handles nested multipart/mixed, multipart/related and multipart/alternative
 * so attachments are found however deeply they are nested.
 */
export interface GmailAttachment {
  filename: string;
  mimeType: string;
  attachmentId: string;
  size: number;
}

export function extractAttachments(
  part: {
    filename?: string;
    mimeType?: string;
    body?: { attachmentId?: string; size?: number };
    parts?: unknown[];
  },
  depth = 0,
): GmailAttachment[] {
  if (depth > 6) return [];

  const results: GmailAttachment[] = [];

  const filename = (part.filename ?? "").trim();
  const attachmentId = part.body?.attachmentId;
  if (
    filename &&
    attachmentId &&
    (part.mimeType?.includes("pdf") ||
      part.mimeType?.includes("csv") ||
      part.mimeType?.includes("xml") ||
      part.mimeType?.includes("excel") ||
      part.mimeType?.includes("spreadsheet") ||
      part.mimeType?.startsWith("image/") ||
      part.mimeType === "application/octet-stream")
  ) {
    results.push({
      filename,
      mimeType: part.mimeType ?? "application/octet-stream",
      attachmentId,
      size: part.body?.size ?? 0,
    });
  }

  if (Array.isArray(part.parts)) {
    for (const child of part.parts) {
      results.push(...extractAttachments(child as Parameters<typeof extractAttachments>[0], depth + 1));
    }
  }

  return results;
}
