import { describe, expect, it } from "vitest";
import type { MasterLedger } from "@/lib/practice/extract/tallyMasters";
import { checkOpeningBalances, mapMasters, readBalanceSheetRows, readBalanceSheetText } from "@/lib/practice/verify/openingBalance";
import { inputsHash, isStale, stableStringify, withStaleness } from "@/lib/practice/verify/types";

/**
 * A masked copy of a real signed balance sheet's text, with its quirks kept: amounts in '000, Indian digit grouping, note numbers beside
 * the amounts, heads with no amounts, a head whose comparative year the PDF text lost (Trade payables, one amount), and a stray single
 * amount (Deferred Tax Assets) that is in neither year's total. Names and figures are made up; the totals tie.
 */
const TEXT = `ACME BUILDERS PRIVATE LIMITED BALANCE SHEET AS ON 31ST MARCH 2025
Particulars (Amount in '000) Note No. Figures as at the end of year 31st March 2025 Figures as at the end of year 31st March 2024 Rs. Rs.
A EQUITY AND LIABILITIES 1 Shareholders’ funds (a) Share capital 1 1,000.00 1,000.00 (b) Reserves and surplus 2 2,500.00 900.00
(b) Money Received against share warrents - 2 Share application money pending allotments - 3 Non-current liabilities
(a) Long-term borrowings 3 1,200.00 800.00 (b) Deferred tax liabilities (net) 70.00 20.00 (c) Other Long Term Liabilities (d) Long term provision 4 Current liabilities
(a) Short Term Borrowings 4 7,000.00 6,000.00
(b) Trade payables (A) total outstanding dues of micro enterprises and small enterprises (B) total outstanding dues of Creditors other than micro enterprises and small enterprises 5 5,000.00
(c) Other current liabilities\\* 6 8,000.00 2,000.00 (d) Short-term provisions 7 1,000.00 200.00 TOTAL 25,770.00 15,420.00 B ASSETS
1 Non-current assets (a)(i) Property, Plant and Equipment 8 1,100.00 300.00 (b) Non-current investments 9 5,000.00 600.00 (c) Deferred Tax Assets 0.20 (d) Long term loans and Advances (e) Other Non Current Assets
2 Current assets (a) Current Investments (b) Inventories 10 4,000.00 2,900.00 (c) Trade receivables 5 6,200.00 4,600.00 (d) Cash and cash equivalents 11 80.00 1,700.00
(e) Short-term loans and advances 12 7,500.00 600.00 (f) Other Current Assets 13 1,890.00 900.00 TOTAL 25,770.00 11,600.00 See accompanying notes forming part of the financial statements 14`;

const L = (name: string, parent: string, opening: number): MasterLedger => ({ name, parent, opening, gstin: null, state: null });
/** Tally writes a debit balance NEGATIVE and a credit balance positive. */
const MASTERS: MasterLedger[] = [
  L("Share Capital", "Capital Account", 1_000_000),
  L("General Reserve", "Reserves & Surplus", 1_600_000),
  L("Profit & Loss A/c", "Primary", 900_000),
  L("Term Loan", "Secured Loans", 1_200_000),
  L("Cash Credit Bank", "Bank Accounts", 7_000_000), // a credit balance on a bank ledger is an overdraft
  L("Deferred Tax Liability", "Current Liabilities", 70_000),
  L("Creditor One", "Sundry Creditors", 3_000_000),
  L("Creditor Two", "Sundry Creditors", 2_000_000),
  L("GST Payable", "Duties & Taxes", 3_000_000),
  L("Audit Fee Provision", "Provisions", 6_000_000),
  L("Plant and Machinery", "Fixed Assets", -1_100_000),
  L("Mutual Funds", "Investments", -5_000_000),
  L("Closing Stock", "Stock-in-Hand", -4_000_000),
  L("Debtor One", "Sundry Debtors", -6_200_000),
  L("Cash", "Cash-in-Hand", -30_000),
  L("Bank A", "Bank Accounts", -50_000),
  L("Advances to Suppliers", "Loans & Advances (Asset)", -7_500_000),
  L("Security Deposit", "Deposits (Asset)", -1_000_000),
  L("TDS Receivable", "Current Assets", -890_000),
];

