/**
 * A payment the bank took and then gave back.
 *
 * A UPI payment that fails after the money has left shows twice on one statement: the debit, and a credit marked "RVSL" (reversal)
 * or "REV" a little later, for the same amount. Together they net to nothing, and neither belongs in the books. Left alone they
 * become two exceptions every time. This pairs them when the evidence is plain:
 *   - the credit says it is a reversal or refund,
 *   - the amounts are equal, the debit came first and the credit followed within three days,
 *   - both are on the same statement (the same account),
 *   - and each has only one possible partner.
 * Pure: it changes nothing. The caller decides what to do with the pairs, and leaves a payment alone when the books have an entry for it.
 */
export interface ReversalLeg {
  id: string;
  extractionId: string | null;
  direction: "in" | "out";
  amount: number;
  /** ISO date. */
  date: string;
  description?: string | null;
}

export interface ReversalPair {
  out: ReversalLeg;
  in: ReversalLeg;
  evidence: string;
}

// The marker is often glued to the reference digits ("UPI/RVSL512383341772"), so it is matched as a run of letters, not a whole word.
const REVERSAL_WORDS = /(?<![A-Za-z])(RVSL|REVSL|REVERSAL|REVERSED|UPI\s*REV|REFUND(?:ED)?)(?![A-Za-z])/i;
const DAY = 86_400_000;
const paise = (n: number) => Math.round(Math.abs(n) * 100);
const gapDays = (from: string, to: string) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY;

export const isReversalCredit = (l: Pick<ReversalLeg, "direction" | "description">) => l.direction === "in" && REVERSAL_WORDS.test(l.description ?? "");

export function pairReversals(legs: ReversalLeg[], opts: { maxDays?: number } = {}): ReversalPair[] {
  const maxDays = opts.maxDays ?? 3;
  const credits = legs.filter(isReversalCredit);
  const debits = legs.filter((l) => l.direction === "out" && !REVERSAL_WORDS.test(l.description ?? ""));
  const fits = (d: ReversalLeg, c: ReversalLeg) =>
    d.extractionId === c.extractionId && paise(d.amount) === paise(c.amount) && gapDays(d.date, c.date) >= 0 && gapDays(d.date, c.date) <= maxDays;
  const pairs: ReversalPair[] = [];
  for (const d of debits) {
    const cs = credits.filter((c) => fits(d, c));
    if (cs.length !== 1) continue;
    const c = cs[0]!;
    if (debits.filter((x) => fits(x, c)).length !== 1) continue;
    pairs.push({ out: d, in: c, evidence: `The credit on ${c.date} is marked as a reversal and returns the same amount that left on ${d.date}.` });
  }
  return pairs;
}
