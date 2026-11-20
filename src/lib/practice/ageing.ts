/**
 * Ageing of what customers owe and what the firm owes, both ways Tally books it:
 *
 *  - Bill-wise, where a party has bill references: a "New Ref" is a bill, an "Agst Ref" settles that bill, "On Account" and "Advance" are
 *    unallocated. (Tally has bill-wise on for only some parties.)
 *  - First in, first out, where it does not: each receipt or payment settles the oldest open bill; what is left over is on account.
 *
 * Every result names its method per party, so a CA can see which figures rest on references and which on FIFO. The balance is always the
 * ledger's own: bills open + on account = closing, to the paisa; if it were not, the engine would say so instead of showing buckets.
 */
const r2 = (n: number) => Math.round(n * 100) / 100;
const DAY = 86_400_000;

export type BillType = "new" | "against" | "on_account" | "advance" | null;

/** One posting to a party ledger. Amounts are signed as a debit (+) or a credit (−), whichever side the party is. */
export interface Posting {
  date: string;
  amount: number;
  ref?: string | null;
  billType?: BillType;
  voucher?: string | null;
}

export interface OpenBill { ref: string; date: string; amount: number; age: number; origin: "bill" | "opening" }

export interface PartyAgeing {
  party: string;
  /** Closing balance: positive is owed (to the firm for a debtor, by the firm for a creditor). */
  closing: number;
  buckets: { current: number; d31_60: number; d61_90: number; d90plus: number };
  /** Receipts or payments beyond the open bills (advances), and bills that could not be dated. */
  onAccount: number;
  open: OpenBill[];
  method: "bill-wise" | "fifo" | "mixed" | "none";
}

export const BUCKETS = ["0 to 30 days", "31 to 60 days", "61 to 90 days", "Over 90 days"] as const;

const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);

