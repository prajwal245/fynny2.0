/**
 * Zoho Books, read-only. A partner connects the Zoho login that can see the
 * clients' organisations; each client is linked to one Zoho bank account; a
 * sync reads that account's ledger for a month and files it as a books-side
 * document, so Extract, Recon and the MIS treat it like a Tally export.
 * Read-only by default. Posting (a bank charge, or a receipt for one named invoice) exists but is
 * off until the platform switch, the firm's write consent and the client's own switch are all on,
 * and then only for an entry a partner has previewed and approved. See docs/ZOHO_SETUP.md.
 */
import { PracticeError } from "./core";
import type { Db, FirmContext } from "./db.server";
import { BUCKET, processExtraction, registerDocument } from "./documents.server";
import {
  accountKind,
  CASH_HINT,
  expensePayload,
  paymentPayload,
  pickChargeAccount,
  alreadyInZoho,
  duplicateWindow,
  postable,
  preview,
  zohoErrorMessage,
  type BankTxn,
  type OpenInvoice,
} from "./zohoPosting";

const READ_SCOPES = ["ZohoBooks.settings.READ", "ZohoBooks.banking.READ", "ZohoBooks.accountants.READ", "ZohoBooks.invoices.READ"];
/** Asked for only when a partner chooses to let FynHelp create approved entries. */
const WRITE_SCOPES = ["ZohoBooks.expenses.CREATE", "ZohoBooks.expenses.DELETE", "ZohoBooks.customerpayments.CREATE", "ZohoBooks.customerpayments.DELETE"];
export const ZOHO_SCOPES = READ_SCOPES.join(",");
export const ZOHO_WRITE_SCOPES = [...READ_SCOPES, ...WRITE_SCOPES].join(",");

/** Platform switch: posting can be turned off for every firm at once without a deploy of code. */
export const postingAvailable = () => process.env["ZOHO_POSTING"] === "on";
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

export async function signState(firmId: string, userId: string, nonce: string, write = false): Promise<string> {
  const body = b64url(new TextEncoder().encode(JSON.stringify({ f: firmId, u: userId, n: nonce, t: Date.now(), w: write })));
  return `${body}.${await hmac(body)}`;
}

export async function verifyState(state: string, nonce: string | undefined): Promise<{ firmId: string; userId: string; write: boolean }> {
  const [body, sig] = state.split(".");
  if (!body || !sig || sig !== (await hmac(body))) throw new PracticeError("bad_state", "The Zoho sign-in could not be verified. Start again from Settings.");
  const p = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/"))) as { f: string; u: string; n: string; t: number; w?: boolean };
  if (!nonce || p.n !== nonce) throw new PracticeError("bad_state", "The Zoho sign-in was started in a different browser. Start again from Settings.");
  if (Date.now() - p.t > 15 * 60_000) throw new PracticeError("bad_state", "The Zoho sign-in took too long. Start again from Settings.");
  return { firmId: p.f, userId: p.u, write: p.w === true };
}

