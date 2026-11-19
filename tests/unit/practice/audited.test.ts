import { describe, expect, it } from "vitest";
import { compareOpening, proveStatements, readStatement } from "@/lib/practice/audited";

const BS = `(Amount in '000)
Note
No.
Figures as at the end of year
31st March 2025
Figures as at the end of year
31st March 2024
Rs.  Rs.
A  EQUITY AND LIABILITIES
1 Shareholders’ funds
(a) Share capital  1  100.00  100.00
(b) Reserves and surplus  2  300.00  200.00
3 Non-current liabilities
(a) Long-term borrowings  3  50.00  40.00
4 Current liabilities
(a) Short Term Borrowings  4  60.00  30.00
(b) Trade payables
(A) total outstanding dues of micro enterprises and small enterprises
(B) total outstanding dues of Creditors other than micro enterprises and small enterprises  5  250.00
(c) Other current liabilities*  6  40.00  20.00
TOTAL  800.00  500.00
B  ASSETS
1 Non-current assets
(a)(i) Property, Plant and Equipment  8  200.00  100.00
2 Current assets
(b) Inventories  10  150.00  100.00
(c) Trade receivables  5  350.00  200.00
(d) Cash and cash equivalents  11  100.00  100.00
TOTAL  800.00  500.00
Date: 13-09-2025`;
const PL = `(Amount in '000)
I  Revenue from operations (gross)  15  900.00  500.00
III  Total Income (I+II)  900.00  500.00
Total Expenses  780.00  440.00
V  Profit before exceptional and extraordinary iteam and tax  120.00  60.00
IX  Profit before Tax  120.00  60.00
(a) Current tax expense  20.00  10.00
(b) Deferred tax  0.00  0.00
XV  Profit/ (Loss) for the Period  100.00  50.00
STATEMENT OF PROFIT AND LOSS ACCOUNT FOR THE YEAR ENDED 31st MARCH 2025`;

describe("audited statements", () => {
  it("reads figures in thousands as rupees, and a trade payables line that has no prior-year figure", () => {
    const bs = readStatement(BS, "balance_sheet");
    expect(bs.unit).toBe(1000);
    expect(bs.asAt).toBe("2025-03-31");
    expect(bs.lines.find((l) => l.key === "trade_payables")).toMatchObject({ current: 250000, prior: null });
    expect(bs.lines.find((l) => l.key === "trade_receivables")!.current).toBe(350000);
    expect(bs.totals).toEqual({ liabilities: 800000, assets: 800000 });
  });
  it("proves the statements before using them", () => {
    const c = proveStatements(readStatement(BS, "balance_sheet"), readStatement(PL, "profit_and_loss"));
    expect(c.every((x) => x.ok)).toBe(true);
    expect(c.map((x) => x.label)).toContain("Reserves roll forward by the year's profit");
  });
  it("says when a total does not add up or reserves do not roll", () => {
    const bad = BS.replace("(c) Trade receivables  5  350.00  200.00", "(c) Trade receivables  5  340.00  200.00");
    const c = proveStatements(readStatement(bad, "balance_sheet"), readStatement(PL, "profit_and_loss"));
    expect(c.find((x) => x.label.startsWith("Assets add up"))!.ok).toBe(false);
    const pl2 = readStatement(PL.replace("100.00  50.00", "90.00  50.00"), "profit_and_loss");
    expect(proveStatements(readStatement(BS, "balance_sheet"), pl2).some((x) => !x.ok)).toBe(true);
  });
});

describe("opening balances against the audit", () => {
  const bs = readStatement(BS, "balance_sheet");
  const L = (name: string, parent: string, opening: number) => ({ name, parent, opening, gstin: null, state: null });
  it("groups Tally's openings (debit negative) into the audited heads", () => {
    const r = compareOpening(bs, [
      L("Share Capital", "Capital Account", 100000), L("Profit & Loss A/c", "Reserves & Surplus", 300000),
      L("Term loan", "Loans (Liability)", 50000), L("CC", "Bank OD A/c", 60000),
      L("Creditor A", "Sundry Creditors", 250000), L("GST payable", "Duties & Taxes", 40000),
      L("Plant", "Fixed Assets", -200000), L("Stock", "Stock-in-Hand", -150000), L("Debtor A", "Sundry Debtors", -350000), L("Bank", "Bank Accounts", -100000),
    ]);
    expect(r.rows.every((x) => x.status === "agree")).toBe(true);
    expect(r.unmapped).toEqual([]);
  });
  it("shows a difference and lists a custom group instead of forcing it into a head", () => {
    const r = compareOpening(bs, [L("Creditor A", "Sundry Creditors", 245000), L("X", "Weird Group", 5000)]);
    expect(r.rows.find((x) => x.bucket === "payables")).toMatchObject({ audited: 250000, tally: 245000, diff: -5000, status: "differs" });
    expect(r.unmapped).toEqual([{ group: "Weird Group", amount: 5000, ledgers: 1 }]);
  });
});

describe("a line with one figure", () => {
  it("belongs to the year whose total it makes tie", () => {
    const text = BS.replace("(d) Cash and cash equivalents  11  100.00  100.00", "(d) Cash and cash equivalents  11  100.00  100.00\n(c) Deferred Tax Assets  1.74");
    const bs = readStatement(text, "balance_sheet");
    const dta = bs.lines.find((l) => l.key === "deferred_tax_asset")!;
    expect(dta.current).toBeNull();
    expect(dta.prior).toBe(1740);
    expect(proveStatements(bs, null).find((x) => x.label.startsWith("Assets add up"))!.ok).toBe(true);
    // The payables line is needed to make the liabilities tie, so it is the current year's.
    expect(bs.lines.find((l) => l.key === "trade_payables")).toMatchObject({ current: 250000, prior: null });
  });
});
