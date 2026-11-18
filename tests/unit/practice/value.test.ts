import { describe, expect, it } from "vitest";
import { DEFAULT_SECONDS_PER_LINE, valueFrom } from "@/lib/practice/value";

describe("the value of a month", () => {
  it("on the demo pack: 32 bank lines, 4 set aside, 26 matched, 3 decisions", () => {
    const v = valueFrom({ bankLines: 32, autoMatched: 26, manualMatched: 0, setAside: 4, decisionsLeft: 3 });
    expect(v.workLines).toBe(28);
    expect(v.autoPct).toBe(92.9); // 26 of 28
    expect(v.handledByFynHelp).toBe(30);
    expect(v.hoursSaved).toBe(0.4); // 30 lines x 45 s = 22.5 minutes
    expect(v.sentence).toContain("92.9% of 28 bank lines matched automatically (26)");
    expect(v.sentence).toContain("3 decisions left");
    expect(v.sentence).toContain(`assuming ${DEFAULT_SECONDS_PER_LINE} seconds a line`);
  });
  it("says so when there is nothing to measure instead of inventing a percentage", () => {
    const v = valueFrom({ bankLines: 0, autoMatched: 0, manualMatched: 0, setAside: 0, decisionsLeft: 0 });
    expect(v.autoPct).toBeNull();
    expect(v.hoursSaved).toBe(0);
    expect(v.sentence).toBe("No bank lines in this month yet.");
  });
  it("uses the firm's own seconds per line, and never exceeds 100 percent", () => {
    const v = valueFrom({ bankLines: 100, autoMatched: 100, manualMatched: 0, setAside: 0, decisionsLeft: 0, secondsPerLine: 90 });
    expect(v.autoPct).toBe(100);
    expect(v.hoursSaved).toBe(2.5);
    expect(valueFrom({ bankLines: 10, autoMatched: 12, manualMatched: 0, setAside: 0, decisionsLeft: 0 }).autoPct).toBe(100);
  });
  it("a month where a person did the matching shows a low automatic share, honestly", () => {
    const v = valueFrom({ bankLines: 50, autoMatched: 5, manualMatched: 40, setAside: 0, decisionsLeft: 5 });
    expect(v.autoPct).toBe(10);
    expect(v.manualMatched).toBe(40);
  });
});