export async function consentUrl(firmId: string, userId: string, nonce: string, write = false): Promise<string> {
  const q = new URLSearchParams({
    scope: write ? ZOHO_WRITE_SCOPES : ZOHO_SCOPES,
    client_id: creds().clientId,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    redirect_uri: redirectUri(),
    state: await signState(firmId, userId, nonce, write),
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
export async function completeConnect(db: Db, firmId: string, userId: string, code: string, accountsServerParam: string | null, write = false) {
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
    write_enabled: write && postingAvailable(),
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
  write_enabled?: boolean;
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

const TIMEOUT_MS = 20_000;
function timeoutSignal(ms: number): { signal: AbortSignal; done: () => void } {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  return { signal: ctl.signal, done: () => clearTimeout(timer) };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One call to Zoho. A slow or failing Zoho never hangs a request: 20 s timeout, two retries with
 * a pause on rate limits and server errors, one token refresh on 401, and errors worded for people.
 */
async function zohoCall<T>(db: Db, c: Conn, method: "GET" | "POST" | "DELETE", path: string, params: Record<string, string>, body?: unknown): Promise<T> {
  const url = `${c.api_domain}/books/v3${path}?${new URLSearchParams(params)}`;
  let refreshed = false;
  let lastStatus = 0;
  for (let attempt = 0; attempt < 4; attempt++) {
    const token = await accessToken(db, c, refreshed);
    let res: Response;
    const guard = timeoutSignal(TIMEOUT_MS);
    try {
      res = await fetch(url, {
        method,
        headers: { Authorization: `Zoho-oauthtoken ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: guard.signal,
      });
    } catch (err) {
      guard.done();
      console.error("[zoho] request failed:", method, path, (err as Error).message);
      if (attempt < 2 && method === "GET") {
        await sleep(600 * (attempt + 1));
        continue;
      }
      throw new PracticeError("zoho_unreachable", "Zoho Books did not respond. Try again in a minute.");
    }
    guard.done();
    lastStatus = res.status;
    if (res.status === 401 && !refreshed) {
      refreshed = true;
      continue;
    }
    // Reads are safe to repeat. A write is never retried blindly: a repeat could create a second entry.
    if ((res.status === 429 || res.status >= 500) && method === "GET" && attempt < 2) {
      const wait = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(wait) && wait > 0 ? Math.min(wait, 5) * 1000 : 800 * (attempt + 1));
      continue;
    }
    const json = (await res.json().catch(() => ({}))) as { code?: number; message?: string } & T;
    if (!res.ok || (json.code !== undefined && json.code !== 0)) {
      const why = zohoErrorMessage(res.ok ? 400 : res.status, json.code, json.message);
      throw new PracticeError(res.status === 429 ? "zoho_limit" : "zoho_api", why);
    }
    return json;
  }
  throw new PracticeError("zoho_api", zohoErrorMessage(lastStatus || 401, undefined, undefined));
}

const zohoGet = <T>(db: Db, c: Conn, path: string, params: Record<string, string>) => zohoCall<T>(db, c, "GET", path, params);

/* ── what the firm can see ─────────────────────────────── */

export async function status(db: Db, ctx: FirmContext) {
  const c = await connection(db, ctx.firmId);
  const { data: links } = await db
    .from("ca_zoho_links")
    .select("id, business_id, organization_id, organization_name, account_id, account_name, last_synced_at, last_sync_note, posting_enabled")
    .eq("ca_firm_id", ctx.firmId)
    .order("created_at");
  return {
    available: zohoConfigured(),
    connected: !!c && c.status === "connected",
    error: c?.status === "error" ? c.last_error : null,
    connectedAt: c?.created_at ?? null,
    /** Platform switch (ZOHO_POSTING=on) and whether this firm has given Zoho's separate write consent. */
    postingAvailable: postingAvailable(),
    writeEnabled: !!c?.write_enabled,
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
  const rank = { bank: 0, card: 1, cash: 2 } as const;
  return (r.bankaccounts ?? [])
    .filter((a) => a.is_active !== false)
    .map((a) => {
      const kind = accountKind(a.account_type);
      return { id: String(a.account_id), name: a.account_name, kind, number: a.account_number ?? null, bank: a.bank_name ?? null, hint: kind === "cash" ? CASH_HINT : null };
    })
    .sort((a, b) => rank[a.kind] - rank[b.kind] || a.name.localeCompare(b.name));
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
  const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const note = `${label}: ${lines.length} entr${lines.length === 1 ? "y" : "ies"}, in ${rupees(totalIn)}, out ${rupees(totalOut)}`;
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

/* ── open invoices (read) ───────────────────────────────── */

interface ZohoInvoice {
  invoice_id: string;
  invoice_number: string;
  customer_id: string;
  customer_name: string;
  total: number;
  balance: number;
  due_date?: string;
  status: string;
}

async function linkOf(db: Db, ctx: FirmContext, linkId: string) {
  const { data: l } = await db.from("ca_zoho_links").select("*").eq("id", linkId).eq("ca_firm_id", ctx.firmId).maybeSingle();
  if (!l) throw new PracticeError("not_found", "That Zoho link no longer exists.");
  return l as { id: string; business_id: string; organization_id: string; account_id: string; account_name: string; posting_enabled: boolean };
}

/** Invoices that still have a balance (sent, overdue or part-paid). Drafts are not receivables yet and are left out. */
export async function openInvoices(db: Db, ctx: FirmContext, linkId: string): Promise<OpenInvoice[]> {
  const l = await linkOf(db, ctx, linkId);
  const c = await requireConnection(db, ctx.firmId);
  const out: OpenInvoice[] = [];
  for (let page = 1; page <= 25; page++) {
    const r = await zohoGet<{ invoices?: ZohoInvoice[]; page_context?: { has_more_page?: boolean } }>(db, c, "/invoices", {
      organization_id: l.organization_id,
      status: "unpaid",
      sort_column: "date",
      page: String(page),
      per_page: "200",
    });
    for (const i of r.invoices ?? [])
      if (i.status !== "draft" && num(i.balance) > 0)
        out.push({ id: String(i.invoice_id), number: i.invoice_number, customerId: String(i.customer_id), customer: i.customer_name, total: num(i.total), balance: num(i.balance), dueDate: i.due_date || null, status: i.status });
    if (!r.page_context?.has_more_page) break;
  }
  return out;
}

/* ── approved posting (opt-in, one entry at a time) ─────── */

const FALLBACK_CHARGE_HELP = "Zoho Books has no \"Bank Fees and Charges\" account. Add one under Chart of Accounts, then try again.";

async function requirePosting(db: Db, ctx: FirmContext, linkId: string) {
  if (!postingAvailable()) throw new PracticeError("posting_off", "Posting to Zoho Books is not switched on for FynHelp.");
  const c = await requireConnection(db, ctx.firmId);
  if (!c.write_enabled) throw new PracticeError("write_not_granted", "Allow FynHelp to create entries in Zoho Books first (Settings → Zoho Books).");
  const l = await linkOf(db, ctx, linkId);
  if (!l.posting_enabled) throw new PracticeError("posting_disabled", "Posting is off for this client. A partner can switch it on in Settings.");
  return { c, l };
}

export async function setPosting(db: Db, ctx: FirmContext, linkId: string, enabled: boolean) {
  const l = await linkOf(db, ctx, linkId);
  if (enabled) {
    if (!postingAvailable()) throw new PracticeError("posting_off", "Posting to Zoho Books is not switched on for FynHelp.");
    const c = await requireConnection(db, ctx.firmId);
    if (!c.write_enabled) throw new PracticeError("write_not_granted", "Allow FynHelp to create entries in Zoho Books first.");
  }
  await db.from("ca_zoho_links").update({ posting_enabled: enabled }).eq("id", l.id);
  return { ok: true };
}

/** The bank line as stored, never as the browser claims it: amount, date and narration come from the database. */
async function bankTxn(db: Db, ctx: FirmContext, linkBusiness: string, txnId: string): Promise<BankTxn> {
  const { data: t } = await db
    .from("ca_txns")
    .select("id, side, direction, amount, txn_date, description, reference, business_id, match_status")
    .eq("id", txnId)
    .eq("ca_firm_id", ctx.firmId)
    .maybeSingle();
  if (!t || t.business_id !== linkBusiness) throw new PracticeError("not_found", "That bank line is not for this client.");
  if (t.side !== "bank") throw new PracticeError("bad_txn", "Only bank lines can be posted.");
  if (t.match_status === "matched") throw new PracticeError("already_matched", "This line is already matched to an entry in the books.");
  return { id: t.id, date: String(t.txn_date).slice(0, 10), amount: Number(t.amount), direction: t.direction, description: t.description ?? "", reference: t.reference };
}

async function plan(db: Db, ctx: FirmContext, c: Conn, l: Awaited<ReturnType<typeof linkOf>>, txnId: string) {
  const t = await bankTxn(db, ctx, l.business_id, txnId);
  const invoices = t.direction === "in" ? await openInvoices(db, ctx, l.id) : [];
  const p = postable(t, invoices);
  if (p.kind === "none") throw new PracticeError("not_postable", p.why);
  // Ask Zoho itself whether this money is already recorded: a stale pull must never lead to a second entry.
  const win = duplicateWindow(t.date);
  const range = { organization_id: l.organization_id, date_start: win.start, date_end: win.end, per_page: "200" };
  const existing: { date: string; amount: number }[] = [];
  if (p.kind === "receipt") {
    const r = await zohoGet<{ customerpayments?: { date: string; amount: number }[] }>(db, c, "/customerpayments", { ...range, customer_id: p.invoice.customerId });
    for (const x of r.customerpayments ?? []) existing.push({ date: x.date, amount: num(x.amount) });
  } else {
    const r = await zohoGet<{ expenses?: { date: string; total?: number; amount?: number }[] }>(db, c, "/expenses", range);
    for (const x of r.expenses ?? []) existing.push({ date: x.date, amount: num(x.total ?? x.amount) });
  }
  const dup = alreadyInZoho(t, existing);
  if (dup) throw new PracticeError("already_in_zoho", `Zoho Books already has an entry of ₹${dup.amount.toLocaleString("en-IN")} on ${dup.date.slice(0, 10)}. Pull the month again so it matches, instead of posting.`);
  let chargeAccount: { id: string; name: string } | null = null;
  if (p.kind === "bank_charge") {
    const r = await zohoGet<{ chartofaccounts?: { account_id: string; account_name: string }[] }>(db, c, "/chartofaccounts", {
      organization_id: l.organization_id,
      filter_by: "AccountType.Expense",
      per_page: "200",
    });
    chargeAccount = pickChargeAccount(r.chartofaccounts ?? []);
    if (!chargeAccount) throw new PracticeError("no_charge_account", FALLBACK_CHARGE_HELP);
  }
  return { t, p, chargeAccount };
}

/** What posting would create, shown before anyone approves. Changes nothing. */
export async function previewPost(db: Db, ctx: FirmContext, linkId: string, txnId: string) {
  const { c, l } = await requirePosting(db, ctx, linkId);
  const { t, p, chargeAccount } = await plan(db, ctx, c, l, txnId);
  return preview(t, p, l.account_name, chargeAccount?.name);
}

export async function post(db: Db, ctx: FirmContext, linkId: string, txnId: string) {
  const { c, l } = await requirePosting(db, ctx, linkId);
  const { t, p, chargeAccount } = await plan(db, ctx, c, l, txnId);
  const view = preview(t, p, l.account_name, chargeAccount?.name);
  // Claim the line first. The partial unique index makes a second click or retry fail here, before Zoho is touched.
  const row = {
    ca_firm_id: ctx.firmId, link_id: l.id, business_id: l.business_id, txn_id: t.id, kind: p.kind, amount: t.amount, txn_date: t.date,
    summary: view.title, zoho_type: p.kind === "bank_charge" ? "expense" : "customerpayment", approved_by: ctx.userId,
  };
  const { data: claim, error: claimErr } = await db.from("ca_zoho_postings").insert(row).select("id").single();
  if (claimErr || !claim) throw new PracticeError("already_posted", "This bank line has already been posted to Zoho Books.");
  try {
    let zohoId: string;
    if (p.kind === "bank_charge") {
      const r = await zohoCall<{ expense?: { expense_id: string } }>(db, c, "POST", "/expenses", { organization_id: l.organization_id }, expensePayload(t, chargeAccount!.id, l.account_id));
      zohoId = String(r.expense?.expense_id ?? "");
    } else {
      const r = await zohoCall<{ payment?: { payment_id: string } }>(db, c, "POST", "/customerpayments", { organization_id: l.organization_id }, paymentPayload(t, p.invoice, l.account_id));
      zohoId = String(r.payment?.payment_id ?? "");
    }
    if (!zohoId) throw new PracticeError("zoho_api", "Zoho Books accepted the entry but did not return its id. Check Zoho before trying again.");
    await db.from("ca_zoho_postings").update({ status: "posted", zoho_id: zohoId, posted_at: new Date().toISOString() }).eq("id", claim.id);
    return { ok: true as const, postingId: claim.id as string, zohoId };
  } catch (e) {
    // If Zoho never answered, the entry may still have been created. Keep the claim (no retry) until a person checks Zoho.
    const unsure = e instanceof PracticeError && (e.code === "zoho_unreachable" || /did not return its id/.test(e.message));
    await db.from("ca_zoho_postings").update({ status: unsure ? "pending" : "failed", error: (e as Error).message.slice(0, 300) }).eq("id", claim.id);
    throw e;
  }
}

export async function undoPost(db: Db, ctx: FirmContext, postingId: string) {
  const { data: p } = await db.from("ca_zoho_postings").select("*").eq("id", postingId).eq("ca_firm_id", ctx.firmId).maybeSingle();
  if (!p || p.status !== "posted" || !p.zoho_id) throw new PracticeError("not_found", "There is nothing to undo for that entry.");
  const c = await requireConnection(db, ctx.firmId);
  if (!c.write_enabled) throw new PracticeError("write_not_granted", "Allow FynHelp to create entries in Zoho Books first.");
  const l = await linkOf(db, ctx, p.link_id);
  const path = p.zoho_type === "expense" ? `/expenses/${p.zoho_id}` : `/customerpayments/${p.zoho_id}`;
  try {
    await zohoCall(db, c, "DELETE", path, { organization_id: l.organization_id });
  } catch (e) {
    // Already deleted in Zoho by hand: the undo is done.
    if (!/not find|deleted/i.test((e as Error).message)) throw e;
  }
  await db.from("ca_zoho_postings").update({ status: "undone", undone_by: ctx.userId, undone_at: new Date().toISOString() }).eq("id", p.id);
  return { ok: true };
}

export async function listPostings(db: Db, ctx: FirmContext) {
  const { data } = await db
    .from("ca_zoho_postings")
    .select("id, business_id, kind, amount, txn_date, summary, status, error, created_at, posted_at, undone_at")
    .eq("ca_firm_id", ctx.firmId)
    .order("created_at", { ascending: false })
    .limit(30);
  return data ?? [];
}
