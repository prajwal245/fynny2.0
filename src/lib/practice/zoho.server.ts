/**
 * Zoho Books, read-only. A partner connects the Zoho login that can see the
 * clients' organisations; each client is linked to one Zoho bank account; a
 * sync reads that account's ledger for a month and files it as a books-side
 * document, so Extract, Recon and the MIS treat it like a Tally export.
 * FynHelp never writes to Zoho.
 */
import { PracticeError } from "./core";
import type { Db, FirmContext } from "./db.server";
import { BUCKET, processExtraction, registerDocument } from "./documents.server";

export const ZOHO_SCOPES = ["ZohoBooks.settings.READ", "ZohoBooks.banking.READ", "ZohoBooks.accountants.READ"].join(",");
export const ZOHO_CALLBACK_PATH = "/api/integrations/zoho/callback";
export const NONCE_COOKIE = "fh_zoho_nonce";

const ACCOUNTS_RE = /^https:\/\/accounts\.zoho\.(com|in|eu|com\.au|jp|ca|com\.cn|sa|uk)$/;
const API_RE = /^https:\/\/(www\.)?zohoapis\.(com|in|eu|com\.au|jp|ca|com\.cn|sa|uk)$/;

export function zohoConfigured(): boolean {
  return !!process.env["ZOHO_CLIENT_ID"] && !!process.env["ZOHO_CLIENT_SECRET"] && !!process.env["GMAIL_ENCRYPTION_KEY"];
}

function creds() {
  const clientId = process.env["ZOHO_CLIENT_ID"] ?? "";
  const clientSecret = process.env["ZOHO_CLIENT_SECRET"] ?? "";
  if (!clientId || !clientSecret) throw new PracticeError("not_configured", "Zoho Books isn't switched on for FynHelp yet.");
  return { clientId, clientSecret };
}

/** Where people sign in to Zoho first. Indian accounts by default; Zoho sends other regions back with their own server. */
export const defaultAccountsServer = () => process.env["ZOHO_ACCOUNTS_URL"] ?? "https://accounts.zoho.in";
export const redirectUri = () => process.env["ZOHO_REDIRECT_URI"] ?? `https://www.fynhelp.com${ZOHO_CALLBACK_PATH}`;

/** Only Zoho's own servers (or the configured test server) ever receive the client secret or tokens. */
export function trustedAccountsServer(url: string | null | undefined): string | null {
  const u = (url ?? "").replace(/\/+$/, "");
  return ACCOUNTS_RE.test(u) || u === defaultAccountsServer() ? u : null;
}
function trustedApiDomain(url: string | null | undefined): string | null {
  const u = (url ?? "").replace(/\/+$/, "");
  return API_RE.test(u) || (!!process.env["ZOHO_API_DOMAIN"] && u === process.env["ZOHO_API_DOMAIN"]) ? u : null;
}

