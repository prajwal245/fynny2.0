/**
 * The post-match proof (RC-6): after every reconciliation, before a person sees the result, the matches are checked against the lines
 * themselves. A result that fails is shown as failed, never as a number.
 *
 *   a. each line is used by at most one match, on both sides
 *   b. each match nets to zero: the bank amount less the books amounts equals the difference the match states, so no rupee is lost
 *   c. both sides agree on direction (money in against money in)
 *   d. every matched bank line is inside the period, and its books are within a stated number of days of it
 *   e. the lines marked matched are exactly the lines in matches (the counters equal the lists)
 *
 * Pure: it takes the lines and the matches and returns what it found. The same inputs always give the same answer.
 */
export interface ProofTxn {
  id: string;
  side: "bank" | "books";
  direction: "in" | "out" | null;
  amount: number;
  txn_date: string;
  match_status?: string | null;
}

export interface ProofMatch {
  bank_txn_id: string;
  book_txn_ids: string[];
  /** A person's own match ("manual") is a decision, so it is not required to net to zero; it must still use each line once. */
  match_stage?: string | null;
  explanation?: { amount_diff?: number; date_gap_days?: number } | null;
}

export interface ProofCheck {
  id: "RC-6a" | "RC-6b" | "RC-6c" | "RC-6d" | "RC-6e";
  label: string;
  ok: boolean;
  /** One plain sentence, naming the first few offenders by id when it failed. */
  detail: string;
  offenders: string[];
}

export interface Proof {
  ok: boolean;
  checks: ProofCheck[];
  matches: number;
  lines: number;
}

const paise = (n: number) => Math.round(n * 100);

export function proveReconciliation(
  txns: ProofTxn[],
  matches: ProofMatch[],
  range: { start: string; end: string },
  opts: { maxBookGapDays?: number } = {},
): Proof {
  const byId = new Map(txns.map((t) => [t.id, t]));
  const maxGap = opts.maxBookGapDays ?? 45;
  const day = (d: string) => Date.parse(d.slice(0, 10));

  // a. one use per line
  const uses = new Map<string, number>();
  for (const m of matches) for (const id of [m.bank_txn_id, ...m.book_txn_ids]) uses.set(id, (uses.get(id) ?? 0) + 1);
  const twice = [...uses].filter(([, n]) => n > 1).map(([id]) => id);

  // b. nets to zero, c. direction, d. period
  const unbalanced: string[] = [];
  const wrongWay: string[] = [];
  const outside: string[] = [];
  const missing: string[] = [];
  for (const m of matches) {
    const bank = byId.get(m.bank_txn_id);
    const books = m.book_txn_ids.map((id) => byId.get(id));
    if (!bank || books.some((b) => !b)) { missing.push(m.bank_txn_id); continue; }
    const sum = books.reduce((n, b) => n + paise(b!.amount), 0);
    const stated = paise(m.explanation?.amount_diff ?? 0);
    // The difference the match states is bank less books, in absolute terms. One paisa of rounding is allowed per match.
    if (m.match_stage !== "manual" && Math.abs(Math.abs(paise(bank.amount) - sum) - Math.abs(stated)) > 1) unbalanced.push(m.bank_txn_id);
    if (books.some((b) => b!.direction && bank.direction && b!.direction !== bank.direction)) wrongWay.push(m.bank_txn_id);
    const d = bank.txn_date.slice(0, 10);
    if (d < range.start || d > range.end || books.some((b) => Math.abs(day(b!.txn_date) - day(bank.txn_date)) > maxGap * 86_400_000)) outside.push(m.bank_txn_id);
  }

  // e. the lines marked matched are the lines in matches
  const inMatches = new Set(uses.keys());
  const marked = txns.filter((t) => t.match_status === "matched" && t.txn_date.slice(0, 10) >= range.start && t.txn_date.slice(0, 10) <= range.end).map((t) => t.id);
  const markedNotInMatch = marked.filter((id) => !inMatches.has(id));
  const inMatchNotMarked = [...inMatches].filter((id) => byId.get(id) && byId.get(id)!.match_status !== undefined && byId.get(id)!.match_status !== "matched");

  const few = (ids: string[]) => ids.slice(0, 5).join(", ") + (ids.length > 5 ? ` and ${ids.length - 5} more` : "");
  const checks: ProofCheck[] = [
    { id: "RC-6a", label: "Each line is used once", ok: twice.length === 0, offenders: twice, detail: twice.length ? `${twice.length} line${twice.length === 1 ? " is" : "s are"} used in more than one match: ${few(twice)}.` : "No line is in two matches." },
    { id: "RC-6b", label: "Each match nets to zero", ok: unbalanced.length === 0 && missing.length === 0, offenders: [...unbalanced, ...missing], detail: unbalanced.length + missing.length ? `${unbalanced.length} match${unbalanced.length === 1 ? "" : "es"} where bank and books differ by more than the stated difference${missing.length ? `, ${missing.length} naming a line that is not in the period` : ""}: ${few([...unbalanced, ...missing])}.` : "Bank and books agree in every match, apart from the differences each match states." },
    { id: "RC-6c", label: "Both sides move the same way", ok: wrongWay.length === 0, offenders: wrongWay, detail: wrongWay.length ? `${wrongWay.length} match${wrongWay.length === 1 ? "" : "es"} pair money in with money out: ${few(wrongWay)}.` : "Money in is matched with money in, and out with out." },
    { id: "RC-6d", label: "Nothing outside the period", ok: outside.length === 0, offenders: outside, detail: outside.length ? `${outside.length} match${outside.length === 1 ? "" : "es"} outside the period or more than ${maxGap} days apart: ${few(outside)}.` : `Every matched bank line is inside the period and its books are within ${maxGap} days.` },
    { id: "RC-6e", label: "The counters equal the lists", ok: markedNotInMatch.length === 0 && inMatchNotMarked.length === 0, offenders: [...markedNotInMatch, ...inMatchNotMarked], detail: markedNotInMatch.length + inMatchNotMarked.length ? `${markedNotInMatch.length} line${markedNotInMatch.length === 1 ? " is" : "s are"} marked matched with no match, and ${inMatchNotMarked.length} in a match but not marked matched.` : "The lines marked matched are exactly the lines in the matches." },
  ];
  return { ok: checks.every((c) => c.ok), checks, matches: matches.length, lines: inMatches.size };
}
