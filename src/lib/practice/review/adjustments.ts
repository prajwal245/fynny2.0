/**
 * Entries that look like adjustments: the ones a reviewer reads one by one because they move profit or balances without a third-party
 * document. Each flag is a reason to look, never a finding; routine month-end entries (GST set-off, RCM) are tagged so the list stays
 * short enough to read.
 */
import type { Voucher } from "./dayBook";

const r2 = (n: number) => Math.round(n * 100) / 100;
export type AdjFlag = "year_end" | "period_end" | "round_sum" | "narration" | "owner_or_suspense" | "reversed_next_period" | "large";
/** A month-end date or a round sum alone is how most routine entries look, so these two count only together or with another flag. */
const WEAK: AdjFlag[] = ["period_end", "round_sum"];

export interface AdjustmentRow {
  date: string; type: string; no: string; narration: string; amount: number; ledgers: string[]; flags: AdjFlag[]; routine: string | null; row: number;
}

const WORDS = /\b(adjust\w*|rectif\w*|transfer\w*|w\/?o|written\s*(off|back)|write\s*(off|back)|provision|reversal|reverse\w*|to be deleted|correction|regroup\w*)\b/i;
const OWNER = /\b(director|partner|proprietor|drawings?|capital|suspense|pending identification|new ledger|loan from|loans? to)\b/i;
const ROUTINE: [string, RegExp][] = [["GST set-off or payment", /\b(output|input)\s*(c|s|i)gst\b|\bgst\s*\(cgst\+sgst\+igst\)/i], ["Reverse charge", /\brcm\b/i]];
const lastDayOf = (d: string) => { const [y, m] = d.split("-").map(Number) as [number, number]; return new Date(Date.UTC(y, m, 0)).getUTCDate(); };

export function adjustmentRegister(vouchers: Voucher[], opts: { largeFactor?: number } = {}): AdjustmentRow[] {
  const total = (v: Voucher) => r2(v.legs.reduce((n, l) => n + l.debit, 0));
  const sizes = vouchers.map(total).filter((n) => n > 0).sort((a, b) => a - b);
  const median = sizes.length ? sizes[Math.floor(sizes.length / 2)]! : 0;
  const large = median * (opts.largeFactor ?? 25);
  const reversedLater = new Set<string>();
  // An entry reversed in the first days of the next period: the same ledgers and amount, opposite sides, within 10 days after a period end.
  const journals = vouchers.filter((v) => /^(journal|contra)$/i.test(v.type));
  const sig = (v: Voucher, flip: boolean) => v.legs.map((l) => `${l.ledger}:${flip ? l.credit : l.debit}:${flip ? l.debit : l.credit}`).sort().join("|");
  const bySig = new Map<string, Voucher[]>();
  for (const v of journals) { const k = sig(v, false); (bySig.get(k) ?? bySig.set(k, []).get(k)!).push(v); }
  for (const v of journals) {
    const mate = bySig.get(sig(v, true))?.find((w) => w !== v && Date.parse(w.date) > Date.parse(v.date) && Date.parse(w.date) - Date.parse(v.date) <= 10 * 86_400_000);
    if (mate && Number(v.date.slice(8)) >= lastDayOf(v.date) - 1) reversedLater.add(`${v.date}|${v.no}`);
  }
  const out: AdjustmentRow[] = [];
  for (const v of vouchers) {
    if (!/^(journal|contra)$/i.test(v.type)) continue;
    const amount = total(v);
    const names = v.legs.map((l) => l.ledger);
    const flags: AdjFlag[] = [];
    const d = Number(v.date.slice(8));
    if (v.date.endsWith("-03-31")) flags.push("year_end");
    else if (d === lastDayOf(v.date)) flags.push("period_end");
    if (amount >= 10_000 && amount % 1000 === 0) flags.push("round_sum");
    if (WORDS.test(v.narration)) flags.push("narration");
    if (names.some((n) => OWNER.test(n))) flags.push("owner_or_suspense");
    if (reversedLater.has(`${v.date}|${v.no}`)) flags.push("reversed_next_period");
    if (large && amount >= large) flags.push("large");
    const routine = ROUTINE.find(([, re]) => names.some((n) => re.test(n)) || re.test(v.narration))?.[0] ?? null;
    const strong = flags.filter((f) => !WEAK.includes(f)).length;
    if (strong > 0 || flags.length >= 2 || routine) out.push({ date: v.date, type: v.type, no: v.no, narration: v.narration, amount, ledgers: names, flags, routine, row: v.row });
  }
  return out.sort((a, b) => b.flags.length - a.flags.length || b.amount - a.amount);
}
