/**
 * The autonomy ladder: how far an agent may act on its own, per rule and per firm. Pure, so every rule is tested.
 *
 *   Level 0  Suggest              shows a proposal with its reason; a person acts
 *   Level 1  Act with undo        applies it, lists it, one click to undo
 *   Level 2  Act silently         applies it and keeps an audit record (reversible, low-value rules only)
 *
 * A rule moves up only after enough decisions with almost no overrides, and moves down on the first sign it is wrong.
 * Whatever level a rule has, an action that cannot be taken back is never silent: the risk table decides that, not the rule.
 */
import { riskOf } from "@/v2/lib/agentTrust";

export type AgentId =
  "query" | "classifier" | "reviewer" | "conductor" | "gst" | "evaluator";
export type Level = 0 | 1 | 2;
export const LEVEL_LABEL: Record<Level, string> = {
  0: "Suggest",
  1: "Act with undo",
  2: "Act silently",
};

/** A rule moves up only after this many decisions, with at most this share overridden. */
export const PROMOTE_MIN_DECISIONS = 200;
export const PROMOTE_MAX_OVERRIDE = 0.005;
/** Below this many decisions a rule's override rate is too noisy to demote on, except at level 2, where any override demotes. */
export const DEMOTE_MIN_DECISIONS = 20;

export interface RuleStats {
  id: string;
  agent: AgentId;
  level: Level;
  /** Decisions made at the current level. Reset on every move, so a rule must earn its place again. */
  decisions: number;
  overridden: number;
  /** The most the rule may act on alone, in rupees. Required for level 2. */
  valueCapInr: number | null;
}

export interface FirmAgentSettings {
  /** Stops every agent acting. Suggestions still show. */
  killSwitch: boolean;
  /** Each agent is off until a partner switches it on. */
  enabled: Partial<Record<AgentId, boolean>>;
}
export const DEFAULT_SETTINGS: FirmAgentSettings = {
  killSwitch: false,
  enabled: {},
};

export const newRule = (
  id: string,
  agent: AgentId,
  valueCapInr: number | null = null,
): RuleStats => ({
  id,
  agent,
  level: 0,
  decisions: 0,
  overridden: 0,
  valueCapInr,
});

export const overrideRate = (
  s: Pick<RuleStats, "decisions" | "overridden">,
): number => (s.decisions > 0 ? s.overridden / s.decisions : 0);

export interface Verdict {
  ok: boolean;
  to: Level | null;
  reason: string;
}

/** Whether the rule has earned a move up. A person still chooses to promote it. */
export function promotionVerdict(s: RuleStats): Verdict {
  if (s.level === 2)
    return { ok: false, to: null, reason: "Already at the highest level." };
  if (s.decisions < PROMOTE_MIN_DECISIONS)
    return {
      ok: false,
      to: null,
      reason: `Needs ${PROMOTE_MIN_DECISIONS - s.decisions} more decisions at this level.`,
    };
  if (overrideRate(s) > PROMOTE_MAX_OVERRIDE)
    return {
      ok: false,
      to: null,
      reason: `Overridden ${(overrideRate(s) * 100).toFixed(1)}% of the time; the limit is ${PROMOTE_MAX_OVERRIDE * 100}%.`,
    };
  if (s.level === 1 && s.valueCapInr === null)
    return {
      ok: false,
      to: null,
      reason: "Set a value cap before it can act silently.",
    };
  return {
    ok: true,
    to: (s.level + 1) as Level,
    reason: `${s.decisions} decisions, ${s.overridden} overridden.`,
  };
}

/** Promotes a rule a person has approved moving up, if it has earned it. Never promotes on its own. */
export function promote(s: RuleStats): RuleStats {
  const v = promotionVerdict(s);
  return v.ok && v.to !== null
    ? { ...s, level: v.to, decisions: 0, overridden: 0 }
    : s;
}

/** Records one decision and demotes the rule if it has slipped. A demoted rule starts its count again. */
export function recordDecision(s: RuleStats, overridden: boolean): RuleStats {
  const next = {
    ...s,
    decisions: s.decisions + 1,
    overridden: s.overridden + (overridden ? 1 : 0),
  };
  // Any override of a silent action takes the rule back to suggesting.
  if (s.level === 2 && overridden)
    return { ...next, level: 0, decisions: 0, overridden: 0 };
  // At level 1, a rule that no longer meets the bar it was promoted on steps down.
  if (
    s.level === 1 &&
    next.decisions >= DEMOTE_MIN_DECISIONS &&
    overrideRate(next) > PROMOTE_MAX_OVERRIDE
  )
    return { ...next, level: 0, decisions: 0, overridden: 0 };
  return next;
}

export type ActMode = "suggest" | "act_with_undo" | "act_silent";
export interface ModeDecision {
  mode: ActMode;
  reason: string;
  undoSeconds?: number;
}

/**
 * What an agent may do with one action right now. Every path that is not clearly allowed ends in "suggest".
 */
export function decideMode(input: {
  agent: AgentId;
  actionId: string;
  rule: RuleStats | null;
  valueInr: number | null;
  settings: FirmAgentSettings;
}): ModeDecision {
  const { agent, actionId, rule, valueInr, settings } = input;
  if (settings.killSwitch)
    return { mode: "suggest", reason: "Agents are paused for this firm." };
  if (!settings.enabled[agent])
    return {
      mode: "suggest",
      reason: "This agent is switched off for this firm.",
    };
  if (!rule || rule.level === 0)
    return {
      mode: "suggest",
      reason: "No rule has earned the right to act alone yet.",
    };
  const risk = riskOf(actionId);
  // A confirm gate (a sign-off, a lock, a write into the books, a message to a third party) always needs a person.
  if (risk.gate === "confirm")
    return {
      mode: "suggest",
      reason: `${risk.label} always needs a person to confirm.`,
    };
  if (
    rule.valueCapInr !== null &&
    (valueInr === null || valueInr > rule.valueCapInr)
  )
    return {
      mode: "suggest",
      reason: "The amount is above this rule's value cap.",
    };
  if (rule.level === 2 && risk.reversible && risk.gate === "light")
    return {
      mode: "act_silent",
      reason: "A reversible action under a rule with a clean record.",
    };
  // Level 1, or level 2 on an action that cannot be silent: act, but with the pause window.
  if (risk.gate === "undo")
    return {
      mode: "act_with_undo",
      reason: "Goes out after a short window in which it can be cancelled.",
      undoSeconds: risk.undoSeconds ?? 8,
    };
  if (risk.reversible)
    return {
      mode: "act_with_undo",
      reason: "Applied, and listed so it can be undone.",
    };
  return {
    mode: "suggest",
    reason: "This action cannot be taken back, so it is only suggested.",
  };
}
