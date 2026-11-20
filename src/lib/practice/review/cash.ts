/**
 * Day-wise cash balance and the cash limits, from the Day Book alone.
 *
 * For every cash ledger (and all together): opening + receipts - payments, day by day, by voucher date. A negative day means a receipt
 * is unrecorded or an entry is on the wrong date. Cash payments to one party in one day over the section 40A(3) limit, and cash
 * receipts from one party in one day at or above the section 269ST limit, are listed for the CA. Tally lists entries by date and not by
 * time, so only the end-of-day position is tested; the order inside a day is not.
 *
 * The limits are inputs, not rules baked in: 40A(3) is Rs 10,000 a day to one person (Rs 35,000 for goods transport), and 269ST is
 * Rs 2,00,000 a day from one person. A list here is a list to look at, not a finding.
 */
import type { Voucher } from "./dayBook";

const r2 = (n: number) => Math.round(n * 100) / 100;
/** The cash-in-hand ledger itself, not "Cash Credit" or a ledger that merely mentions cash. */
export const isCashLedger = (name: string) => /^(petty\s+)?cash(\s*-?\s*in\s*-?\s*hand)?(\s+a\/c)?$/i.test(name.trim()) || /^(site|office|branch|head office)\s+cash$/i.test(name.trim());

export interface CashDay { date: string; opening: number; receipts: number; payments: number; closing: number; flag: "" | "negative" | "high" }
export interface CashBreach { date: string; party: string; amount: number; vouchers: string[]; kind: "payment" | "receipt" }
export interface CashReview {
  ledgers: string[];
  days: CashDay[];
  negativeDays: number;
  lowest: { date: string; closing: number } | null;
  paymentsOverLimit: CashBreach[];
  receiptsOverLimit: CashBreach[];
  openingAssumed: boolean;
  notes: string[];
}

export function reviewCash(vouchers: Voucher[], opts: { opening?: number | null; paymentLimit?: number; receiptLimit?: number; highBalance?: number } = {}): CashReview {
  const payLimit = opts.paymentLimit ?? 10_000;
  const recLimit = opts.receiptLimit ?? 200_000;
  const byDay = new Map<string, { r: number; p: number }>();
  const pay = new Map<string, CashBreach>();
  const rec = new Map<string, CashBreach>();
  const ledgers = new Set<string>();
  for (const v of vouchers) {
    const cash = v.legs.filter((l) => isCashLedger(l.ledger));
    if (!cash.length) continue;
    for (const c of cash) ledgers.add(c.ledger);
    const d = byDay.get(v.date) ?? { r: 0, p: 0 };
    for (const c of cash) { d.r += c.debit; d.p += c.credit; }
    byDay.set(v.date, d);
    // The party is the largest non-cash leg. A cash-to-cash transfer or a cash deposit to the bank is not a payment to a person.
    const others = v.legs.filter((l) => !isCashLedger(l.ledger)).sort((a, b) => Math.max(b.debit, b.credit) - Math.max(a.debit, a.credit));
    const party = others[0]?.ledger ?? "(no other ledger)";
    if (/^contra$/i.test(v.type)) continue;
    for (const c of cash) {
      if (c.credit) {
        const k = `${v.date}|${party}`;
        const b = pay.get(k) ?? { date: v.date, party, amount: 0, vouchers: [], kind: "payment" as const };
        b.amount = r2(b.amount + c.credit); b.vouchers.push(`${v.type} ${v.no}`); pay.set(k, b);
      }
      if (c.debit) {
        const k = `${v.date}|${party}`;
        const b = rec.get(k) ?? { date: v.date, party, amount: 0, vouchers: [], kind: "receipt" as const };
        b.amount = r2(b.amount + c.debit); b.vouchers.push(`${v.type} ${v.no}`); rec.set(k, b);
      }
    }
  }
  let bal = opts.opening ?? 0;
  const days: CashDay[] = [];
  for (const date of [...byDay.keys()].sort()) {
    const d = byDay.get(date)!;
    const opening = bal;
    bal = r2(bal + d.r - d.p);
    days.push({ date, opening: r2(opening), receipts: r2(d.r), payments: r2(d.p), closing: bal, flag: bal < -0.005 ? "negative" : opts.highBalance && bal > opts.highBalance ? "high" : "" });
  }
  const neg = days.filter((d) => d.flag === "negative");
  const lowest = days.length ? days.reduce((m, d) => (d.closing < m.closing ? d : m), days[0]!) : null;
  return {
    ledgers: [...ledgers].sort(),
    days,
    negativeDays: neg.length,
    lowest: lowest ? { date: lowest.date, closing: lowest.closing } : null,
    paymentsOverLimit: [...pay.values()].filter((b) => b.amount > payLimit).sort((a, b) => b.amount - a.amount),
    receiptsOverLimit: [...rec.values()].filter((b) => b.amount >= recLimit).sort((a, b) => b.amount - a.amount),
    openingAssumed: opts.opening == null,
    notes: [
      opts.opening == null ? "The opening cash balance was not supplied, so days are counted from nil. A negative day may only mean the real opening was positive: enter it to settle that." : "",
      `Cash payments to one party in one day above ${payLimit.toLocaleString("en-IN")} (section 40A(3); the limit is higher for goods transport) and cash receipts of ${recLimit.toLocaleString("en-IN")} or more from one party (section 269ST) are listed for the CA to judge.`,
    ].filter(Boolean),
  };
}