describe("reading the audited balance sheet text", () => {
  const s = readBalanceSheetText(TEXT);
  it("reads the unit, the date and the printed totals", () => {
    expect(s.unit).toBe(1000);
    expect(s.asOn).toBe("2025-03-31");
    expect(s.printed).toEqual({ liabilities: 25_770_000, assets: 25_770_000 });
  });
  it("reads each head with its closing and comparative amounts in rupees", () => {
    const h = (k: string) => s.heads.find((x) => x.key === k)!;
    expect(h("share_capital")).toMatchObject({ current: 1_000_000, previous: 1_000_000, side: "liability", bucket: "equity" });
    expect(h("reserves")).toMatchObject({ current: 2_500_000, previous: 900_000 });
    expect(h("deferred_tax_liab")).toMatchObject({ current: 70_000, bucket: "deferred_tax" });
    expect(h("ppe")).toMatchObject({ current: 1_100_000, side: "asset", bucket: "fixed_assets" });
    expect(h("other_current_liab")).toMatchObject({ current: 8_000_000 });
    expect(h("cash")).toMatchObject({ current: 80_000, bucket: "cash" });
  });
  it("ties out, and uses the document's own totals to place the single-amount heads", () => {
    expect(s.tied).toBe(true);
    const tp = s.heads.find((x) => x.key === "trade_payables")!;
    expect(tp).toMatchObject({ current: 5_000_000, previous: null, placedByTieOut: true });
    const dta = s.heads.find((x) => x.key === "deferred_tax_asset")!;
    expect(dta.current).toBe(0);
    expect(dta.previous).toBe(200);
  });
  it("holds the schedule when a head is misread, and says by how much", () => {
    const bad = readBalanceSheetText(TEXT.replace("11 80.00 1,700.00", "11 800.00 1,700.00"));
    expect(bad.tied).toBe(false);
    expect(bad.reasons.join(" ")).toMatch(/do not add up to the totals the balance sheet prints/);
  });
  it("holds the schedule when the document's own totals are not in the text", () => {
    const bad = readBalanceSheetText(TEXT.replace(/TOTAL [\d,.]+ [\d,.]+/g, ""));
    expect(bad.tied).toBe(false);
    expect(bad.reasons.join(" ")).toMatch(/TOTAL lines were not found/);
  });
  it("reads an Excel schedule the same way", () => {
    const rows = [
      ["ACME BUILDERS PRIVATE LIMITED", "", ""],
      ["Balance sheet as on 31st March 2025 (Amount in '000)", "", ""],
      ["Share capital", "1,000.00", "1,000.00"],
      ["Reserves and surplus", "2,500.00", "900.00"],
      ["Long-term borrowings", "1,200.00", "800.00"],
      ["Deferred tax liabilities (net)", "70.00", "20.00"],
      ["Short Term Borrowings", "7,000.00", "6,000.00"],
      ["Trade payables", "5,000.00", ""],
      ["Other current liabilities", "8,000.00", "2,000.00"],
      ["Short-term provisions", "1,000.00", "200.00"],
      ["TOTAL", "25,770.00", "15,420.00"],
      ["Property, Plant and Equipment", "1,100.00", "300.00"],
      ["Non-current investments", "5,000.00", "600.00"],
      ["Inventories", "4,000.00", "2,900.00"],
      ["Trade receivables", "6,200.00", "4,600.00"],
      ["Cash and cash equivalents", "80.00", "1,700.00"],
      ["Short-term loans and advances", "7,500.00", "600.00"],
      ["Other Current Assets", "1,890.00", "900.00"],
      ["TOTAL", "25,770.00", "11,600.00"],
    ];
    const s2 = readBalanceSheetRows(rows);
    expect(s2.tied).toBe(true);
    expect(s2.asOn).toBe("2025-03-31");
    expect(s2.heads.find((h) => h.key === "trade_payables")!.current).toBe(5_000_000);
  });
});

describe("placing the Tally ledgers", () => {
  const t = mapMasters(MASTERS);
  it("treats a credit balance on a bank ledger as a borrowing, not cash", () => {
    expect(t.buckets.get("borrowings")!.amount).toBe(8_200_000);
    expect(t.buckets.get("cash")!.amount).toBe(80_000);
  });
  it("signs liabilities as credits and assets as debits, and finds the openings balanced", () => {
    expect(t.buckets.get("trade_receivables")!.amount).toBe(6_200_000);
    expect(t.buckets.get("equity")!.amount).toBe(3_500_000);
    expect(t.debit).toBe(t.credit);
    expect(t.unmapped).toHaveLength(0);
  });
  it("lists a ledger it cannot place instead of adding it anywhere", () => {
    const x = mapMasters([...MASTERS, L("Head Office", "Branch / Divisions", -123_456)]);
    expect(x.unmapped.map((l) => l.name)).toEqual(["Head Office"]);
  });
});

