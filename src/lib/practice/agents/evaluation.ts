/**
 * The evaluation loop: what we measure about the agents themselves, so autonomy is earned by numbers and not by hope.
 * Pure. Sampling is seeded, so an audit can be repeated and checked.
 */
import {
  PROMOTE_MAX_OVERRIDE,
  promotionVerdict,
  type AgentId,
  type RuleStats,
} from "./autonomy";

/** The targets set in the PRD. */
export const TARGETS = {
  autoMatchPrecision: 0.995,
  genuineExceptionShare: 0.7,
  queryAnsweredShare: 0.6,
  suggestionAcceptShare: 0.6,
} as const;
/** A precision figure needs at least this many audited matches to mean anything. */
export const AUDIT_SAMPLE = 200;

export interface Rate {
  n: number;
  value: number | null;
  meetsTarget: boolean | null;
  enough: boolean;
}

function rate(hits: number, n: number, target: number, minN: number): Rate {
  const value = n > 0 ? hits / n : null;
  const enough = n >= minN;
  return {
    n,
    value,
    enough,
    meetsTarget: enough && value !== null ? value >= target : null,
  };
}

/** Of the auto-matches a person audited, the share that were right. Not judged until the sample is big enough. */
export const autoMatchPrecision = (audited: { correct: boolean }[]): Rate =>
  rate(
    audited.filter((a) => a.correct).length,
    audited.length,
    TARGETS.autoMatchPrecision,
    AUDIT_SAMPLE,
  );
/** Of the exceptions a person worked, the share that were real. The rest should have matched. */
export const genuineExceptionShare = (decided: { genuine: boolean }[]): Rate =>
  rate(
    decided.filter((d) => d.genuine).length,
    decided.length,
    TARGETS.genuineExceptionShare,
    30,
  );
export const queryAnsweredShare = (
  sent: { answeredWithinDays: boolean }[],
): Rate =>
  rate(
    sent.filter((s) => s.answeredWithinDays).length,
    sent.length,
    TARGETS.queryAnsweredShare,
    20,
  );
export const suggestionAcceptShare = (shown: { accepted: boolean }[]): Rate =>
  rate(
    shown.filter((s) => s.accepted).length,
    shown.length,
    TARGETS.suggestionAcceptShare,
    30,
  );

/** A small, fast, seeded generator so the same seed always picks the same sample. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A repeatable random sample for a human audit. Asking for more than exist returns them all. */
export function sampleForAudit<T>(
  items: readonly T[],
  n: number = AUDIT_SAMPLE,
  seed = 1,
): T[] {
  const a = [...items];
  const rnd = mulberry32(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a.slice(0, Math.max(0, Math.min(n, a.length)));
}

export interface RuleVerdict {
  id: string;
  agent: AgentId;
  action: "promote" | "hold" | "demote";
  reason: string;
}

/** What the weekly review recommends for each rule. A demotion is applied automatically; a promotion is a person's decision. */
export function reviewRules(rules: RuleStats[]): RuleVerdict[] {
  return rules.map((r) => {
    const rateNow = r.decisions > 0 ? r.overridden / r.decisions : 0;
    if (r.level > 0 && r.decisions >= 20 && rateNow > PROMOTE_MAX_OVERRIDE)
      return {
        id: r.id,
        agent: r.agent,
        action: "demote",
        reason: `Overridden ${(rateNow * 100).toFixed(1)}% of ${r.decisions} decisions.`,
      } as const;
    const v = promotionVerdict(r);
    return v.ok
      ? ({
          id: r.id,
          agent: r.agent,
          action: "promote",
          reason: v.reason,
        } as const)
      : ({
          id: r.id,
          agent: r.agent,
          action: "hold",
          reason: v.reason,
        } as const);
  });
}
