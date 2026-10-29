import { describe, expect, it } from "vitest";
import { prune, selectRange, selectState, toggleOne } from "@/v2/lib/selection";

const order = ["a", "b", "c", "d", "e"];

describe("table selection", () => {
  it("toggles one row on and off without touching the others", () => {
    const one = toggleOne(new Set(["a"]), "c");
    expect([...one]).toEqual(["a", "c"]);
    expect([...toggleOne(one, "a")]).toEqual(["c"]);
  });
  it("shift-click selects every row between the anchor and the click, either direction", () => {
    expect([...selectRange(order, new Set(["b"]), "b", "d")].sort()).toEqual(["b", "c", "d"]);
    expect([...selectRange(order, new Set(["d"]), "d", "b")].sort()).toEqual(["b", "c", "d"]);
  });
  it("shift-click with no anchor just toggles the row", () => {
    expect([...selectRange(order, new Set(), null, "c")]).toEqual(["c"]);
  });
  it("reports none, some and all for the header checkbox", () => {
    expect(selectState(order, new Set())).toBe("none");
    expect(selectState(order, new Set(["a"]))).toBe("some");
    expect(selectState(order, new Set(order))).toBe("all");
    expect(selectState([], new Set())).toBe("none");
  });
  it("drops rows that left the table", () => {
    expect([...prune(new Set(["a", "z"]), order)]).toEqual(["a"]);
    const same = new Set(["a"]);
    expect(prune(same, order)).toBe(same);
  });
});
