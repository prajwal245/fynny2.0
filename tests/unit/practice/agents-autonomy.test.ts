import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  PROMOTE_MIN_DECISIONS,
  decideMode,
  newRule,
  overrideRate,
  promote,
  promotionVerdict,
  recordDecision,
  type AgentId,
  type FirmAgentSettings,
  type RuleStats,
} from "@/lib/practice/agents/autonomy";
import {
  AUDIT_SAMPLE,
  autoMatchPrecision,
  genuineExceptionShare,
  reviewRules,
  sampleForAudit,
} from "@/lib/practice/agents/evaluation";
import { ACTIONS, needsPause, riskOf } from "@/v2/lib/agentTrust";

const on = (...agents: AgentId[]): FirmAgentSettings => ({
  killSwitch: false,
  enabled: Object.fromEntries(agents.map((a) => [a, true])),
});
const rule = (over: Partial<RuleStats> = {}): RuleStats => ({
  ...newRule("r1", "classifier"),
  ...over,
});
const decide = (
  rule: RuleStats | null,
  actionId: string,
  valueInr: number | null = 100,
  settings = on("classifier", "query", "gst"),
) => decideMode({ agent: "classifier", actionId, rule, valueInr, settings });

describe("the risk table covers every new action, and none can be silent when it cannot be undone", () => {
  const NEW = [
    "query_send",
    "classify_suggest",
    "review_run",
    "conductor_plan",
    "gst_supplier_send",
    "rule_promote",
  ];
  it("classifies each new action", () => {
    for (const id of NEW)
      expect(
        ACTIONS.some((a) => a.id === id),
        id,
      ).toBe(true);
  });
  it("gives a message to a client a pause window, and a message to a supplier an explicit gate", () => {
    expect(riskOf("query_send")).toMatchObject({
      reversible: false,
      gate: "undo",
      undoSeconds: 8,
    });
    expect(riskOf("gst_supplier_send")).toMatchObject({
      reversible: false,
      gate: "confirm",
    });
    expect(needsPause("query_send")).toBe(true);
  });
  it("keeps the rule that no irreversible action has only a light cue", () => {
    for (const a of ACTIONS)
      if (!a.reversible) expect(a.gate, a.id).not.toBe("light");
  });
});

describe("the ladder", () => {
  it("starts every rule at suggest, with nothing counted", () => {
    expect(newRule("x", "query")).toMatchObject({
      level: 0,
      decisions: 0,
      overridden: 0,
    });
  });

  it("will not promote before enough decisions", () => {
    const v = promotionVerdict(rule({ decisions: PROMOTE_MIN_DECISIONS - 1 }));
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/1 more/);
  });

  it("will not promote a rule overridden more than 0.5%", () => {
    expect(promotionVerdict(rule({ decisions: 200, overridden: 2 })).ok).toBe(
      false,
    ); // 1%
    expect(promotionVerdict(rule({ decisions: 200, overridden: 1 })).ok).toBe(
      true,
    ); // exactly 0.5%
  });

  it("promotes to level 1, resetting the count so it earns its place again", () => {
    const up = promote(rule({ decisions: 250, overridden: 0 }));
    expect(up).toMatchObject({ level: 1, decisions: 0, overridden: 0 });
  });

  it("will not let a rule act silently without a value cap", () => {
    expect(
      promotionVerdict(rule({ level: 1, decisions: 300, valueCapInr: null }))
        .reason,
    ).toMatch(/value cap/);
    expect(
      promotionVerdict(rule({ level: 1, decisions: 300, valueCapInr: 10_000 }))
        .to,
    ).toBe(2);
  });

  it("never promotes past level 2", () => {
    expect(promotionVerdict(rule({ level: 2, decisions: 999 })).ok).toBe(false);
    expect(promote(rule({ level: 2, decisions: 999 })).level).toBe(2);
  });

  it("demotes a silent rule on its very first override", () => {
    const r = recordDecision(
      rule({ level: 2, decisions: 500, valueCapInr: 5000 }),
      true,
    );
    expect(r).toMatchObject({ level: 0, decisions: 0, overridden: 0 });
  });

  it("demotes a rule at level 1 once its override rate breaks the bar on a real sample", () => {
    let r = rule({ level: 1, decisions: 19, overridden: 0, valueCapInr: 5000 });
    r = recordDecision(r, true); // 20 decisions, 1 override: 5%
    expect(r.level).toBe(0);
  });

  it("does not demote on a single override in a tiny sample at level 1", () => {
    const r = recordDecision(
      rule({ level: 1, decisions: 3, overridden: 0 }),
      true,
    );
    expect(r.level).toBe(1);
  });

  it("counts a decision without mutating the original", () => {
    const original = rule({ level: 1, decisions: 10 });
    const next = recordDecision(original, false);
    expect(next.decisions).toBe(11);
    expect(original.decisions).toBe(10);
  });

  it("computes an override rate of zero with no decisions", () => {
    expect(overrideRate({ decisions: 0, overridden: 0 })).toBe(0);
  });
});

