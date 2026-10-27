/**
 * Pure rules for Zoho Books: how accounts are labelled, how Zoho's errors read to a
 * person, which open invoice a bank narration points at, and the two entries
 * FynHelp may post once a partner has approved them. No network here, so every rule
 * is tested on its own.
 *
 * Posting is deliberately narrow: a bank charge (as an expense) and a customer
 * receipt that names exactly one open invoice. Anything else stays a fix list.
 */

export type AccountKind = "bank" | "card" | "cash";

export function accountKind(zohoType: string | undefined): AccountKind {
  const t = (zohoType ?? "").toLowerCase();
  if (t.includes("credit")) return "card";
  if (t === "cash") return "cash";
  return "bank";
}

export const KIND_LABEL: Record<AccountKind, string> = { bank: "Bank", card: "Credit card", cash: "Cash account" };

/** A cash account such as Undeposited Funds holds receipts before they reach the bank: linking it and the bank double-counts. */
export const CASH_HINT = "Holds receipts before they reach the bank. Link the bank account instead unless this is the only place the client records money.";

/* ── Zoho's errors, in words a person can act on ─────────── */

export function zohoErrorMessage(status: number, code: number | undefined, message: string | undefined): string {
  if (status === 429) return "Zoho's API limit for this organisation is reached. Try again in a few minutes.";
  if (status === 401 || code === 57 || code === 14) return "Zoho Books has not allowed this yet. Reconnect Zoho Books in Settings to grant the permission.";
  if (status === 403) return "This Zoho login cannot do that in the organisation. Ask its admin for access.";
  if (status === 404) return "Zoho could not find that. It may have been deleted in Zoho Books.";
  if (status >= 500) return "Zoho Books is not responding right now. Try again in a minute.";
  return `Zoho Books: ${message || `HTTP ${status}`}`;
}

/* ── open invoices ───────────────────────────────────────── */

export interface OpenInvoice {
  id: string;
  number: string;
  customerId: string;
  customer: string;
  total: number;
  balance: number;
  dueDate: string | null;
  status: string;
}

const compact = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * The open invoice a bank narration names ("NEFT CR-KAVERI-INV-2601"), only when it
 * names exactly one and the money does not exceed what is still owed.
 */
export function invoiceHint(narration: string, amount: number, invoices: OpenInvoice[]): { invoice: OpenInvoice; fits: boolean } | null {
  const text = compact(narration);
  if (!text) return null;
  const named = invoices.filter((i) => {
    const n = compact(i.number);
    if (n.length < 4) return false;
    // "INV2601" must not match inside "INV26011": the next character may not continue the number.
    let at = text.indexOf(n);
    while (at !== -1) {
      const next = text[at + n.length] ?? "";
      if (!/[0-9]/.test(next)) return true;
      at = text.indexOf(n, at + 1);
    }
    return false;
  });
  if (named.length !== 1) return null;
  const invoice = named[0]!;
  return { invoice, fits: amount > 0 && amount <= invoice.balance + 0.005 };
}

/* ── what may be posted ──────────────────────────────────── */

export interface BankTxn {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number;
  direction: "in" | "out";
  description: string;
  reference?: string | null;
}

export const BANK_CHARGE_LIMIT = 5000;
const CHARGE_WORDS = /\b(charges?|chgs?|fees?|sms|amc|commission|min(?:imum)? bal(?:ance)? (?:charges?|penalty)|gst on)\b/i;

export type Postable =
  | { kind: "bank_charge" }
  | { kind: "receipt"; invoice: OpenInvoice }
  | { kind: "none"; why: string };

export function postable(t: BankTxn, openInvoices: OpenInvoice[]): Postable {
  if (t.direction === "out") {
    if (!CHARGE_WORDS.test(t.description)) return { kind: "none", why: "Only bank charges can be posted. Make this entry in Zoho Books." };
    if (t.amount > BANK_CHARGE_LIMIT) return { kind: "none", why: `Charges above ₹${BANK_CHARGE_LIMIT.toLocaleString("en-IN")} need a person to post them in Zoho Books.` };
    return { kind: "bank_charge" };
  }
  const hit = invoiceHint(t.description, t.amount, openInvoices);
  if (!hit) return { kind: "none", why: "This receipt does not name exactly one open invoice. Record it in Zoho Books." };
  if (!hit.fits) return { kind: "none", why: `${hit.invoice.number} has only ₹${hit.invoice.balance.toLocaleString("en-IN")} due. Record this receipt in Zoho Books.` };
  return { kind: "receipt", invoice: hit.invoice };
}

