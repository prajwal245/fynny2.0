/**
 * "Export for Zoho": files a CA imports into Zoho Books by hand. Nothing here talks to
 * Zoho or needs a connection, so it carries no risk: it only reshapes the open bank-side
 * lines FynHelp found missing from the books. Pure, so every rule is tested on its own.
 */

export interface ExportException {
  id: string;
  clientId: string;
  date: string; // YYYY-MM-DD
  amount: number; // signed: money out is negative
  narration: string;
  side?: "bank" | "books";
  status: "open" | "resolved" | "ignored";
}

export type ExportKind = "expenses" | "receipts" | "bank";

export const EXPORT_KINDS: { kind: ExportKind; label: string; hint: string; zohoPath: string }[] = [
  {
    kind: "expenses",
    label: "Missing expenses",
    hint: "Payments that left the bank but are not in the books.",
    zohoPath: "Purchases › Expenses › Import Expenses",
  },
  {
    kind: "receipts",
    label: "Missing receipts",
    hint: "Money that reached the bank but is not recorded against a customer.",
    zohoPath: "Sales › Payments Received › Import Payments Received",
  },
  {
    kind: "bank",
    label: "Bank lines to categorise",
    hint: "Every open bank line in Zoho's bank-statement format, to categorise inside Zoho.",
    zohoPath: "Banking › your account › Import Statement",
  },
];

/* ── helpers ─────────────────────────────────────────────── */

