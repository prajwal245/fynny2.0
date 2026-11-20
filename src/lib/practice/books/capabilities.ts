/**
 * What each books system can really supply to the reviews, as the code reads it today. One table, so the screens, the readiness list and the
 * request to the client all say the same thing, and a gap is named instead of a connected badge implying everything arrives.
 *
 *  Tally connector (a program on the Tally PC, outbound only): the Day Book for each month, and each company's ledger names and groups.
 *    The sales and purchase registers and the GST ledger lines are read out of that same Day Book, so they arrive with it.
 *    It does NOT yet send the Trial Balance, the masters with GSTIN, PAN and the bill-wise flag, or the bill-wise outstanding report.
 *  Zoho Books (OAuth, read scopes settings, banking, accountants, invoices, bills): the books-side ledger of the linked bank account, and the open
 *    invoices and open bills (which is what bill-wise outstanding is). There is no Day Book in Zoho, and with the current scopes no contacts
 *    (GSTIN, PAN) or reports.
 *  Files: whatever the client or the team uploads.
 */
export type BooksSource = "tally" | "zoho" | "files";

export interface Supply {
  /** The readiness input this fills. */
  input: string;
  /** How it arrives: straight from the system, or read out of something that arrived. */
  via: "connector" | "api" | "derived";
  /** Month by month (needs a sync covering the month) or once. */
  scope: "monthly" | "once";
}

export const SUPPLY: Record<BooksSource, Supply[]> = {
  tally: [
    { input: "day_book", via: "connector", scope: "monthly" },
    { input: "registers", via: "derived", scope: "monthly" },
    { input: "gst_ledgers", via: "derived", scope: "monthly" },
  ],
  zoho: [{ input: "billwise_outstanding", via: "api", scope: "once" }],
  files: [],
};

/** What the system cannot send yet, and what would change that. Shown beside the connection so nobody assumes it is covered. */
export const GAPS: Record<BooksSource, { input: string; why: string }[]> = {
  tally: [
    { input: "tb_opening", why: "The connector does not send the Trial Balance yet. Export it from Tally (Display, Trial Balance, ledger-wise) or update the connector when that is added." },
    { input: "ledger_masters", why: "The connector sends ledger names and groups only, not GSTIN, PAN or the bill-wise flag." },
    { input: "billwise_outstanding", why: "The connector does not send the bill-wise outstanding report yet." },
  ],
  zoho: [
    { input: "day_book", why: "Zoho Books has no Day Book. It supplies the bank account's ledger, open invoices and open bills; the GST, TDS and opening-balance reviews need a Tally-style export." },
    { input: "registers", why: "Sales and purchase registers are not read from Zoho with the current permissions. Export them from Zoho Books." },
    { input: "ledger_masters", why: "Contacts with GSTIN and PAN need a Zoho permission FynHelp does not ask for yet (contacts, read)." },
    { input: "tb_opening", why: "The Trial Balance is a Zoho report, which FynHelp does not read yet. Export it from Zoho Books." },
  ],
  files: [],
};

/** The inputs a connection fills right now: a monthly one only when the sync reaches the month, a one-time one as soon as it has synced at all. */
export function suppliedNow(source: BooksSource, c: { connected: boolean; lastSyncedAt: string | null }, month: string): string[] {
  if (!c.connected || !c.lastSyncedAt) return [];
  const syncedMonth = c.lastSyncedAt.slice(0, 7);
  return SUPPLY[source].filter((s) => s.scope === "once" || syncedMonth >= month).map((s) => s.input);
}

export type ConnectionState = "none" | "waiting" | "live" | "stale" | "error";

/** One word for the bar: not connected, connected but silent, live, or live but not synced for a day. */
export function connectionState(c: { connected: boolean; online: boolean; lastSyncedAt: string | null; error?: string | null }, now = new Date()): ConnectionState {
  if (c.error) return "error";
  if (!c.connected) return "none";
  if (!c.online && !c.lastSyncedAt) return "waiting";
  if (!c.lastSyncedAt) return "waiting";
  return now.getTime() - Date.parse(c.lastSyncedAt) > 26 * 3_600_000 ? "stale" : "live";
}

export const SOURCE_LABEL: Record<BooksSource, string> = { tally: "Tally", zoho: "Zoho Books", files: "Files" };
