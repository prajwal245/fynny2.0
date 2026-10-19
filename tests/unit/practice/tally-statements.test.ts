import { describe, expect, it } from "vitest";
import {
  balanceSheet,
  fromTallySign,
  monthlySeries,
  parties,
  profitAndLoss,
  resolveLedgers,
  reviewBooks,
  trialBalance,
  type GroupMaster,
  type LedgerBalance,
} from "@/lib/practice/tally/statements";

// A small, balanced book. Debit positive, credit negative.
const groups: GroupMaster[] = [
  { name: "Sundry Debtors", parent: "Current Assets" },
  { name: "Sundry Creditors", parent: "Current Liabilities" },
  { name: "Bank Accounts", parent: "Current Assets" },
  { name: "Duties & Taxes", parent: "Current Liabilities" },
  { name: "Reserves & Surplus", parent: "Capital Account" },
  { name: "Online Sales", parent: "Sales Accounts" }, // user-made group under a primary
  { name: "Staff Costs", parent: "Indirect Expenses" },
];
const ledgers: LedgerBalance[] = [
  { name: "Owner Capital", parent: "Capital Account", closing: -500_000 },
  { name: "Opening Reserves", parent: "Reserves & Surplus", closing: -100_000 },
  { name: "HDFC Current A/c", parent: "Bank Accounts", closing: 300_000 },
  { name: "Kaveri Fashions", parent: "Sundry Debtors", closing: 200_000 },
  { name: "Office Mart", parent: "Sundry Creditors", closing: -50_000 },
  { name: "GST Payable", parent: "Duties & Taxes", closing: -40_000 },
  { name: "Computers", parent: "Fixed Assets", closing: 150_000 },
  { name: "Web Sales", parent: "Online Sales", closing: -900_000 },
  { name: "Consulting Income", parent: "Direct Incomes", closing: -100_000 },
  { name: "Interest Received", parent: "Indirect Incomes", closing: -10_000 },
  { name: "Material Purchases", parent: "Purchase Accounts", closing: 400_000 },
  { name: "Freight Inward", parent: "Direct Expenses", closing: 50_000 },
  { name: "Salaries", parent: "Staff Costs", closing: 300_000 },
  { name: "Rent", parent: "Indirect Expenses", closing: 120_000 },
];
// debit 1,520,000 ; credit 1,700,000 → add the missing 180,000 debit as stock
ledgers.push({ name: "Closing Stock", parent: "Stock-in-Hand", closing: 180_000 });
groups.push({ name: "Stock-in-Hand", parent: "Current Assets" });

const res = resolveLedgers(groups, ledgers);

