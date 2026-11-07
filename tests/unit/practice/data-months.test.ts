import { describe, expect, it } from "vitest";
import { monthsBetween } from "@/lib/practice/workspace.server";

describe("the Period list reaches back to the first month with data", () => {
  it("lists every month from the first to the last transaction", () => {
    expect(monthsBetween("2025-11-03", "2026-02-10")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(monthsBetween("2026-04-01", "2026-04-30")).toEqual(["2026-04"]);
  });
  it("reaches earlier than a year back", () => {
    const m = monthsBetween("2024-03-15", "2026-11-02");
    expect(m[0]).toBe("2024-03");
    expect(m).toHaveLength(33);
  });
  it("is empty for a missing or reversed range, and capped", () => {
    expect(monthsBetween(undefined, "2026-01-01")).toEqual([]);
    expect(monthsBetween("2026-05-01", "2025-01-01")).toEqual([]);
    expect(monthsBetween("1990-01-01", "2026-11-01", 120)).toHaveLength(120);
  });
});
