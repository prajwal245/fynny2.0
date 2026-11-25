import { describe, expect, it } from "vitest";
import { aisVsBooks, chartReview, closedByJournal, entityFromName, openedClosed, rcmReview, readAis, salesVsGstr1, unchangedBalances, runYearChecks } from "@/lib/practice/review/yearChecks";
import type { Voucher } from "@/lib/practice/review/dayBook";
import type { TrialBalance, TbLedger } from "@/lib/practice/review/trialBalance";

let row = 0;
const v = (date: string, type: string, no: string, legs: [string, number, number][]): Voucher => ({ date, type, no, narration: "", row: ++row, legs: legs.map(([ledger, debit, credit]) => ({ ledger, debit, credit })) });
const tbl = (name: string, opening: number, movementDr: number, movementCr: number, group = "Sundry Debtors"): TbLedger => ({ name, group, primary: group, opening, movementDr, movementCr, movement: movementDr - movementCr, closing: opening + movementDr - movementCr, row: 1 });
const TB = (ledgers: TbLedger[]): TrialBalance => ({ ledgers, statedOpeningDiff: null, closingStated: true, notes: [] });

describe("every check says blocked, never passed, when its file is missing", () => {
  it("blocks each check and names the file", () => {
    const all = runYearChecks({ vouchers: [], tb: null, ledgers: [], gstr1: null, ais: null, tdsInBooks: null, entity: "unknown" });
    expect(all.map((c) => c.status)).toEqual(Array(7).fill("blocked"));
    expect(all.every((c) => c.needs.length > 0)).toBe(true);
  });
});

describe("sales against GSTR-1", () => {
  const books = [v("2025-04-10", "Sales", "1", [["Debtor", 1180, 0], ["18% Sales", 0, 1000], ["Output IGST 18%", 0, 180]]), v("2025-05-10", "Sales", "2", [["Debtor", 590, 0], ["18% Sales", 0, 500], ["Output IGST 18%", 0, 90]])];
  it("agrees when books and return match, and lists the month that differs", () => {
    const ok = salesVsGstr1(books, [{ month: "2025-04", taxable: 1000, tax: 180 }, { month: "2025-05", taxable: 500, tax: 90 }]);
    expect(ok.status).toBe("clear");
    const bad = salesVsGstr1(books, [{ month: "2025-04", taxable: 1000, tax: 180 }, { month: "2025-05", taxable: 400, tax: 72 }]);
    expect(bad.status).toBe("findings");
    expect(bad.rows).toHaveLength(1);
    expect(bad.rows[0]!.ref).toBe("2025-05");
  });
});

describe("reverse charge", () => {
  it("flags credit taken with no liability, and liability with no credit", () => {
    const c = rcmReview([
      v("2025-04-05", "Journal", "1", [["Freight", 1000, 0], ["RCM IGST PAYABLE", 0, 50], ["Creditors", 0, 950]]),
      v("2025-05-05", "Journal", "2", [["RCM IGST INPUT", 50, 0], ["Creditors", 0, 50]]),
    ]);
    expect(c.status).toBe("findings");
    expect(c.rows.length).toBeGreaterThanOrEqual(2);
  });
  it("says so when there is no reverse-charge entry at all", () => {
    expect(rcmReview([v("2025-04-05", "Sales", "1", [["A", 1, 0], ["Sales", 0, 1]])]).status).toBe("clear");
  });
});

describe("AIS", () => {
  const text = "Financial Year 2025-26\nGST turnover\nSale of goods   1,000.00\nTDS/TCS Information\nXYZ Ltd   50.00\nSFT Information\nCash deposit Indian Bank   200,000.00\n";
  it("reads categories and amounts", () => {
    const a = readAis(text);
    expect(a.fy).toBe("2025-26");
    expect(a.lines.map((x) => x.category)).toEqual(["GST turnover", "TDS/TCS", "SFT"]);
  });
  it("a scanned AIS is blocked, not read as empty", () => {
    const c = aisVsBooks([v("2025-04-01", "Sales", "1", [["A", 1, 0], ["Sales", 0, 1]])], readAis(""), null);
    expect(c.status).toBe("blocked");
  });
  it("lists turnover difference and SFT items", () => {
    const c = aisVsBooks([v("2025-04-01", "Sales", "1", [["A", 5000, 0], ["Sales", 0, 5000]])], readAis(text), 50);
    expect(c.rows.map((r) => r.ref)).toEqual(["Turnover", "SFT"]);
  });
});

describe("chart of accounts and entity type", () => {
  it("flags proprietor ledgers in a company and a missing share capital", () => {
    const c = chartReview([{ name: "Proprietor Capital" }, { name: "Drawings" }], "company");
    expect(c.status).toBe("findings");
    expect(c.rows.some((r) => /proprietorship/.test(r.detail))).toBe(true);
    expect(c.rows.some((r) => r.ref === "Share capital")).toBe(true);
  });
  it("does not say a ledger is missing when the list is only what moved this year", () => {
    expect(chartReview([{ name: "Sales" }], "company", false).status).toBe("clear");
  });
  it("infers entity from the name", () => {
    expect(entityFromName("Satkaarika Enterprises Pvt Ltd")).toBe("company");
    expect(entityFromName("Rao & Co LLP")).toBe("llp");
  });
});

describe("trial balance movement checks", () => {
  const tb = TB([tbl("New Debtor", 0, 500, 0), tbl("Old Debtor", 800, 0, 800), tbl("Dormant Advance", 300, 0, 0, "Loans & Advances (Asset)"), tbl("Cleared by JV", 400, 0, 400), tbl("Active", 100, 50, 0)]);
  const vs = [v("2025-06-01", "Sales", "1", [["New Debtor", 500, 0], ["Sales", 0, 500]]), v("2025-07-01", "Receipt", "2", [["Old Debtor", 0, 800], ["Bank", 800, 0]]), v("2026-03-31", "Journal", "9", [["Cleared by JV", 0, 400], ["Misc", 400, 0]]), v("2025-08-01", "Sales", "3", [["Active", 50, 0], ["Sales", 0, 50]])];
  it("opened and closed", () => {
    const c = openedClosed(tb, vs);
    expect(c.rows.map((r) => r.ref).sort()).toEqual(["Cleared by JV", "New Debtor", "Old Debtor"]);
  });
  it("unchanged balances", () => {
    expect(unchangedBalances(tb, vs).rows.map((r) => r.ref)).toEqual(["Dormant Advance"]);
  });
  it("closed by journal names only the journal clearances", () => {
    expect(closedByJournal(tb, vs).rows.map((r) => r.ref)).toEqual(["Cleared by JV"]);
  });
  it("without the trial balance these three are blocked", () => {
    expect([openedClosed(null, vs), unchangedBalances(null, vs), closedByJournal(null, vs)].every((c) => c.status === "blocked")).toBe(true);
  });
});