describe("opening balances against last year's audit", () => {
  const audited = readBalanceSheetText(TEXT);
  const run = (over: Partial<Parameters<typeof checkOpeningBalances>[0]> = {}) =>
    checkOpeningBalances({ auditedName: "Audited Balance Sheet FY 2024-25.pdf", mastersName: "Masters.xml", audited, masters: MASTERS, tallyOpensOn: "2025-04-01", ...over });

  it("passes when every group agrees, with the source of every figure", () => {
    const c = run();
    expect(c.status).toBe("passed");
    expect(c.totals).toMatchObject({ checked: 11, matched: 11, open: 0 });
    expect(c.summary).toMatch(/All 11 balance sheet groups agree/);
    const cash = c.lines.find((l) => l.id === "opening:cash")!;
    expect(cash.figures.map((f) => [f.label, f.amount])).toEqual([["Audited closing", 80_000], ["Tally opening", 80_000]]);
    expect(cash.figures[0]!.source.document).toBe("Audited Balance Sheet FY 2024-25.pdf");
    expect(cash.ruleId).toBe("OB-1");
  });
  it("catches a deliberately altered ledger and names the group and the amount", () => {
    const altered = MASTERS.map((l) => (l.name === "Debtor One" ? { ...l, opening: -6_500_000 } : l));
    const c = run({ masters: altered });
    expect(c.status).toBe("differences");
    const line = c.lines.find((l) => l.state === "differs")!;
    expect(line.label).toMatch(/Trade receivables/);
    expect(line.difference).toBe(300_000);
    expect(c.lines.filter((l) => l.state === "differs")).toHaveLength(1);
    expect(c.notes.join(" ")).toMatch(/do not balance/);
  });
  it("accepts rounding that comes from a statement printed in thousands", () => {
    const c = run({ masters: MASTERS.map((l) => (l.name === "Closing Stock" ? { ...l, opening: -4_000_004 } : l)) });
    expect(c.lines.find((l) => l.id === "opening:inventories")!.state).toBe("matched");
  });
  it("lets a named person explain a difference, and only then passes", () => {
    const altered = MASTERS.map((l) => (l.name === "Debtor One" ? { ...l, opening: -6_500_000 } : l)).map((l) => (l.name === "Cash" ? { ...l, opening: -330_000 } : l));
    const by = { by: "Asha Rao", role: "manager", at: "2026-11-19T10:00:00Z", reason: "Advance received after the audit reclassified" };
    const open = run({ masters: altered });
    expect(open.totals.open).toBeGreaterThan(0);
    const explained = run({ masters: altered, decisions: { trade_receivables: by, cash: by } });
    expect(explained.totals.open).toBe(0);
    expect(explained.lines.find((l) => l.id === "opening:trade_receivables")).toMatchObject({ state: "explained", decision: by });
  });
  it("is cannot_run, naming the file, when the masters are missing", () => {
    const c = run({ masters: null });
    expect(c.status).toBe("cannot_run");
    expect(c.missing[0]!.file).toMatch(/Tally masters/);
    expect(c.lines).toHaveLength(0);
  });
  it("compares nothing from a balance sheet that does not tie, and says why", () => {
    const c = run({ audited: readBalanceSheetText(TEXT.replace("11 80.00", "11 800.00")) });
    expect(c.status).toBe("cannot_run");
    expect(c.missing[0]!.why).toMatch(/do not add up to the totals/);
    expect(c.lines).toHaveLength(0);
  });
  it("warns when the balance sheet is for the wrong year", () => {
    expect(run({ tallyOpensOn: "2026-04-01" }).notes.join(" ")).toMatch(/as on 2025-03-31, but Tally opens on 2026-04-01/);
  });
  it("does not pass while a ledger is unplaced", () => {
    const c = run({ masters: [...MASTERS, L("Head Office", "Branch / Divisions", -123_456)] });
    expect(c.status).toBe("differences");
    expect(c.notes.join(" ")).toMatch(/Head Office under Branch \/ Divisions/);
  });
});

describe("stale detection", () => {
  const audited = readBalanceSheetText(TEXT);
  const base = { auditedName: "a.pdf", mastersName: "m.xml", audited, masters: MASTERS };
  it("gives the same hash for the same inputs and a different one when any input changes", () => {
    const a = checkOpeningBalances(base);
    expect(checkOpeningBalances(base).inputsHash).toBe(a.inputsHash);
    expect(checkOpeningBalances({ ...base, masters: MASTERS.map((l) => (l.name === "Cash" ? { ...l, opening: -31_000 } : l)) }).inputsHash).not.toBe(a.inputsHash);
  });
  it("marks a stored result stale, never passed, once an input has changed", () => {
    const a = checkOpeningBalances(base);
    expect(isStale(a, a.inputsHash)).toBe(false);
    const stale = withStaleness(a, "0000");
    expect(stale.status).toBe("stale");
    expect(stale.summary).toMatch(/Run it again/);
  });
  it("hashes object keys in a stable order", () => {
    expect(stableStringify({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}');
    expect(inputsHash({ a: 1, b: 2 })).toBe(inputsHash({ b: 2, a: 1 }));
  });
});
