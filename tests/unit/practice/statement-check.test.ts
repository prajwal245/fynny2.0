import { describe, expect, it } from "vitest";
import { checkStatement, findOverlap, overlapSentence, type CheckRow } from "@/lib/practice/extract/statementCheck";

/** A statement the way a bank prints it: each line moves the balance by its amount. */
function build(opening: number, lines: [string, "in" | "out", number][]): CheckRow[] {
  let bal = opening;
  return lines.map(([date, direction, amount], i) => {
    bal = Math.round((bal + (direction === "in" ? amount : -amount)) * 100) / 100;
    return { index: i, date, direction, amount, balance: bal };
  });
}

const OCT: [string, "in" | "out", number][] = [
  ["2026-10-01", "in", 118000],
  ["2026-10-03", "out", 42000],
  ["2026-10-07", "out", 7500],
  ["2026-10-12", "in", 50300],
  ["2026-10-15", "out", 90000],
  ["2026-10-22", "out", 17.7],
  ["2026-10-28", "in", 842.5],
];

describe("is the statement correct and complete", () => {
  it("passes when every line moves the balance by its amount, and says the opening and closing balance", () => {
    const c = checkStatement(build(1_000_000, OCT));
    expect(c.status).toBe("pass");
    expect(c.breaks).toEqual([]);
    expect(c.opening).toBe(1_000_000);
    expect(c.closing).toBe(1_000_000 + 118000 - 42000 - 7500 + 50300 - 90000 - 17.7 + 842.5);
    expect(c.checks.map((x) => x.label)).toEqual(["Running balance", "Opening and closing balance", "Dates"]);
    expect(c.checks.every((x) => x.ok)).toBe(true);
    expect(c.headline).toMatch(/Correct and complete: 7 lines from 2026-10-01 to 2026-10-28/);
  });

  it("a missing line is one break, with its line, date and the amount that is missing", () => {
    const all = build(1_000_000, OCT);
    const without = all.filter((_, i) => i !== 4).map((r, i) => ({ ...r, index: i })); // the 90,000 payment is gone
    const c = checkStatement(without);
    expect(c.status).toBe("fail");
    expect(c.breaks).toHaveLength(1);
    expect(c.breaks[0]).toMatchObject({ line: 5, date: "2026-10-22", difference: -90000 });
    expect(c.breaks[0]!.note).toMatch(/₹90,000\.00 lower.*money out is missing/);
    expect(c.headline).toMatch(/Line 5 \(2026-10-22\)/);
    expect(c.checks[0]!.ok).toBe(false);
  });

  it("a line read the wrong way round is named as such", () => {
    const rows = build(1_000_000, OCT).map((r, i) => (i === 3 ? { ...r, direction: "out" as const } : r));
    const c = checkStatement(rows);
    expect(c.status).toBe("fail");
    expect(c.breaks[0]!.note).toMatch(/other way/);
  });

  it("reads a statement printed newest first the same way", () => {
    const rows = build(1_000_000, OCT)
      .reverse()
      .map((r, i) => ({ ...r, index: i }));
    const c = checkStatement(rows);
    expect(c.order).toBe("newest_first");
    expect(c.status).toBe("pass");
    expect(c.opening).toBe(1_000_000);
  });

  it("without a balance column it says it could not check, instead of passing", () => {
    const c = checkStatement(build(0, OCT).map((r) => ({ ...r, balance: null })));
    expect(c.status).toBe("unknown");
    expect(c.checks[0]).toMatchObject({ ok: null });
    expect(c.headline).toMatch(/No balance column/);
  });

  it("a month with no lines, or a long quiet stretch, is a warning even when the balance follows", () => {
    const c = checkStatement(build(500000, [["2026-08-02", "in", 1000], ["2026-08-20", "out", 200], ["2026-10-04", "in", 3000]]));
    expect(c.status).toBe("warn");
    expect(c.emptyMonths).toEqual(["2026-09"]);
    expect(c.gaps.map((g) => g.days)).toEqual([18, 45]);
    expect(c.headline).toMatch(/no lines in 2026-09/);
  });

  it("the chain resumes after a break, so one missing line is one break and not a cascade", () => {
    const all = build(100000, [["2026-10-01", "in", 1000], ["2026-10-02", "out", 500], ["2026-10-03", "in", 700], ["2026-10-04", "out", 300], ["2026-10-05", "in", 100]]);
    const c = checkStatement(all.filter((_, i) => i !== 2).map((r, i) => ({ ...r, index: i })));
    expect(c.breaks).toHaveLength(1);
  });

  it("handles an empty statement and a single line", () => {
    expect(checkStatement([]).status).toBe("unknown");
    expect(checkStatement(build(100, [["2026-10-01", "in", 5]])).status).toBe("unknown");
  });
});

describe("the same lines in two statements of one account", () => {
  const apr = build(100000, [["2026-06-10", "in", 5000], ["2026-06-15", "out", 1200], ["2026-06-20", "in", 800], ["2026-06-28", "out", 300]]);
  it("counts the overlap once and says which dates", () => {
    const next = build(apr[1]!.balance! , []);
    expect(next).toEqual([]);
    const second = [
      { date: "2026-06-15", direction: "out" as const, amount: 1200, balance: apr[1]!.balance },
      { date: "2026-06-20", direction: "in" as const, amount: 800, balance: apr[2]!.balance },
      { date: "2026-06-28", direction: "out" as const, amount: 300, balance: apr[3]!.balance },
      { date: "2026-07-05", direction: "in" as const, amount: 9000, balance: 108000 },
    ];
    const o = findOverlap(second, apr);
    expect(o).toMatchObject({ count: 3, from: "2026-06-15", to: "2026-06-28", differentBalance: 0 });
    expect(overlapSentence(o, 4)).toBe("3 of 4 lines (2026-06-15 to 2026-06-28) are already in an earlier statement of this account and are counted once.");
  });
  it("two real payments of the same amount on one day are not one repeated line", () => {
    const first = [{ date: "2026-06-15", direction: "out" as const, amount: 500, balance: 9500 }];
    const second = [{ date: "2026-06-15", direction: "out" as const, amount: 500, balance: 9000 }];
    const o = findOverlap(second, first);
    expect(o.count).toBe(0);
    expect(o.differentBalance).toBe(1);
    expect(overlapSentence(o, 1)).toMatch(/a different balance, so it is a separate transaction/);
  });
  it("matches one to one: a line shown once in the old statement covers one line of the new, not two", () => {
    const first = [{ date: "2026-06-15", direction: "out" as const, amount: 500, balance: 9500 }];
    const second = [first[0]!, { ...first[0]! }];
    expect(findOverlap(second, first).count).toBe(1);
  });
  it("says nothing when there is no overlap", () => {
    expect(overlapSentence(findOverlap([{ date: "2026-08-01", direction: "in", amount: 1, balance: 1 }], apr), 1)).toBeNull();
  });
});
