import { describe, expect, it } from "vitest";
import { isReversalCredit, pairReversals, type ReversalLeg } from "@/lib/practice/recon/reversals";

const leg = (o: Partial<ReversalLeg>): ReversalLeg => ({ id: "x", extractionId: "A", direction: "out", amount: 29490, date: "2025-05-03", description: "UPI/512383420328/Salary", ...o });

describe("a payment the bank gave back", () => {
  it("pairs a UPI debit with its RVSL credit for the same amount", () => {
    const p = pairReversals([leg({ id: "o" }), leg({ id: "i", direction: "in", description: "UPI/RVSL512383341772/Salary" })]);
    expect(p).toHaveLength(1);
    expect(p[0]!.evidence).toMatch(/marked as a reversal/);
  });
  it("needs the credit to say it is a reversal", () => {
    expect(pairReversals([leg({ id: "o" }), leg({ id: "i", direction: "in", description: "UPI/CR/SHARMA STEELS" })])).toHaveLength(0);
    expect(isReversalCredit({ direction: "in", description: "UPI/RVSL1234" })).toBe(true);
    expect(isReversalCredit({ direction: "out", description: "UPI/RVSL1234" })).toBe(false);
  });
  it("needs equal amounts, the debit first, within three days, on one statement", () => {
    const o = leg({ id: "o" });
    const rev = (x: Partial<ReversalLeg>) => leg({ id: "i", direction: "in", description: "UPI/RVSL99", ...x });
    expect(pairReversals([o, rev({ amount: 29491 })])).toHaveLength(0);
    expect(pairReversals([o, rev({ date: "2025-05-02" })])).toHaveLength(0);
    expect(pairReversals([o, rev({ date: "2025-05-07" })])).toHaveLength(0);
    expect(pairReversals([o, rev({ extractionId: "B" })])).toHaveLength(0);
    expect(pairReversals([o, rev({ date: "2025-05-06" })])).toHaveLength(1);
  });
  it("leaves it alone when more than one payment could be the one reversed", () => {
    const rev = leg({ id: "i", direction: "in", description: "UPI/RVSL99", date: "2025-05-04" });
    expect(pairReversals([leg({ id: "o1" }), leg({ id: "o2", date: "2025-05-03" }), rev])).toHaveLength(0);
  });
  it("two payments each with their own reversal are paired one to one", () => {
    const legs = [
      leg({ id: "o1", amount: 100 }), leg({ id: "i1", direction: "in", amount: 100, description: "UPI/RVSL1", date: "2025-05-03" }),
      leg({ id: "o2", amount: 200 }), leg({ id: "i2", direction: "in", amount: 200, description: "UPI/RVSL2", date: "2025-05-04" }),
    ];
    expect(pairReversals(legs).map((p) => [p.out.id, p.in.id])).toEqual([["o1", "i1"], ["o2", "i2"]]);
  });
});