/** RFC 4180 cell, and a guard so a narration starting with = + - @ is never run as a spreadsheet formula. */
export function csvCell(v: string | number): string {
  let s = String(v);
  if (/^[=+@]/.test(s) || /^-(?![0-9.]+$)/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const csv = (head: string[], rows: (string | number)[][]) =>
  [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

/** Zoho's import asks for dd/MM/yyyy. */
export const zohoDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
};
const money = (n: number) => Math.abs(n).toFixed(2);
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** The expense account a narration points at; a person confirms it while importing. */
export function expenseAccount(narration: string): string {
  const n = narration.toLowerCase();
  if (/\b(charges?|chgs?|fees?|sms|amc|commission|gst on)\b/.test(n)) return "Bank Fees and Charges";
  if (/\brent\b/.test(n)) return "Rent Expense";
  if (/\b(salary|salaries|payroll|wages)\b/.test(n)) return "Salaries and Employee Wages";
  if (/\b(electricity|power|bescom|water bill|broadband|internet|airtel|jio|vodafone)\b/.test(n)) return "Utilities";
  if (/\b(fuel|petrol|diesel|uber|ola|taxi|cab|travel|irctc|flight)\b/.test(n)) return "Travel Expense";
  if (/\b(gst pmt|tds|challan|cbdt|income tax)\b/.test(n)) return "Tax Payable";
  return "Other Expenses";
}

/** The party a bank narration names, best effort: "NEFT CR-KAVERI TEXTILES-INV-2601" → "KAVERI TEXTILES". */
export function partyOf(narration: string): string {
  const parts = clean(narration)
    .split(/[-/|]/)
    .map((p) => p.trim())
    .filter(Boolean);
  const skip = /^(neft|rtgs|imps|upi|ach|nach|ecs|cr|dr|by|to|trf|transfer|inv[\s.\-]*\d+|[0-9a-z]*\d{5,}[0-9a-z]*)$/i;
  const named = parts.filter((p) => !skip.test(p) && !/^(neft|rtgs|imps|upi)\b.*\b(cr|dr)$/i.test(p) && /[a-z]{3}/i.test(p));
  return named[0] ?? "";
}

/** An invoice number written in the narration, for the CA to apply the receipt against. */
export function invoiceRef(narration: string): string {
  return /\b(inv[\s\-_.]*\d{2,}[\w-]*)/i.exec(narration)?.[1]?.replace(/\s+/g, "") ?? "";
}

/** A reference the bank put on the line: UTR / cheque number style tokens. */
function bankRef(narration: string): string {
  return /\b([A-Z]{0,6}\d{6,})\b/.exec(narration)?.[1] ?? "";
}

/* ── the three files ─────────────────────────────────────── */

const openBank = (list: ExportException[], clientId: string, period: string | null) =>
  list
    .filter((e) => e.status === "open" && e.clientId === clientId && e.side !== "books" && e.date && e.amount !== 0)
    .filter((e) => !period || e.date.slice(0, 7) === period)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

export interface ZohoExport {
  kind: ExportKind;
  filename: string;
  count: number;
  total: number;
  csv: string;
}

export function buildZohoExport(
  kind: ExportKind,
  list: ExportException[],
  opts: { clientId: string; clientName: string; period: string | null; stamp?: string },
): ZohoExport {
  const lines = openBank(list, opts.clientId, opts.period);
  const slug = opts.clientName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "client";
  const stamp = (opts.stamp ?? opts.period ?? "all-periods").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const out = lines.filter((e) => e.amount < 0);
  const inn = lines.filter((e) => e.amount > 0);

  if (kind === "expenses") {
    return {
      kind, filename: `zoho-expenses_${slug}_${stamp}.csv`, count: out.length, total: out.reduce((s, e) => s - e.amount, 0),
      csv: csv(
        ["Expense Date", "Expense Account", "Paid Through", "Amount", "Vendor", "Reference#", "Notes"],
        out.map((e) => [zohoDate(e.date), expenseAccount(e.narration), "", money(e.amount), partyOf(e.narration), bankRef(e.narration), clean(e.narration).slice(0, 200)]),
      ),
    };
  }
  if (kind === "receipts") {
    return {
      kind, filename: `zoho-receipts_${slug}_${stamp}.csv`, count: inn.length, total: inn.reduce((s, e) => s + e.amount, 0),
      csv: csv(
        ["Payment Date", "Customer Name", "Amount", "Payment Mode", "Deposit To", "Reference#", "Invoice Number", "Notes"],
        inn.map((e) => [zohoDate(e.date), partyOf(e.narration), money(e.amount), "Bank Transfer", "", bankRef(e.narration), invoiceRef(e.narration), clean(e.narration).slice(0, 200)]),
      ),
    };
  }
  return {
    kind, filename: `zoho-bank-lines_${slug}_${stamp}.csv`, count: lines.length, total: lines.reduce((s, e) => s + Math.abs(e.amount), 0),
    csv: csv(
      ["Date", "Description", "Reference Number", "Withdrawals", "Deposits", "Payee"],
      lines.map((e) => [zohoDate(e.date), clean(e.narration).slice(0, 200), bankRef(e.narration), e.amount < 0 ? money(e.amount) : "", e.amount > 0 ? money(e.amount) : "", partyOf(e.narration)]),
    ),
  };
}

export const countFor = (list: ExportException[], clientId: string, period: string | null) => {
  const l = openBank(list, clientId, period);
  return { out: l.filter((e) => e.amount < 0).length, in: l.filter((e) => e.amount > 0).length, all: l.length };
};

/* ── Tally ───────────────────────────────────────────────── */

export type BooksSystem = "zoho" | "tally";

/** Which books a client keeps, from the documents already in FynHelp. Null when nothing says. */
export function detectBooks(docs: { clientId: string; side?: string; source?: string; kind?: string; name?: string }[], clientId: string): BooksSystem | null {
  const mine = docs.filter((d) => d.clientId === clientId);
  if (mine.some((d) => d.source === "Zoho Books")) return "zoho";
  if (mine.some((d) => d.side === "books" && (d.kind === "tally_xml" || /\.xml$/i.test(d.name ?? "")))) return "tally";
  return null;
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
const tallyDate = (iso: string) => iso.slice(0, 10).replace(/-/g, "");
const TALLY_NAMES: Record<string, string> = {
  "Bank Fees and Charges": "Bank Charges",
  "Rent Expense": "Rent",
  "Salaries and Employee Wages": "Salaries",
  "Travel Expense": "Travelling Expenses",
  "Other Expenses": "Miscellaneous Expenses",
  Utilities: "Electricity Charges",
  "Tax Payable": "Tax Paid (to be classified)",
};

export interface TallyExport {
  filename: string;
  count: number;
  total: number;
  xml: string;
}

/**
 * Tally import XML for the open bank-side lines: a Payment voucher for each payment (expense or
 * party debited, bank credited) and a Receipt voucher for each receipt (bank debited, party
 * credited). Ledgers it names are created under a sensible group if they do not exist; the bank
 * ledger must already exist, so its name is asked for.
 */
export function buildTallyExport(
  list: ExportException[],
  opts: { clientId: string; clientName: string; period: string | null; stamp?: string; bankLedger: string },
): TallyExport {
  const lines = openBank(list, opts.clientId, opts.period);
  const slug = opts.clientName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "client";
  const stamp = (opts.stamp ?? opts.period ?? "all-periods").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const bank = clean(opts.bankLedger) || "Bank Account";
  const masters = new Map<string, string>(); // ledger → parent group
  const vouchers: string[] = [];
  for (const e of lines) {
    const out = e.amount < 0;
    const other = out
      ? (TALLY_NAMES[expenseAccount(e.narration)] ?? expenseAccount(e.narration))
      : partyOf(e.narration) || "Unidentified Receipts (Suspense)";
    if (!masters.has(other)) masters.set(other, out ? "Indirect Expenses" : /suspense/i.test(other) ? "Suspense A/c" : "Sundry Debtors");
    const amt = money(e.amount);
    const narr = xml(clean(e.narration).slice(0, 200));
    const type = out ? "Payment" : "Receipt";
    const entry = (name: string, debit: boolean) =>
      `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${xml(name)}</LEDGERNAME><ISDEEMEDPOSITIVE>${debit ? "Yes" : "No"}</ISDEEMEDPOSITIVE><AMOUNT>${debit ? "-" : ""}${amt}</AMOUNT></ALLLEDGERENTRIES.LIST>`;
    vouchers.push(
      `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="${type}" ACTION="Create"><DATE>${tallyDate(e.date)}</DATE><VOUCHERTYPENAME>${type}</VOUCHERTYPENAME><NARRATION>${narr}</NARRATION>${out ? entry(other, true) + entry(bank, false) : entry(bank, true) + entry(other, false)}</VOUCHER></TALLYMESSAGE>`,
    );
  }
  const ledgers = [...masters].map(
    ([name, parent]) => `<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="${xml(name)}" ACTION="Create"><NAME.LIST><NAME>${xml(name)}</NAME></NAME.LIST><PARENT>${xml(parent)}</PARENT></LEDGER></TALLYMESSAGE>`,
  );
  const body = [`<?xml version="1.0" encoding="UTF-8"?>`, `<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>All Masters</REPORTNAME></REQUESTDESC><REQUESTDATA>`, ...ledgers, ...vouchers, `</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`].join("\n");
  return { filename: `tally-vouchers_${slug}_${stamp}.xml`, count: lines.length, total: lines.reduce((s, e) => s + Math.abs(e.amount), 0), xml: body };
}