describe("what an agent may do right now", () => {
  const silentRule = rule({ level: 2, valueCapInr: 10_000 });
  const undoRule = rule({ level: 1 });

  it("only suggests when the agent is off, the kill switch is on, or there is no rule", () => {
    expect(decide(silentRule, "recon_match", 100, DEFAULT_SETTINGS).mode).toBe(
      "suggest",
    );
    expect(
      decide(silentRule, "recon_match", 100, {
        killSwitch: true,
        enabled: { classifier: true },
      }).mode,
    ).toBe("suggest");
    expect(decide(null, "recon_match").mode).toBe("suggest");
    expect(decide(rule({ level: 0 }), "recon_match").mode).toBe("suggest");
  });

  it("acts silently only on a reversible, light action under a level 2 rule", () => {
    expect(decide(silentRule, "recon_match").mode).toBe("act_silent");
    expect(decide(silentRule, "classify_suggest").mode).toBe("act_silent");
  });

  it("NEVER acts silently on an irreversible action, whatever the level", () => {
    for (const a of ACTIONS.filter((x) => !x.reversible)) {
      const m = decide(silentRule, a.id).mode;
      expect(m, a.id).not.toBe("act_silent");
    }
  });

  it("gives a client message the pause window, not silence, at level 1 and 2", () => {
    expect(decide(undoRule, "query_send")).toMatchObject({
      mode: "act_with_undo",
      undoSeconds: 8,
    });
    expect(decide(silentRule, "query_send")).toMatchObject({
      mode: "act_with_undo",
      undoSeconds: 8,
    });
  });

  it("always asks a person for a confirm-gated action, even at level 2", () => {
    for (const id of [
      "gst_supplier_send",
      "mis_signoff",
      "period_lock",
      "books_post",
      "rule_promote",
    ]) {
      expect(decide(silentRule, id).mode, id).toBe("suggest");
    }
  });

  it("treats an action nobody classified as irreversible", () => {
    expect(decide(silentRule, "something_new").mode).toBe("suggest");
  });

  it("respects the value cap, and a missing amount counts as over it", () => {
    expect(decide(silentRule, "recon_match", 10_000).mode).toBe("act_silent");
    expect(decide(silentRule, "recon_match", 10_001).mode).toBe("suggest");
    expect(decide(silentRule, "recon_match", null).mode).toBe("suggest");
  });

  it("applies a reversible action with undo at level 1", () => {
    expect(decide(undoRule, "recon_match").mode).toBe("act_with_undo");
  });
});

describe("the evaluation loop", () => {
  it("does not judge precision on a small sample", () => {
    const r = autoMatchPrecision(
      Array.from({ length: 50 }, () => ({ correct: true })),
    );
    expect(r).toMatchObject({
      n: 50,
      value: 1,
      enough: false,
      meetsTarget: null,
    });
  });

  it("judges precision at 0.995 on a full sample", () => {
    const sample = (wrong: number) =>
      Array.from({ length: AUDIT_SAMPLE }, (_, i) => ({ correct: i >= wrong }));
    expect(autoMatchPrecision(sample(1)).meetsTarget).toBe(true); // 199/200 = 0.995
    expect(autoMatchPrecision(sample(2)).meetsTarget).toBe(false);
  });

  it("measures the share of genuine exceptions against the 70% target", () => {
    const d = (genuine: number, n: number) =>
      Array.from({ length: n }, (_, i) => ({ genuine: i < genuine }));
    expect(genuineExceptionShare(d(21, 30)).meetsTarget).toBe(true);
    expect(genuineExceptionShare(d(20, 30)).meetsTarget).toBe(false);
    expect(genuineExceptionShare(d(1, 32)).value).toBeCloseTo(0.03, 1); // the design partner's bad month
  });

  it("returns the same audit sample for the same seed, a different one for another", () => {
    const ids = Array.from({ length: 1000 }, (_, i) => `m${i}`);
    expect(sampleForAudit(ids, 200, 7)).toEqual(sampleForAudit(ids, 200, 7));
    expect(sampleForAudit(ids, 200, 7)).not.toEqual(
      sampleForAudit(ids, 200, 8),
    );
    expect(new Set(sampleForAudit(ids, 200, 7)).size).toBe(200);
  });

  it("returns everything when asked for more than exist, and leaves the input alone", () => {
    const ids = ["a", "b", "c"];
    expect(sampleForAudit(ids, 200, 1)).toHaveLength(3);
    expect(ids).toEqual(["a", "b", "c"]);
    expect(sampleForAudit([], 5, 1)).toEqual([]);
  });

  it("recommends demote, promote or hold for each rule", () => {
    const verdicts = reviewRules([
      rule({ id: "slipping", level: 1, decisions: 40, overridden: 4 }),
      rule({ id: "ready", level: 0, decisions: 300, overridden: 0 }),
      rule({ id: "young", level: 0, decisions: 10, overridden: 0 }),
    ]);
    expect(verdicts.map((v) => [v.id, v.action])).toEqual([
      ["slipping", "demote"],
      ["ready", "promote"],
      ["young", "hold"],
    ]);
  });
});