/* ── signed state: binds the Zoho consent to this firm, user and browser ── */

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function hmac(text: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(`zoho-state:${creds().clientSecret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text))));
}

export function newNonce(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(24)));
}

export async function signState(firmId: string, userId: string, nonce: string): Promise<string> {
  const body = b64url(new TextEncoder().encode(JSON.stringify({ f: firmId, u: userId, n: nonce, t: Date.now() })));
  return `${body}.${await hmac(body)}`;
}

export async function verifyState(state: string, nonce: string | undefined): Promise<{ firmId: string; userId: string }> {
  const [body, sig] = state.split(".");
  if (!body || !sig || sig !== (await hmac(body))) throw new PracticeError("bad_state", "The Zoho sign-in could not be verified. Start again from Settings.");
  const p = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/"))) as { f: string; u: string; n: string; t: number };
  if (!nonce || p.n !== nonce) throw new PracticeError("bad_state", "The Zoho sign-in was started in a different browser. Start again from Settings.");
  if (Date.now() - p.t > 15 * 60_000) throw new PracticeError("bad_state", "The Zoho sign-in took too long. Start again from Settings.");
  return { firmId: p.f, userId: p.u };
}

export async function consentUrl(firmId: string, userId: string, nonce: string): Promise<string> {
  const q = new URLSearchParams({
    scope: ZOHO_SCOPES,
    client_id: creds().clientId,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    redirect_uri: redirectUri(),
    state: await signState(firmId, userId, nonce),
  });
  return `${defaultAccountsServer()}/oauth/v2/auth?${q}`;
}

/* ── tokens ─────────────────────────────────────────────── */

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  api_domain?: string;
  expires_in?: number;
  error?: string;
}

async function tokenCall(accountsServer: string, params: Record<string, string>): Promise<TokenResponse> {
  const { clientId, clientSecret } = creds();
  const q = new URLSearchParams({ ...params, client_id: clientId, client_secret: clientSecret });
  const res = await fetch(`${accountsServer}/oauth/v2/token?${q}`, { method: "POST" });
  const body = (await res.json().catch(() => ({}))) as TokenResponse;
  return res.ok ? body : { ...body, error: body.error ?? `http_${res.status}` };
}

const crypt = () => import("../caGmail.server");

/** Callback: swap the one-time code for tokens and store the connection. */
export async function completeConnect(db: Db, firmId: string, userId: string, code: string, accountsServerParam: string | null) {
  const accountsServer = trustedAccountsServer(accountsServerParam ?? defaultAccountsServer());
  if (!accountsServer) throw new PracticeError("bad_server", "Zoho sent us to an unknown sign-in server.");
  const t = await tokenCall(accountsServer, { grant_type: "authorization_code", code, redirect_uri: redirectUri() });
  if (t.error || !t.access_token) throw new PracticeError("zoho_token", `Zoho did not accept the sign-in (${t.error ?? "no token"}). Start again from Settings.`);
  if (!t.refresh_token) throw new PracticeError("zoho_token", "Zoho did not grant lasting access. Start again from Settings.");
  const apiDomain = trustedApiDomain(t.api_domain ?? "https://www.zohoapis.in");
  if (!apiDomain) throw new PracticeError("bad_server", "Zoho returned an unknown API address.");
  const { encryptToken } = await crypt();
  const row = {
    ca_firm_id: firmId,
    connected_by: userId,
    accounts_server: accountsServer,
    api_domain: apiDomain,
    refresh_token_enc: await encryptToken(t.refresh_token),
    access_token_enc: await encryptToken(t.access_token),
    access_expires_at: new Date(Date.now() + ((t.expires_in ?? 3600) - 120) * 1000).toISOString(),
    status: "connected",
    last_error: null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await db.from("ca_zoho_connections").upsert(row, { onConflict: "ca_firm_id" });
  if (error) throw new PracticeError("db_error", error.message);
}

interface Conn {
  id: string;
  ca_firm_id: string;
  accounts_server: string;
  api_domain: string;
  refresh_token_enc: string;
  access_token_enc: string | null;
  access_expires_at: string | null;
  status: string;
  last_error: string | null;
  created_at: string;
}

async function connection(db: Db, firmId: string): Promise<Conn | null> {
  const { data } = await db.from("ca_zoho_connections").select("*").eq("ca_firm_id", firmId).maybeSingle();
  return (data as Conn | null) ?? null;
}

async function requireConnection(db: Db, firmId: string): Promise<Conn> {
  const c = await connection(db, firmId);
  if (!c) throw new PracticeError("not_connected", "Connect Zoho Books in Settings first.");
  if (c.status !== "connected") throw new PracticeError("zoho_error", c.last_error ?? "Reconnect Zoho Books in Settings.");
  return c;
}

async function accessToken(db: Db, c: Conn, force = false): Promise<string> {
  const { decryptToken, encryptToken } = await crypt();
  if (!force && c.access_token_enc && c.access_expires_at && new Date(c.access_expires_at).getTime() > Date.now())
    return decryptToken(c.access_token_enc);
  const t = await tokenCall(c.accounts_server, { grant_type: "refresh_token", refresh_token: await decryptToken(c.refresh_token_enc) });
  if (!t.access_token) {
    // invalid_code here means the access was revoked in Zoho, or the password changed.
    const msg = t.error === "invalid_code" ? "Zoho access was removed. Reconnect Zoho Books in Settings." : `Zoho refused to refresh access (${t.error ?? "unknown"}).`;
    if (t.error === "invalid_code" || t.error === "invalid_client")
      await db.from("ca_zoho_connections").update({ status: "error", last_error: msg, updated_at: new Date().toISOString() }).eq("id", c.id);
    throw new PracticeError("zoho_token", msg);
  }
  const expires = new Date(Date.now() + ((t.expires_in ?? 3600) - 120) * 1000).toISOString();
  await db.from("ca_zoho_connections").update({ access_token_enc: await encryptToken(t.access_token), access_expires_at: expires }).eq("id", c.id);
  c.access_expires_at = expires;
  return t.access_token;
}

async function zohoGet<T>(db: Db, c: Conn, path: string, params: Record<string, string>): Promise<T> {
  const url = `${c.api_domain}/books/v3${path}?${new URLSearchParams(params)}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await accessToken(db, c, attempt > 0);
    const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
    if (res.status === 401 && attempt === 0) continue;
    const body = (await res.json().catch(() => ({}))) as { code?: number; message?: string } & T;
    if (res.status === 429) throw new PracticeError("zoho_limit", "Zoho's API limit for this organisation is reached. Try again in a few minutes.");
    if (!res.ok || (body.code !== undefined && body.code !== 0))
      throw new PracticeError("zoho_api", `Zoho Books: ${body.message ?? `HTTP ${res.status}`}`);
    return body;
  }
  throw new PracticeError("zoho_api", "Zoho Books did not accept FynHelp's access.");
}

