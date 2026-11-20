/**
 * Ageing of every debtor and creditor, from the Trial Balance (opening and closing) and the Day Book (every posting).
 *
 *  - Each party is the Trial Balance ledger under Sundry Debtors or Sundry Creditors; its opening is the Trial Balance opening.
 *  - Aged from the due date where a credit period is known, else from the invoice (voucher) date.
 *  - Method per party: the Day Book export carries no bill references, so every party is aged first in, first out; parties that Tally keeps
 *    bill-wise are marked, because their true open bills may differ and need the bill-wise outstanding report.
 *  - Proof: opening + the Day Book's postings must equal the Trial Balance closing for each party, to the paisa. A party that does not tie
 *    is listed as such, and its buckets are not trusted.
 */
import { agePosting, ledgerClosing, type PartyAgeing, type Posting } from "../ageing";
import type { Voucher } from "./dayBook";
import type { MasterRow, TrialBalance } from "./trialBalance";

const r2 = (n: number) => Math.round(n * 100) / 100;

export function postingsFromVouchers(vouchers: Voucher[]): Map<string, Posting[]> {
  const out = new Map<string, Posting[]>();
  for (const v of vouchers) for (const l of v.legs) {
    const amount = l.debit ? l.debit : -l.credit;
    if (!amount) continue;
    (out.get(l.ledger) ?? out.set(l.ledger, []).get(l.ledger)!).push({ date: v.date, amount, ref: v.no || null, voucher: `${v.type} ${v.no}`.trim() });
  }
  return out;
}

export interface AgeingRow extends PartyAgeing {
  billWise: boolean; gstin: string | null; tbClosing: number; tied: boolean; creditDays: number | null;
}
export interface AgeingReport {
  side: "debtor" | "creditor"; asAt: string; rows: AgeingRow[];
  totals: { closing: number; current: number; d31_60: number; d61_90: number; d90plus: number; onAccount: number };
  untied: AgeingRow[]; dueBasis: string; notes: string[];
}

export function ageingReport(
  vouchers: Voucher[], tb: TrialBalance, masters: MasterRow[],
  opts: { side: "debtor" | "creditor"; asAt: string; fyStart: string; creditDays?: number; creditDaysByParty?: Record<string, number>; /** The date the Trial Balance closing is at; the tie to it is made only when the as-at date is that day. */ tbDate?: string },
): AgeingReport {
  const group = opts.side === "debtor" ? /^sundry debtors$/i : /^sundry creditors$/i;
  const postings = postingsFromVouchers(vouchers);
  const info = new Map(masters.map((m) => [m.name.toLowerCase(), m]));
  const sign = opts.side === "debtor" ? 1 : -1; // owed amount = Dr for a debtor, Cr for a creditor
  const rows: AgeingRow[] = [];
  for (const l of tb.ledgers) {
    if (!group.test(l.primary)) continue;
    const opening = r2(l.opening * sign);
    const p = postings.get(l.name) ?? [];
    const creditDays = opts.creditDaysByParty?.[l.name] ?? opts.creditDays;
    const a = agePosting(l.name, p, opts.asAt, { side: opts.side, opening, openingDate: opts.fyStart, creditDays });
    const own = ledgerClosing(p, opts.asAt, opts.side, opening);
    // The Trial Balance closing is at one date; for any other as-at date the tie is to the Day Book's own roll-forward only.
    const tbClosing = r2(l.closing * sign);
    const tied = Math.abs(own - a.closing) < 0.01 && (opts.asAt !== (opts.tbDate ?? opts.asAt) || Math.abs(own - tbClosing) < 0.01);
    if (Math.abs(a.closing) < 0.005 && Math.abs(tbClosing) < 0.005 && !a.open.length) continue;
    const m = info.get(l.name.toLowerCase());
    rows.push({ ...a, billWise: m?.billWise ?? false, gstin: m?.gstin ?? null, tbClosing, tied, creditDays: creditDays ?? null });
  }
  rows.sort((x, y) => Math.abs(y.closing) - Math.abs(x.closing));
  const sum = (pick: (r: AgeingRow) => number) => r2(rows.reduce((n, r) => n + pick(r), 0));
  const notes = [
    "The Day Book export has no bill references, so every party is aged first in, first out: each receipt or payment settles the oldest open bill, and what is left over sits on account.",
    "Opening balances are aged from 1 April: the dates of the bills inside them are not in this export.",
  ];
  const bw = rows.filter((r) => r.billWise);
  if (bw.length) notes.push(`${bw.length} part${bw.length === 1 ? "y is" : "ies are"} kept bill-wise in Tally (${bw.slice(0, 3).map((r) => r.party).join(", ")}${bw.length > 3 ? ", …" : ""}); their open bills may differ from first in, first out, so check them against Tally's bill-wise outstanding.`);
  return {
    side: opts.side, asAt: opts.asAt, rows,
    totals: { closing: sum((r) => r.closing), current: sum((r) => r.buckets.current), d31_60: sum((r) => r.buckets.d31_60), d61_90: sum((r) => r.buckets.d61_90), d90plus: sum((r) => r.buckets.d90plus), onAccount: sum((r) => r.onAccount) },
    untied: rows.filter((r) => !r.tied),
    dueBasis: opts.creditDays != null || opts.creditDaysByParty ? "Aged from the due date (bill date plus the credit period) where one is set, else from the invoice date." : "Aged from the invoice date: no credit period is set for these parties.",
    notes,
  };
}
