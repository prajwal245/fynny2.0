import { describe, expect, it, vi } from "vitest";
import { ACTIONS, chaseHandoff, confidenceView, needsPause, riskOf, undoable } from "@/v2/lib/agentTrust";

describe("confidence in words", () => {
  it.each([[0.97, "sure", "Confident"], [0.9, "sure", "Confident"], [0.75, "likely", "Likely right"], [0.7, "likely", "Likely right"], [0.55, "check", "Check this"], [0.2, "unsure", "Not sure"]])("%s → %s", (s, level, label) => {
    expect(confidenceView(s)).toMatchObject({ level, label });
  });
  it("is safe for a missing or out-of-range score", () => {
    expect(confidenceView(NaN).level).toBe("unsure");
    expect(confidenceView(5).percent).toBe(100);
    expect(confidenceView(-1).percent).toBe(0);
  });
  it("keeps the review queue's 70% line between 'check' and 'likely'", () => {
    expect(confidenceView(0.69).level).toBe("check");
    expect(confidenceView(0.7).level).toBe("likely");
  });
});

describe("the reversibility map", () => {
  it("gives every irreversible action a pause or a gate, never a bare 'light' cue", () => {
    for (const a of ACTIONS) if (!a.reversible) expect(a.gate, a.id).not.toBe("light");
  });
  it("gives a pause window to exactly the actions that go outside the firm and cannot come back", () => {
    expect(ACTIONS.filter((a) => a.gate === "undo").map((a) => a.id)).toEqual(["chase_send"]);
    expect(riskOf("chase_send").undoSeconds).toBeGreaterThan(0);
  });
  it("treats an action nobody has classified as irreversible", () => {
    expect(riskOf("something_new")).toMatchObject({ reversible: false, gate: "confirm" });
    expect(needsPause("something_new")).toBe(true);
    expect(needsPause("recon_match")).toBe(false);
  });
});

describe("the pause window", () => {
  it("runs the action when the window ends", async () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const u = undoable(run, 8);
    vi.advanceTimersByTime(7_999);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    await expect(u.done).resolves.toBe("ran");
    expect(run).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
  it("never runs the action if it is taken back in time, and cannot be taken back afterwards", async () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const u = undoable(run, 8);
    vi.advanceTimersByTime(3_000);
    expect(u.cancel()).toBe(true);
    vi.advanceTimersByTime(20_000);
    await expect(u.done).resolves.toBe("cancelled");
    expect(run).not.toHaveBeenCalled();
    const v = undoable(run, 1);
    vi.advanceTimersByTime(1_500);
    await v.done;
    expect(v.cancel()).toBe(false);
    vi.useRealTimers();
  });
});

describe("a hand-off", () => {
  it("says what was done, why it stops, and who has it", () => {
    const h = chaseHandoff({ followUps: 3, type: "Bank statement", contact: "Mr. Rao", timeline: [{ at: "1", text: "Chase created" }, { at: "2", text: "Sent a reminder on WhatsApp." }, { at: "3", text: "Escalated to the partner." }] });
    expect(h.title).toBe("Handed to you");
    expect(h.did).toMatch(/Mr\. Rao for bank statement and followed up 3 times\. Last: Sent a reminder on WhatsApp/);
    expect(h.why).toMatch(/no reply/);
    expect(h.now).toMatch(/call/i);
  });
});