/* ── what the firm can see ─────────────────────────────── */

export async function status(db: Db, ctx: FirmContext) {
  const c = await connection(db, ctx.firmId);
  const { data: links } = await db
    .from("ca_zoho_links")
    .select("id, business_id, organization_id, organization_name, account_id, account_name, last_synced_at, last_sync_note")
    .eq("ca_firm_id", ctx.firmId)
    .order("created_at");
  return {
    available: zohoConfigured(),
    connected: !!c && c.status === "connected",
    error: c?.status === "error" ? c.last_error : null,
    connectedAt: c?.created_at ?? null,
    links: links ?? [],
  };
}

export async function organizations(db: Db, ctx: FirmContext) {
  const c = await requireConnection(db, ctx.firmId);
  const r = await zohoGet<{ organizations?: { organization_id: string; name: string; gst_no?: string }[] }>(db, c, "/organizations", {});
  return (r.organizations ?? []).map((o) => ({ id: String(o.organization_id), name: o.name, gstin: o.gst_no ?? null }));
}

export async function bankAccounts(db: Db, ctx: FirmContext, organizationId: string) {
  const c = await requireConnection(db, ctx.firmId);
  const r = await zohoGet<{ bankaccounts?: { account_id: string; account_name: string; account_type?: string; account_number?: string; bank_name?: string; is_active?: boolean }[] }>(
    db, c, "/bankaccounts", { organization_id: organizationId },
  );
  return (r.bankaccounts ?? [])
    .filter((a) => a.is_active !== false)
    .map((a) => ({ id: String(a.account_id), name: a.account_name, type: a.account_type ?? "bank", number: a.account_number ?? null, bank: a.bank_name ?? null }));
}

export async function link(
  db: Db,
  ctx: FirmContext,
  l: { businessId: string; organizationId: string; organizationName: string; accountId: string; accountName: string },
) {
  await requireConnection(db, ctx.firmId);
  // Check the account really is in that organisation, as this login sees it.
  const accounts = await bankAccounts(db, ctx, l.organizationId);
  const acc = accounts.find((a) => a.id === l.accountId);
  if (!acc) throw new PracticeError("not_found", "That bank account isn't in the Zoho organisation any more.");
  const { error } = await db.from("ca_zoho_links").upsert(
    {
      ca_firm_id: ctx.firmId,
      business_id: l.businessId,
      organization_id: l.organizationId,
      organization_name: l.organizationName.slice(0, 200),
      account_id: l.accountId,
      account_name: acc.name.slice(0, 200),
      created_by: ctx.userId,
    },
    { onConflict: "ca_firm_id,business_id,account_id" },
  );
  if (error) throw new PracticeError("db_error", error.message);
  return { ok: true };
}