describe("Tally statements", () => {
  it("flips Tally's sign once so debits are positive", () => {
    expect(fromTallySign(-1500.5)).toBe(1500.5);
    expect(fromTallySign(2000)).toBe(-2000);
  });

  it("walks user-made groups up to Tally's primary group", () => {
    const web = res.find((r) => r.name === "Web Sales")!;
    expect(web.primary).toBe("Sales Accounts");
    expect(web.nature).toBe("income");
    expect(res.find((r) => r.name === "Salaries")!.primary).toBe("Indirect Expenses");
    expect(res.find((r) => r.name === "Opening Reserves")!.path).toEqual(["Capital Account", "Reserves & Surplus"]);
  });

  it("survives a group cycle and an unknown group", () => {
    const r = resolveLedgers([{ name: "A", parent: "B" }, { name: "B", parent: "A" }], [{ name: "X", parent: "A", closing: 5 }, { name: "Y", parent: "Mystery", closing: 5 }]);
    expect(r.map((x) => x.nature)).toEqual(["other", "other"]);
    expect(r[0].primary).toBe("");
  });

  it("balances the trial balance", () => {
    const tb = trialBalance(res);
    expect(tb.balanced).toBe(true);
    expect(tb.totalDebit).toBe(tb.totalCredit);
    expect(tb.rows.find((r) => r.ledger === "Web Sales")).toMatchObject({ debit: 0, credit: 900_000 });
  });

  it("builds Schedule III style P&L", () => {
    const pl = profitAndLoss(res);
    expect(pl.revenueTotal).toBe(1_000_000); // sales + direct income
    expect(pl.otherIncomeTotal).toBe(10_000);
    expect(pl.directCostsTotal).toBe(450_000);
    expect(pl.grossProfit).toBe(550_000);
    expect(pl.indirectExpensesTotal).toBe(420_000);
    expect(pl.netProfit).toBe(140_000);
    expect(pl.grossMarginPct).toBe(55);
    expect(pl.netMarginPct).toBe(14);
  });

  it("builds a balance sheet that carries profit into equity and balances", () => {
    const bs = balanceSheet(res);
    expect(bs.balanced).toBe(true);
    expect(bs.totalAssets).toBe(830_000);
    expect(bs.totalLiabilities).toBe(830_000);
    const funds = bs.liabilities.find((s) => s.title === "Shareholders' funds")!;
    expect(funds.lines.map((l) => l.label)).toContain("Profit for the year");
    const current = bs.assets.find((s) => s.title === "Current assets")!;
    expect(current.lines.map((l) => l.label)).toEqual(expect.arrayContaining(["Trade receivables", "Cash and bank balances", "Inventories"]));
  });

  it("lists parties by size and ignores wrong-way balances", () => {
    const p = parties(resolveLedgers(groups, [...ledgers, { name: "Advance Co", parent: "Sundry Debtors", closing: -5000 }]));
    expect(p.debtors).toEqual([{ name: "Kaveri Fashions", amount: 200_000 }]);
    expect(p.creditors).toEqual([{ name: "Office Mart", amount: 50_000 }]);
  });

  it("derives monthly movement from year-to-date snapshots", () => {
    const apr = profitAndLoss(resolveLedgers(groups, ledgers.map((l) => ({ ...l, closing: l.closing / 2 }))));
    const may = profitAndLoss(res);
    const m = monthlySeries([{ asOn: "2026-04-30", pl: apr }, { asOn: "2026-05-31", pl: may }]);
    expect(m.map((x) => x.month)).toEqual(["2026-04", "2026-05"]);
    expect(m[0].revenue).toBe(500_000);
    expect(m[1].revenue).toBe(500_000);
    expect(m[0].netProfit + m[1].netProfit).toBe(140_000);
  });

  describe("books agent", () => {
    it("is quiet about a clean book", () => {
      expect(reviewBooks(res).filter((f) => f.severity !== "info")).toEqual([]);
    });

    it("flags suspense, negative bank, wrong-way parties and an untallied book", () => {
      const dirty = resolveLedgers(
        [...groups, { name: "Suspense A/c", parent: "Suspense A/c" }],
        [
          ...ledgers,
          { name: "Suspense", parent: "Suspense A/c", closing: 25_000 },
          { name: "SBI OD", parent: "Bank Accounts", closing: -8_000 },
          { name: "Advance Co", parent: "Sundry Debtors", closing: -5_000 },
          { name: "Prepaid Vendor", parent: "Sundry Creditors", closing: 7_000 },
        ],
      );
      const ids = reviewBooks(dirty).map((f) => f.id);
      expect(ids).toEqual(expect.arrayContaining(["suspense", "negative-cash", "debtor-credit", "creditor-debit"]));
      expect(reviewBooks(dirty)[0].severity).toBe("high");

      const broken = resolveLedgers(groups, [...ledgers, { name: "Typo", parent: "Sundry Debtors", closing: 999 }]);
      expect(reviewBooks(broken).map((f) => f.id)).toContain("tb-out-of-balance");
    });

    it("flags ledgers it cannot place", () => {
      const f = reviewBooks(resolveLedgers(groups, [...ledgers, { name: "Orphan", parent: "Nowhere", closing: 10 }]));
      expect(f.find((x) => x.id === "unmapped")?.ledgers).toEqual(["Orphan"]);
    });
  });
});
