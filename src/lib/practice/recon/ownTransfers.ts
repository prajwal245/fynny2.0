/**
 * Transfers between a client's own bank accounts.
 *
 * Money that leaves one account and arrives in another of the same client is neither income nor expense. It appears twice, once
 * in each statement, and each leg on its own looks like an unexplained line. This pairs the two legs when the evidence is clear:
 *   - the amounts are equal and the directions opposite,
 *   - the dates are within two days,
 *   - the legs come from different statements (different accounts),
 *   - and one kind of evidence: the bank reference (UTR) appears on both; a narration names the other account; both narrations say
 *     they are transfers (SBI's "WDL TFR TRANSFER TO" against "DEP TFR TRANSFER FROM", the bank's own internal transfer codes).
 * A pair is made only when it is the single possible partner both ways. Anything doubtful stays an exception for a person.
 * Pure: nothing is changed here, the caller decides what to do with the pairs.
 */
export interface TransferLeg {
  id: string;
  /** The statement the line came from. Two legs of one transfer are on different statements. */
  extractionId: string | null;
  direction: "in" | "out";
  amount: number;
  /** ISO date. */
  date: string;
  reference?: string | null;
  description?: string | null;
  /** The last digits of the account this statement is for, when known, so a narration naming that account is recognised. */
  accountTail?: string | null;
}

export interface TransferPair {
  out: TransferLeg;
  in: TransferLeg;
  /** Why these two were paired, in words for the person reviewing. */
  evidence: string;
}

const DAY = 86_400_000;
const days = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY;
const paise = (n: number) => Math.round(Math.abs(n) * 100);

/** The reference-like tokens in a line: long digit or alphanumeric runs (UTR, cheque number, reference). */
export function referenceTokens(l: Pick<TransferLeg, "reference" | "description">): string[] {
  const text = `${l.reference ?? ""} ${l.description ?? ""}`.toUpperCase();
  const found = text.match(/[A-Z0-9]{9,}/g) ?? [];
  // A word is not a reference: it must carry at least four digits.
  return [...new Set(found.filter((t) => (t.match(/\d/g) ?? []).length >= 4))];
}

const OWN_WORDS = /\b(self|own\s*a\/?c|own\s*account|inter\s*-?\s*account|sweep|contra)\b/i;
/** The wording banks use for a transfer between two accounts held with them: money out of one, money into the other. */
const TRANSFER_OUT = /\b(WDL\s*TFR|(?:TRANSFER|TRF|TFR)\s+TO)\b/i;
const TRANSFER_IN = /\b(DEP\s*TFR|(?:TRANSFER|TRF|TFR)\s+FROM)\b/i;

function evidenceFor(a: TransferLeg, b: TransferLeg): string | null {
  const ra = referenceTokens(a);
  const rb = new Set(referenceTokens(b));
  const shared = ra.find((t) => rb.has(t));
  if (shared) return `Both legs carry the reference ${shared}.`;
  const names = (from: TransferLeg, other: TransferLeg) => Boolean(other.accountTail) && new RegExp(`(^|\\D)\\d*${other.accountTail}(\\D|$)`).test(`${from.description ?? ""} ${from.reference ?? ""}`);
  if (names(a, b) || names(b, a)) return "A narration names the other account.";
  if (OWN_WORDS.test(a.description ?? "") && OWN_WORDS.test(b.description ?? "")) return "Both narrations describe an own-account transfer.";
  // `a` is the money-out leg and `b` the money-in leg (see pairOwnTransfers).
  if (TRANSFER_OUT.test(a.description ?? "") && TRANSFER_IN.test(b.description ?? "")) return "Both legs are the bank's own transfer entries, for the same amount within two days, between this client's accounts.";
  return null;
}

export function pairOwnTransfers(legs: TransferLeg[]): TransferPair[] {
  const outs = legs.filter((l) => l.direction === "out");
  const ins = legs.filter((l) => l.direction === "in");
  const candidates = (o: TransferLeg) =>
    ins.filter((i) => paise(i.amount) === paise(o.amount) && i.extractionId !== o.extractionId && days(i.date, o.date) <= 2 && evidenceFor(o, i) !== null);
  const outsFor = (i: TransferLeg) =>
    outs.filter((o) => paise(o.amount) === paise(i.amount) && o.extractionId !== i.extractionId && days(i.date, o.date) <= 2 && evidenceFor(o, i) !== null);
  const pairs: TransferPair[] = [];
  for (const o of outs) {
    const c = candidates(o);
    if (c.length !== 1) continue; // none, or ambiguous: leave it to a person
    const i = c[0]!;
    if (outsFor(i).length !== 1) continue;
    pairs.push({ out: o, in: i, evidence: evidenceFor(o, i)! });
  }
  // Identical transfers close together (two of ₹8,00,000 out and two in): no single leg has a unique partner, but when a group of
  // legs fit one another completely and the numbers out and in are equal, any pairing gives the same result, so they are paired in order.
  const used = new Set(pairs.flatMap((p) => [p.out.id, p.in.id]));
  const left = legs.filter((l) => !used.has(l.id));
  const fits = (o: TransferLeg, i: TransferLeg) => paise(i.amount) === paise(o.amount) && i.extractionId !== o.extractionId && days(i.date, o.date) <= 2 && evidenceFor(o, i) !== null;
  const seen = new Set<string>();
  for (const start of left) {
    if (seen.has(start.id)) continue;
    // The group this leg belongs to: everything reachable through legs that fit each other.
    const group: TransferLeg[] = [];
    const queue = [start];
    seen.add(start.id);
    while (queue.length) {
      const cur = queue.pop()!;
      group.push(cur);
      for (const other of left) {
        if (seen.has(other.id)) continue;
        const [o, i] = cur.direction === "out" ? [cur, other] : [other, cur];
        if (cur.direction !== other.direction && fits(o, i)) {
          seen.add(other.id);
          queue.push(other);
        }
      }
    }
    const outs = group.filter((l) => l.direction === "out");
    const ins = group.filter((l) => l.direction === "in");
    if (outs.length < 2 || outs.length !== ins.length) continue;
    if (!outs.every((o) => ins.every((i) => fits(o, i)))) continue;
    const byDate = (a: TransferLeg, b: TransferLeg) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
    outs.sort(byDate);
    ins.sort(byDate);
    outs.forEach((o, n) => pairs.push({ out: o, in: ins[n]!, evidence: `${evidenceFor(o, ins[n]!)} (${outs.length} identical transfers close together, paired in order.)` }));
  }
  return pairs;
}