export async function unlink(db: Db, ctx: FirmContext, linkId: string) {
  await db.from("ca_zoho_links").delete().eq("id", linkId).eq("ca_firm_id", ctx.firmId);
  return { ok: true };
}

export async function disconnect(db: Db, ctx: FirmContext) {
  const c = await connection(db, ctx.firmId);
  if (c) {
    try {
      const { decryptToken } = await crypt();
      await fetch(`${c.accounts_server}/oauth/v2/token/revoke?${new URLSearchParams({ token: await decryptToken(c.refresh_token_enc) })}`, { method: "POST" });
    } catch {
      /* removed here either way; the person can also remove FynHelp in Zoho's Connected Apps */
    }
    await db.from("ca_zoho_links").delete().eq("ca_firm_id", ctx.firmId);
    await db.from("ca_zoho_connections").delete().eq("id", c.id);
  }
  return { ok: true };
}

/* ── sync: one month of a linked bank account's ledger ─── */

export interface LedgerLine {
  date: string; // YYYY-MM-DD
  particulars: string;
  type: string;
  number: string;
  moneyIn: number;
  moneyOut: number;
}

interface AccountTxn {
  transaction_date?: string;
  date?: string;
  transaction_type?: string;
  transaction_type_formatted?: string;
  payee?: string;
  customer_name?: string;
  vendor_name?: string;
  description?: string;
  offset_account_name?: string;
  reference_number?: string;
  entry_number?: string;
  transaction_number?: string;
  debit_amount?: number | string;
  credit_amount?: number | string;
  amount?: number | string;
  debit_or_credit?: string;
}

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};

/**
 * The bank account is an asset in the books: a debit is money into the bank,
 * a credit is money out, exactly as in a Tally bank ledger.
 */
