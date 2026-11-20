import { describe, expect, it } from "vitest";
import { closeOptions, groupNeeds, kindOf, nextDeadline, periodKey, tomorrow, visible } from "@/v2/lib/needsView";

const items = [
  { key: "ex:c1", rank: 2 }, { key: "so:r1", rank: 5 }, { key: "chase:h1", rank: 0 }, { key: "doc:d1", rank: 1 }, { key: "rv:c2", rank: 3 }, { key: "corr:r2", rank: 0 }, { key: "mis:c3", rank: 4 }, { key: "exo:c4", rank: 4 },
];

describe("needs you, by kind of work and by role", () => {
  it("groups the kinds into sign off, call, fix and decide", () => {
    const g = groupNeeds(items, "Partner");
    expect(g.map((x) => [x.key, x.items.map((i) => i.key)])).toEqual([
      ["signoff", ["mis:c3", "so:r1"]], ["call", ["chase:h1"]], ["fix", ["corr:r2", "doc:d1"]], ["decide", ["ex:c1", "rv:c2", "exo:c4"]],
    ]);
  });
  it("starts a partner's day with sign-off and a junior's with what blocks the month", () => {
    expect(groupNeeds(items, "Partner")[0]!.key).toBe("signoff");
    expect(groupNeeds(items, "Junior")[0]!.key).toBe("fix");
  });
  it("leaves out a group with nothing in it", () => {
    expect(groupNeeds([{ key: "rv:c2", rank: 3 }], "Partner").map((g) => g.key)).toEqual(["decide"]);
  });
  it("reads the kind from the key", () => {
    expect(kindOf("chase:abc")).toBe("chase");
  });
});

describe("closing an item without opening it", () => {
  it("offers snoozing for everything, and closing the chase only for a chase", () => {
    expect(closeOptions("chase:h1").map((o) => o.id)).toEqual(["chase_resolved", "snooze"]);
    for (const k of ["ex:c1", "rv:c2", "doc:d1", "so:r1", "mis:c3", "corr:r2"]) expect(closeOptions(k).map((o) => o.id)).toEqual(["snooze"]);
  });
  it("hides a snoozed item until the start of tomorrow, then shows it again", () => {
    const now = new Date("2026-11-20T10:00:00").getTime();
    const snoozed = { "ex:c1": tomorrow(now) };
    expect(visible(items, snoozed, now).hidden.map((i) => i.key)).toEqual(["ex:c1"]);
    expect(visible(items, snoozed, now + 15 * 3_600_000).hidden).toEqual([]);
  });
});

describe("the next date that matters", () => {
  it("reads a month label", () => {
    expect(periodKey("October 2026")).toBe("2026-10");
    expect(periodKey("nonsense")).toBeNull();
  });
  it("gives the next statutory date of the following month, and the days left", () => {
    expect(nextDeadline("October 2026", new Date("2026-11-03T09:00:00"))).toEqual({ label: "TDS", due: "2026-11-07", days: 4 });
    expect(nextDeadline("October 2026", new Date("2026-11-07T09:00:00"))).toMatchObject({ label: "TDS", days: 0 });
    expect(nextDeadline("October 2026", new Date("2026-11-08T09:00:00"))).toMatchObject({ label: "GSTR-1", due: "2026-11-11", days: 3 });
    expect(nextDeadline("October 2026", new Date("2026-11-12T09:00:00"))).toMatchObject({ label: "GSTR-3B", days: 8 });
    expect(nextDeadline("October 2026", new Date("2026-11-21T09:00:00"))).toBeNull();
  });
  it("rolls December into January", () => {
    expect(nextDeadline("December 2026", new Date("2027-01-01T09:00:00"))).toMatchObject({ due: "2027-01-07" });
  });
});
