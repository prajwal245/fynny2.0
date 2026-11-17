import { describe, expect, it } from "vitest";
import { computeFigures, isNamedParty, particularsOf, ruleInsights, type NarrateTxn } from "@/lib/practice/narrate/calc";

const t = (id: string, direction: "in" | "out", amount: number, counterparty: string | null, description = ""): NarrateTxn =>
  ({ id, direction, amount, txn_date: "2025-05-10", counterparty, description, category: null, match_status: "matched" }) as unknown as NarrateTxn;

describe("MIS: a bank code is not a customer", () => {
  it("recognises codes and names", () => {
    expect(isNamedParty("TFR")).toBe(false);
    expect(isNamedParty("NEFT")).toBe(false);
    expect(isNamedParty("Unnamed party")).toBe(false);
    expect(isNamedParty("Sharma Steels")).toBe(true);
  });
  it("does not report '66% of revenue is TFR'", () => {
    const rev = [t("a", "in", 6600, "TFR"), t("b", "in", 3400, "Sharma Steels")];
    const f = computeFigures(rev, [], rev);
    const text = ruleInsights(f, rev, rev).map((i) => i.text).join(" ");
    expect(text).not.toMatch(/TFR/);
    expect(text).not.toMatch(/accounts for 66/);
  });
  it("still reports a real concentration, naming the customer", () => {
    const rev = [t("a", "in", 7000, "Sharma Steels"), t("b", "in", 3000, "Ravi Traders")];
    const text = ruleInsights(computeFigures(rev, [], rev), rev, rev).map((i) => i.text).join(" ");
    expect(text).toMatch(/Sharma Steels accounts for 70%/);
  });
  it("the largest payment shows the party, and a code never stands in for one", () => {
    expect(particularsOf("Rent", "NEFT/UTIB/12345/RENT")).toContain("Rent");
    expect(particularsOf("TFR", "TRANSFER TO 1234")).toBe("TRANSFER TO 1234");
  });
  it("labels the cash movement as covering every rupee", () => {
    const rev = [t("a", "in", 100, "Sharma Steels"), t("b", "out", 40, "Rent")];
    expect(ruleInsights(computeFigures(rev, [], rev), rev, [rev[0]!]).map((i) => i.text).join(" ")).toMatch(/including loans, taxes, advances and transfers/);
  });
});
