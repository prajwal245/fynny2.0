/**
 * Transfers between a client's own bank accounts.
 *
 * Money that leaves one account and arrives in another of the same client is neither income nor expense. It appears twice, once
 * in each statement, and each leg on its own looks like an unexplained line. This pairs the two legs when the evidence is clear:
 *   - the amounts are equal and the directions opposite,
 *   - the dates are within two days,
 *   - the legs come from different statements (different accounts),
 *   - and either the bank reference (UTR) appears on both, or a narration names the other account.
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

function evidenceFor(a: TransferLeg, b: TransferLeg): string | null {
  const ra = referenceTokens(a);
  const rb = new Set(referenceTokens(b));
  const shared = ra.find((t) => rb.has(t));
  if (shared) return `Both legs carry the reference ${shared}.`;
  const names = (from: TransferLeg, other: TransferLeg) => Boolean(other.accountTail) && new RegExp(`(^|\\D)\\d*${other.accountTail}(\\D|$)`).test(`${from.description ?? ""} ${from.reference ?? ""}`);
  if (names(a, b) || names(b, a)) return "A narration names the other account.";
  if (OWN_WORDS.test(a.description ?? "") && OWN_WORDS.test(b.description ?? "")) return "Both narrations describe an own-account transfer.";
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
  return pairs;
}