export function agePosting(
  party: string,
  postings: Posting[],
  asAt: string,
  opts: { side: "debtor" | "creditor"; opening?: number; openingDate?: string; /** Credit period: a bill is aged from its due date (bill date + this), and not at all before it. Without it, from the invoice date. */ creditDays?: number } = { side: "debtor" },
): PartyAgeing {
  // For a debtor a debit is a bill; for a creditor a credit is. Normalise so that a positive number is always a bill.
  const sign = opts.side === "debtor" ? 1 : -1;
  const open: OpenBill[] = [];
  let onAccount = 0;
  let usedRefs = false, usedFifo = false;
  const opening = r2((opts.opening ?? 0) * (opts.side === "debtor" ? 1 : 1));
  if (opening > 0) open.push({ ref: "Opening balance", date: opts.openingDate ?? "1900-01-01", amount: opening, age: 0, origin: "opening" });
  else if (opening < 0) onAccount += -opening;
  const sorted = [...postings].filter((p) => p.date <= asAt).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const settle = (amount: number, ref: string | null | undefined, byRef: boolean) => {
    let left = amount;
    if (byRef && ref) {
      const bill = open.find((b) => b.ref === ref);
      if (bill) { const t = Math.min(bill.amount, left); bill.amount = r2(bill.amount - t); left = r2(left - t); usedRefs = true; }
    }
    if (left > 0) {
      for (const b of open) { if (left <= 0) break; if (b.amount <= 0) continue; const t = Math.min(b.amount, left); b.amount = r2(b.amount - t); left = r2(left - t); usedFifo = usedFifo || !byRef || !ref; }
    }
    if (left > 0) onAccount = r2(onAccount + left);
  };
  for (const p of sorted) {
    const v = r2(p.amount * sign);
    if (p.billType === "advance" || p.billType === "on_account") { if (v > 0) open.push({ ref: p.ref || "On account", date: p.date, amount: v, age: 0, origin: "bill" }); else onAccount = r2(onAccount - v); continue; }
    if (v > 0) { open.push({ ref: p.ref || p.voucher || "Bill", date: p.date, amount: v, age: 0, origin: "bill" }); if (p.billType === "new") usedRefs = true; }
    else if (v < 0) settle(-v, p.ref, p.billType === "against");
  }
  const live = open.filter((b) => b.amount > 0.004);
  const grace = opts.creditDays ?? 0;
  for (const b of live) b.age = b.date === "1900-01-01" ? 9999 : Math.max(0, days(b.date, asAt) - (b.origin === "opening" ? 0 : grace));
  const buckets = { current: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
  for (const b of live) {
    if (b.age <= 30) buckets.current += b.amount; else if (b.age <= 60) buckets.d31_60 += b.amount; else if (b.age <= 90) buckets.d61_90 += b.amount; else buckets.d90plus += b.amount;
  }
  const billsOpen = r2(live.reduce((n, b) => n + b.amount, 0));
  return {
    party, closing: r2(billsOpen - onAccount), onAccount: r2(onAccount),
    buckets: { current: r2(buckets.current), d31_60: r2(buckets.d31_60), d61_90: r2(buckets.d61_90), d90plus: r2(buckets.d90plus) },
    open: live, method: usedRefs && usedFifo ? "mixed" : usedRefs ? "bill-wise" : usedFifo || live.length ? "fifo" : "none",
  };
}

/** The ledger's own closing, for the proof: opening plus every posting to the date, with the sign of the side. */
export function ledgerClosing(postings: Posting[], asAt: string, side: "debtor" | "creditor", opening = 0): number {
  const sign = side === "debtor" ? 1 : -1;
  return r2(opening + postings.filter((p) => p.date <= asAt).reduce((n, p) => n + p.amount * sign, 0));
}

/* ── Tally Day Book (Excel): every ledger's postings ────── */

const num = (v: unknown): number => {
  const s = String(v ?? "").replace(/[₹,\s]/g, "").replace(/(dr|cr)$/i, "");
  return s && /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : 0;
};
const parseDay = (s: string): string | null => {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/.exec(String(s).trim());
  if (!m) return null;
  const mon = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(m[2]!.toLowerCase());
  if (mon < 0) return null;
  const y = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return `${y}-${String(mon + 1).padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
};

/** Postings per ledger from a Tally Day Book export (Date, Particulars, Vch Type, Vch No., Debit, Credit; one row per leg). */
export function postingsFromDayBook(rows: string[][]): Map<string, Posting[]> {
  const head = rows.findIndex((r) => r.some((c) => /^particulars$/i.test(String(c).trim())) && r.some((c) => /vch\s*type/i.test(String(c))));
  const out = new Map<string, Posting[]>();
  if (head < 0) return out;
  const h = rows[head]!.map((c) => String(c).trim().toLowerCase());
  const col = (re: RegExp, d: number) => { const i = h.findIndex((c) => re.test(c)); return i >= 0 ? i : d; };
  const cD = col(/^date$/, 0), cP = col(/^particulars$/, 1), cT = col(/vch\s*type/, 4), cN = col(/vch\s*no/, 5), cDr = col(/^debit( amount)?$/, cN + 1), cCr = col(/^credit( amount)?$/, cN + 2);
  let date: string | null = null, vno = "", vtype = "";
  for (const r of rows.slice(head + 1)) {
    const name = String(r[cP] ?? "").trim();
    if (String(r[cD] ?? "").trim() && String(r[cT] ?? "").trim()) { date = parseDay(r[cD]!); vno = String(r[cN] ?? "").trim(); vtype = String(r[cT]).trim(); }
    if (!date || !name) continue;
    const dr = num(r[cDr]), cr = num(r[cCr]);
    if (!dr && !cr) continue;
    (out.get(name) ?? out.set(name, []).get(name)!).push({ date, amount: dr ? dr : -cr, ref: vno || null, voucher: `${vtype} ${vno}`.trim() });
  }
  return out;
}
