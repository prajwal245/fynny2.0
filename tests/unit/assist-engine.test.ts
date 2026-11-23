import { describe, expect, it } from "vitest";
import {
  DEFAULT_ASSIST_CONFIG as C,
  FRESH_PREFS,
  StuckDetector,
  mergeConfig,
  recordAccepted,
  recordDismissal,
  recordShown,
  type AssistPrefs,
} from "@/v2/assist/assistEngine";
import { guideFor, hasOpenWork } from "@/v2/assist/guides";

const T0 = 1_000_000_000_000;
const prefs = (over: Partial<AssistPrefs> = {}): AssistPrefs => ({
  ...FRESH_PREFS,
  screens: {},
  ...over,
});
const ctx = { screen: "/app/exceptions", hasOpenWork: true, busy: false };
const fresh = () => {
  const d = new StuckDetector(C);
  d.enter("/app/exceptions", T0);
  return d;
};

describe("when the assistant offers help", () => {
  it("does not treat quiet time alone as being stuck", () => {
    const d = fresh();
    expect(
      d.evaluate(T0 + C.idleMs * 5, { ...ctx, hasOpenWork: false }, prefs()),
    ).toBeNull();
  });
  it("offers after quiet time on a screen with work waiting", () => {
    const d = fresh();
    expect(d.evaluate(T0 + C.idleMs - 1, ctx, prefs())).toBeNull();
    expect(d.evaluate(T0 + C.idleMs, ctx, prefs())).toBe("idle");
  });
  it("counts a click as activity", () => {
    const d = fresh();
    d.interact(T0 + 60_000);
    expect(d.evaluate(T0 + C.idleMs, ctx, prefs())).toBeNull();
    expect(d.evaluate(T0 + 60_000 + C.idleMs, ctx, prefs())).toBe("idle");
  });
  it("notices the same section opened and closed repeatedly", () => {
    const d = fresh();
    for (let i = 0; i < 3; i++) d.toggle("Candidates", T0 + 5_000 + i * 4_000);
    expect(d.evaluate(T0 + 20_000, ctx, prefs())).toBe("repeat_toggle");
  });
  it("does not count toggles spread over a long time", () => {
    const d = fresh();
    for (let i = 0; i < 3; i++)
      d.toggle("Candidates", T0 + i * (C.repeatWindowMs + 1));
    expect(
      d.evaluate(
        T0 + 3 * (C.repeatWindowMs + 1),
        { ...ctx, hasOpenWork: false },
        prefs(),
      ),
    ).toBeNull();
  });
  it("notices repeated errors", () => {
    const d = fresh();
    d.error(T0 + 1000);
    expect(d.evaluate(T0 + 2000, ctx, prefs())).toBeNull();
    d.error(T0 + 3000);
    expect(d.evaluate(T0 + 4000, ctx, prefs())).toBe("errors");
  });
  it("notices coming back to the same screen without finishing", () => {
    const d = new StuckDetector(C);
    for (const [s, t] of [
      ["/app/exceptions", 0],
      ["/app/documents", 1],
      ["/app/exceptions", 2],
      ["/app/documents", 3],
      ["/app/exceptions", 4],
    ] as const)
      d.enter(s, T0 + t * 60_000);
    expect(d.evaluate(T0 + 4 * 60_000 + 1000, ctx, prefs())).toBe("revisit");
  });
});

describe("it stays out of the way", () => {
  const stuck = () => {
    const d = fresh();
    d.error(T0 + 1);
    d.error(T0 + 2);
    return d;
  };
  it("waits while someone is typing, or a dialog is open", () => {
    const d = stuck();
    d.key(T0 + 10_000);
    expect(d.evaluate(T0 + 12_000, ctx, prefs())).toBeNull();
    expect(d.evaluate(T0 + 10_000 + C.typingQuietMs, ctx, prefs())).toBe(
      "errors",
    );
    expect(d.evaluate(T0 + 99_000, { ...ctx, busy: true }, prefs())).toBeNull();
  });
  it("is silent when switched off", () => {
    expect(
      stuck().evaluate(T0 + 5_000, ctx, prefs({ enabled: false })),
    ).toBeNull();
  });
  it("keeps a cooldown between prompts", () => {
    const d = stuck();
    expect(d.evaluate(T0 + 5_000, ctx, recordShown(prefs(), T0))).toBeNull();
    expect(d.evaluate(T0 + C.cooldownMs, ctx, recordShown(prefs(), T0))).toBe(
      "idle",
    );
  });
  it("stops after the session cap", () => {
    const d = stuck();
    for (let i = 0; i < C.maxPerSession; i++) d.markShown();
    expect(d.evaluate(T0 + 5_000, ctx, prefs())).toBeNull();
  });
  it("snoozes a dismissed screen for a day and a repeated dismissal for a week", () => {
    const d = stuck();
    const once = recordDismissal(prefs(), "/app/exceptions", T0, C);
    expect(d.evaluate(T0 + C.snoozeMs - 1, ctx, once)).toBeNull();
    expect(d.evaluate(T0 + C.snoozeMs, ctx, once)).toBe("idle");
    const twice = recordDismissal(once, "/app/exceptions", T0 + C.snoozeMs, C);
    expect(twice.screens["/app/exceptions"]!.until).toBe(
      T0 + C.snoozeMs + C.suppressMs,
    );
  });
  it("accepting help quiets the screen without a strike", () => {
    const p = recordAccepted(prefs(), "/app/exceptions", T0, C);
    expect(p.screens["/app/exceptions"]).toEqual({
      dismissed: 0,
      until: T0 + C.snoozeMs,
    });
  });
  it("does not fire twice for one cause", () => {
    const d = stuck();
    expect(d.evaluate(T0 + 5_000, ctx, prefs())).toBe("errors");
    d.reset(T0 + 5_000);
    expect(d.evaluate(T0 + 6_000, ctx, prefs())).toBeNull();
  });
});

describe("configuration and content", () => {
  it("merges only sane overrides", () => {
    const c = mergeConfig({
      idleMs: 30_000,
      cooldownMs: -5,
      errorCount: "x",
      nope: 1,
    });
    expect(c.idleMs).toBe(30_000);
    expect(c.cooldownMs).toBe(C.cooldownMs);
    expect(c.errorCount).toBe(C.errorCount);
  });
  it("has a guide for each working screen and none for settings", () => {
    for (const p of [
      "/app",
      "/app/close",
      "/app/exceptions",
      "/app/review",
      "/app/documents",
      "/app/reports",
      "/app/gst",
      "/app/chaser",
    ])
      expect(guideFor(p), p).not.toBeNull();
    expect(guideFor("/app/reports/abc")?.screen).toBe("/app/reports");
    expect(guideFor("/app/settings")).toBeNull();
  });
  it("offers only where something waits, and never writes an instruction to change a figure", () => {
    expect(
      hasOpenWork("/app/exceptions", { exceptions: 0, review: 4, chases: 0 }),
    ).toBe(false);
    expect(
      hasOpenWork("/app/exceptions", { exceptions: 2, review: 0, chases: 0 }),
    ).toBe(true);
    for (const p of [
      "/app",
      "/app/close",
      "/app/exceptions",
      "/app/review",
      "/app/documents",
      "/app/reports",
      "/app/gst",
      "/app/chaser",
    ]) {
      const g = guideFor(p)!;
      const text = [
        g.offer("idle", { exceptions: 2, review: 2, chases: 2 }),
        ...g.steps.map((s) => s.text),
      ].join(" ");
      expect(text, p).not.toMatch(
        /\b(post it|file it|sign it off now|delete)\b/i,
      );
    }
  });
});