/* ── is it already in Zoho? ──────────────────────────────── */

export interface ZohoEntry {
  date: string;
  amount: number;
}

const dayMs = 86_400_000;
export const DUPLICATE_WINDOW_DAYS = 3;

/** The window of dates to ask Zoho about, either side of the bank line. */
export function duplicateWindow(date: string): { start: string; end: string } {
  const t = Date.parse(`${date}T00:00:00Z`);
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { start: iso(t - DUPLICATE_WINDOW_DAYS * dayMs), end: iso(t + DUPLICATE_WINDOW_DAYS * dayMs) };
}

/** An entry for the same amount within a few days: treat the bank line as already recorded in Zoho. */
export function alreadyInZoho(t: BankTxn, entries: ZohoEntry[]): ZohoEntry | null {
  const at = Date.parse(`${t.date}T00:00:00Z`);
  return (
    entries.find((e) => Math.abs(e.amount - t.amount) < 0.005 && Math.abs(Date.parse(`${e.date.slice(0, 10)}T00:00:00Z`) - at) <= DUPLICATE_WINDOW_DAYS * dayMs) ?? null
  );
}

/* ── payloads and previews ───────────────────────────────── */

export const TAG = "Created by FynHelp";

export const idempotencyRef = (txnId: string) => `FH-${txnId.replace(/-/g, "").slice(0, 12).toUpperCase()}`;

export interface ExpensePayload {
  account_id: string;
  paid_through_account_id: string;
  date: string;
  amount: number;
  description: string;
  reference_number: string;
}
export interface PaymentPayload {
  customer_id: string;
  payment_mode: "banktransfer";
  amount: number;
  date: string;
  reference_number: string;
  description: string;
  account_id: string;
  invoices: { invoice_id: string; amount_applied: number }[];
}

const short = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 140);

export function expensePayload(t: BankTxn, expenseAccountId: string, bankAccountId: string): ExpensePayload {
  return {
    account_id: expenseAccountId,
    paid_through_account_id: bankAccountId,
    date: t.date,
    amount: t.amount,
    description: `${TAG}: ${short(t.description)}`,
    reference_number: idempotencyRef(t.id),
  };
}

export function paymentPayload(t: BankTxn, invoice: OpenInvoice, bankAccountId: string): PaymentPayload {
  return {
    customer_id: invoice.customerId,
    payment_mode: "banktransfer",
    amount: t.amount,
    date: t.date,
    reference_number: idempotencyRef(t.id),
    description: `${TAG}: ${short(t.description)}`,
    account_id: bankAccountId,
    invoices: [{ invoice_id: invoice.id, amount_applied: t.amount }],
  };
}

export interface Preview {
  kind: "bank_charge" | "receipt";
  title: string;
  lines: [string, string][];
}

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function preview(t: BankTxn, p: Extract<Postable, { kind: "bank_charge" | "receipt" }>, accountName: string, expenseAccountName?: string): Preview {
  if (p.kind === "bank_charge") {
    return {
      kind: "bank_charge",
      title: "Record a bank charge as an expense",
      lines: [
        ["Date", t.date],
        ["Amount", rupees(t.amount)],
        ["Expense account", expenseAccountName ?? "Bank charges"],
        ["Paid through", accountName],
        ["Note in Zoho", `${TAG}: ${short(t.description)}`],
      ],
    };
  }
  return {
    kind: "receipt",
    title: `Record a receipt against ${p.invoice.number}`,
    lines: [
      ["Date", t.date],
      ["Customer", p.invoice.customer],
      ["Amount", rupees(t.amount)],
      ["Applied to", `${p.invoice.number} (${rupees(p.invoice.balance)} due, ${rupees(p.invoice.balance - t.amount)} after)`],
      ["Deposited to", accountName],
      ["Note in Zoho", `${TAG}: ${short(t.description)}`],
    ],
  };
}

/** The expense account to book charges to: Zoho's own "Bank Fees and Charges" or a clearly named equivalent. */
export function pickChargeAccount(accounts: { account_id: string; account_name: string }[]): { id: string; name: string } | null {
  const rank = (n: string) => (/^bank fees? and charges$/i.test(n) ? 0 : /bank (fees?|charges?)/i.test(n) ? 1 : /\bcharges?\b/i.test(n) && /bank/i.test(n) ? 2 : 9);
  const best = [...accounts].sort((a, b) => rank(a.account_name) - rank(b.account_name))[0];
  return best && rank(best.account_name) < 9 ? { id: String(best.account_id), name: best.account_name } : null;
}
