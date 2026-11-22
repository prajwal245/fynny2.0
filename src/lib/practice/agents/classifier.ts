/**
 * The classifier: suggests how to treat a line from this client's own earlier confirmed decisions. It never invents a treatment,
 * only repeats one a person has already chosen for the same kind of line, and says how many times and how consistently.
 *
 * It suggests. A suggestion becomes an automatic action only through a rule that has climbed the autonomy ladder (see autonomy.ts).
 */
import { decisionPattern } from "../memory";

export interface PastDecision {
  pattern: string;
  treatment: string;
  at: string;
}
export interface LineToClassify {
  side: "bank" | "books";
  direction: "in" | "out";
  description: string | null;
  counterparty?: string | null;
  amount: number;
}

export type Suggestion =
  | {
      kind: "suggest";
      treatment: string;
      confidence: number;
      support: number;
      total: number;
      reason: string;
      ruleId: string;
    }
  | {
      kind: "uncertain";
      candidates: { treatment: string; support: number }[];
      reason: string;
    }
  | { kind: "none"; reason: string };

/** A treatment needs at least this many earlier decisions, and this share of them, before it is suggested. */
export const MIN_SUPPORT = 2;
export const MIN_SHARE = 0.8;

export const ruleIdFor = (pattern: string) => `classify:${pattern}`;

/** Confidence grows with how many times the same choice was made and how consistent the choices were. 10 of 10 reads as Confident. */
export const confidenceOf = (support: number, total: number): number =>
  total === 0
    ? 0
    : Math.round((support / total) * (support / (support + 1)) * 1000) / 1000;

export function suggestTreatment(
  line: LineToClassify,
  history: PastDecision[],
): Suggestion {
  const pattern = decisionPattern({
    side: line.side,
    direction: line.direction,
    description: line.description,
    counterparty: line.counterparty,
  });
  if (!pattern)
    return {
      kind: "none",
      reason: "The narration has nothing distinctive to recognise.",
    };
  const same = history.filter((h) => h.pattern === pattern);
  if (!same.length)
    return {
      kind: "none",
      reason: "No earlier decision for this kind of line.",
    };
  const counts = new Map<string, number>();
  for (const h of same)
    counts.set(h.treatment, (counts.get(h.treatment) ?? 0) + 1);
  const ranked = [...counts.entries()]
    .map(([treatment, support]) => ({ treatment, support }))
    .sort(
      (a, b) => b.support - a.support || a.treatment.localeCompare(b.treatment),
    );
  const top = ranked[0]!;
  const share = top.support / same.length;
  if (top.support < MIN_SUPPORT)
    return {
      kind: "uncertain",
      candidates: ranked,
      reason: `Decided once before. A suggestion needs at least ${MIN_SUPPORT}.`,
    };
  if (share < MIN_SHARE)
    return {
      kind: "uncertain",
      candidates: ranked,
      reason: `Treated differently ${same.length - top.support} of ${same.length} times.`,
    };
  return {
    kind: "suggest",
    treatment: top.treatment,
    confidence: confidenceOf(top.support, same.length),
    support: top.support,
    total: same.length,
    reason: `Treated this way ${top.support} of ${same.length} times before.`,
    ruleId: ruleIdFor(pattern),
  };
}

export interface CandidateRule {
  pattern: string;
  treatment: string;
  decisions: number;
  share: number;
  ruleId: string;
}

/** Patterns decided often and consistently enough to be offered as a rule. A rule starts at level 0, so offering one acts on nothing. */
export function candidateRules(
  history: PastDecision[],
  opts: { minDecisions?: number; minShare?: number } = {},
): CandidateRule[] {
  const minDecisions = opts.minDecisions ?? 5;
  const minShare = opts.minShare ?? 0.95;
  const byPattern = new Map<string, Map<string, number>>();
  for (const h of history) {
    if (!h.pattern) continue;
    const m = byPattern.get(h.pattern) ?? new Map<string, number>();
    m.set(h.treatment, (m.get(h.treatment) ?? 0) + 1);
    byPattern.set(h.pattern, m);
  }
  const out: CandidateRule[] = [];
  for (const [pattern, m] of byPattern) {
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    const [treatment, n] = [...m.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0]!;
    if (total >= minDecisions && n / total >= minShare)
      out.push({
        pattern,
        treatment,
        decisions: total,
        share: n / total,
        ruleId: ruleIdFor(pattern),
      });
  }
  return out.sort(
    (a, b) => b.decisions - a.decisions || a.pattern.localeCompare(b.pattern),
  );
}
