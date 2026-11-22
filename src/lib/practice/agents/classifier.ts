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

/** Earlier decisions counted once, by pattern, so each line is a lookup and not a scan of the whole history. */
export interface DecisionIndex {
  byPattern: Map<string, Map<string, number>>;
  totals: Map<string, number>;
}

export function buildDecisionIndex(
  history: readonly PastDecision[],
): DecisionIndex {
  const byPattern = new Map<string, Map<string, number>>();
  const totals = new Map<string, number>();
  for (const h of history) {
    if (!h.pattern) continue;
    const counts = byPattern.get(h.pattern) ?? new Map<string, number>();
    counts.set(h.treatment, (counts.get(h.treatment) ?? 0) + 1);
    byPattern.set(h.pattern, counts);
    totals.set(h.pattern, (totals.get(h.pattern) ?? 0) + 1);
  }
  return { byPattern, totals };
}

const isIndex = (
  h: readonly PastDecision[] | DecisionIndex,
): h is DecisionIndex => !Array.isArray(h);

/**
 * Suggests a treatment for one line. To classify many lines, build the index once with buildDecisionIndex and pass it in:
 * a plain array is indexed again on every call, which is fine for one line and slow for thousands.
 */
export function suggestTreatment(
  line: LineToClassify,
  history: readonly PastDecision[] | DecisionIndex,
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
  const index = isIndex(history) ? history : buildDecisionIndex(history);
  const counts = index.byPattern.get(pattern);
  const total = index.totals.get(pattern) ?? 0;
  if (!counts || total === 0)
    return {
      kind: "none",
      reason: "No earlier decision for this kind of line.",
    };
  const ranked = [...counts.entries()]
    .map(([treatment, support]) => ({ treatment, support }))
    .sort(
      (a, b) => b.support - a.support || a.treatment.localeCompare(b.treatment),
    );
  const top = ranked[0]!;
  const share = top.support / total;
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
      reason: `Treated differently ${total - top.support} of ${total} times.`,
    };
  return {
    kind: "suggest",
    treatment: top.treatment,
    confidence: confidenceOf(top.support, total),
    support: top.support,
    total,
    reason: `Treated this way ${top.support} of ${total} times before.`,
    ruleId: ruleIdFor(pattern),
  };
}

/** Classifies many lines against one history, indexing it once. */
export function suggestMany(
  lines: readonly LineToClassify[],
  history: readonly PastDecision[],
): Suggestion[] {
  const index = buildDecisionIndex(history);
  return lines.map((l) => suggestTreatment(l, index));
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