export function ledgerLine(t: AccountTxn): LedgerLine | null {
  const date = (t.transaction_date ?? t.date ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  let moneyIn = num(t.debit_amount);
  let moneyOut = num(t.credit_amount);
  if (!moneyIn && !moneyOut) {
    const amt = Math.abs(num(t.amount));
    if (t.debit_or_credit === "debit") moneyIn = amt;
    else if (t.debit_or_credit === "credit") moneyOut = amt;
  }
  if (!moneyIn && !moneyOut) return null;
  const party = t.payee || t.customer_name || t.vendor_name || t.offset_account_name || "";
  const particulars = [party, t.description].filter((s) => s && s.trim()).join(" - ") || t.transaction_type_formatted || "Zoho entry";
  return {
    date,
    particulars: particulars.replace(/\s+/g, " ").trim().slice(0, 200),
    type: t.transaction_type_formatted || t.transaction_type || "",
    number: t.reference_number || t.entry_number || t.transaction_number || "",
    moneyIn,
    moneyOut,
  };
}

const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** Same columns as a Tally bank ledger export, which Extract already reads. */
export function ledgerCsv(lines: LedgerLine[]): string {
  const head = "Date,Particulars,Vch Type,Vch No.,Debit,Credit";
  const rows = lines.map((l) => {
    const [y, m, d] = l.date.split("-");
    return [`${d}-${m}-${y}`, csvCell(l.particulars), csvCell(l.type), csvCell(l.number), l.moneyIn ? l.moneyIn.toFixed(2) : "", l.moneyOut ? l.moneyOut.toFixed(2) : ""].join(",");
  });
  return [head, ...rows].join("\n") + "\n";
}

function monthRange(month: string): { start: string; end: string; label: string } {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) throw new PracticeError("bad_month", "Pick a month to sync.");
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const label = new Date(Date.UTC(y, mo - 1, 1)).toLocaleString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, "0")}`, label };
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>));
  return [...d].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sync(db: Db, ctx: FirmContext, linkId: string, month: string) {
  const { data: l } = await db.from("ca_zoho_links").select("*").eq("id", linkId).eq("ca_firm_id", ctx.firmId).maybeSingle();
  if (!l) throw new PracticeError("not_found", "That Zoho link no longer exists.");
  const c = await requireConnection(db, ctx.firmId);
  const { start, end, label } = monthRange(month);

  const lines: LedgerLine[] = [];
  for (let page = 1; page <= 50; page++) {
    const r = await zohoGet<{ chartofaccount_transactions?: AccountTxn[]; page_context?: { has_more_page?: boolean } }>(db, c, "/chartofaccounts/transactions", {
      organization_id: l.organization_id,
      account_id: l.account_id,
      "date.start": start,
      "date.end": end,
      page: String(page),
      per_page: "200",
    });
    for (const t of r.chartofaccount_transactions ?? []) {
      const line = ledgerLine(t);
      // Zoho's date filter is applied again here, so a month never takes in a neighbour's entries.
      if (line && line.date >= start && line.date <= end) lines.push(line);
    }
    if (!r.page_context?.has_more_page) break;
  }
  lines.sort((a, b) => a.date.localeCompare(b.date));
  const totalIn = lines.reduce((s, x) => s + x.moneyIn, 0);
  const totalOut = lines.reduce((s, x) => s + x.moneyOut, 0);
  const note = `${label}: ${lines.length} entr${lines.length === 1 ? "y" : "ies"}, in ₹${totalIn.toLocaleString("en-IN")}, out ₹${totalOut.toLocaleString("en-IN")}`;
  const touch = (n: string) =>
    db.from("ca_zoho_links").update({ last_synced_at: new Date().toISOString(), last_sync_note: n }).eq("id", l.id);

  if (!lines.length) {
    await touch(`${label}: no entries in Zoho for this account`);
    return { status: "empty" as const, entries: 0, note: `No entries in ${l.account_name} for ${label}.` };
  }

  const bytes = new TextEncoder().encode(ledgerCsv(lines));
  const hash = await sha256Hex(bytes);
  const path = `${ctx.firmId}/${l.business_id}/zoho/${l.id}-${month}.csv`;
  const filename = `Zoho Books - ${l.account_name.replace(/[\\/]/g, "-")} - ${label}.csv`.replace(/[:*?"<>|]/g, " ");
  const { data: prev } = await db.from("ca_document_extractions").select("id, content_hash").eq("ca_firm_id", ctx.firmId).eq("storage_path", path).maybeSingle();
  if (prev?.content_hash === hash) {
    await touch(`${note} (no change)`);
    return { status: "unchanged" as const, entries: lines.length, note: `No changes in Zoho since the last sync of ${label}.`, extractionId: prev.id };
  }
  const { error: upErr } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: "text/csv", upsert: true });
  if (upErr) throw new PracticeError("storage", upErr.message);

  let extractionId: string;
  if (prev) {
    // Same client, account and month: read the new version in place. Lines already matched stay matched.
    await db.from("ca_document_extractions").update({ content_hash: hash, original_filename: filename, extract_status: "queued", error_message: null }).eq("id", prev.id);
    await processExtraction(db, prev.id, { trigger: "channel", userId: ctx.userId });
    extractionId = prev.id;
  } else {
    const reg = await registerDocument(db, { firmId: ctx.firmId, userId: ctx.userId }, {
      storage_path: path,
      filename,
      mime: "text/csv",
      business_id: l.business_id,
      side: "books",
      channel: "Zoho Books",
      source_metadata: { zoho_organization: l.organization_name, zoho_account: l.account_name, month },
    });
    extractionId = reg.extraction_id;
  }
  await touch(note);
  return { status: "synced" as const, entries: lines.length, note, extractionId };
}
