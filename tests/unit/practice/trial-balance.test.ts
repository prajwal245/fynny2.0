import { describe, expect, it } from "vitest";
import { readTrialBalance, readLedgerMasters, trialBalanceIntegrity, tbAgainstMasters, toMasterLedgers, openingFindings } from "@/lib/practice/review/trialBalance";
import { compareOpening, type Statement } from "@/lib/practice/audited";

const p = (r: (string | number)[], n = 9) => [...r.map(String), ...Array(Math.max(0, n - r.length)).fill("")];
const head = p(["Ledger", "Under (group)", "Primary group", "Opening 1-Apr-2025 Dr", "Opening 1-Apr-2025 Cr", "Movement FY 2025-26 Dr (net)", "Movement FY 2025-26 Cr (net)", "Closing 31-Mar-2026 Dr", "Closing 31-Mar-2026 Cr"]);
const tbRows = [
  p(["ACME PVT LTD"]), p(["Trial Balance"]), p([]), head,
  p(["HDFC BANK", "Bank Accounts", "Bank Accounts", "1,000.00", "", "500.00", "", "", ""]),
  p(["Customer A", "Sundry Debtors", "Sundry Debtors", "", "200.00", "", "", "", ""]),
  p(["Vendor B", "Sundry Creditors", "Sundry Creditors", "50.00", "", "", "", "", ""]),
  p(["Capital", "Capital Account", "Capital Account", "", "949.58", "", "500.00", "", ""]),
  p(["94-C Tds Receivable Fy 2021-22", "Tds Receivable", "Current Assets", "100.00", "", "", "", "", ""]),
  p(["Total"]), p(["Difference (Dr - Cr)"]),
  p(["Note: Tally shows a difference in opening balances of ₹0.42 (Cr side short), carried through to the closing."]),
];

describe("trial balance", () => {
  const tb = readTrialBalance(tbRows);
  it("reads ledgers with Dr positive and works out closing when the export leaves it blank", () => {
    expect(tb.ledgers.map((l) => l.name)).toEqual(["HDFC BANK", "Customer A", "Vendor B", "Capital", "94-C Tds Receivable Fy 2021-22"]);
    expect(tb.ledgers[0]).toMatchObject({ opening: 1000, movement: 500, closing: 1500 });
    expect(tb.ledgers[1]!.opening).toBe(-200);
    expect(tb.closingStated).toBe(false);
    expect(tb.notes[0]).toMatch(/closing is worked out/);
  });
  it("reproduces the difference Tally quotes from the ledgers themselves", () => {
    const i = trialBalanceIntegrity(tb);
    expect(i.openingDiff).toBe(0.42);
    expect(i.checks.find((c) => c.id === "tb-opening")?.ok).toBe(false);
    expect(i.checks.find((c) => c.id === "tb-stated")?.ok).toBe(true);
    expect(i.checks.find((c) => c.id === "tb-movement")?.ok).toBe(true);
    expect(i.closingDiff).toBe(0.42);
  });
  it("says so when the quoted difference is not what the ledgers give", () => {
    const rows = tbRows.map((r) => [...r]);
    rows[11]![0] = "Note: Tally shows a difference in opening balances of ₹5.00 (Cr side short).";
    const i = trialBalanceIntegrity(readTrialBalance(rows));
    expect(i.checks.find((c) => c.id === "tb-stated")?.ok).toBe(false);
  });
  it("finds an old-year ledger still carrying a balance, and debtors/creditors on the wrong side", () => {
    const f = openingFindings(tb, 2025);
    expect(f.map((x) => x.kind).sort()).toEqual(["old_year_ledger", "sign_against_group", "sign_against_group"]);
    expect(f.find((x) => x.ledger === "Customer A")?.detail).toMatch(/credit balance/);
    expect(f.find((x) => x.ledger === "Vendor B")?.detail).toMatch(/debit balance/);
  });
  it("refuses a sheet that is not a trial balance", () => {
    expect(readTrialBalance([["a", "b"]]).ledgers).toEqual([]);
  });
});

const mHead = p(["Ledger", "Under (group)", "Primary group", "GSTIN (party ledger)", "PAN", "State", "GST registration type", "Bill-wise", "Opening 1-Apr-2025 (Dr + / Cr -)"]);
const mRows = [
  p(["ACME"]), p([]), mHead,
  p(["Customer A", "Sundry Debtors", "Sundry Debtors", "37AAWCS5771R1ZY", "AAWCS5771R", "Andhra Pradesh", "Regular", "Yes", "(200.00)"]),
  p(["Vendor B", "Sundry Creditors", "Sundry Creditors", "bad", "", "Telangana", "Regular", "No", "50.00"]),
  p(["HDFC BANK", "Bank Accounts", "Bank Accounts", "", "", "", "", "No", "1,000.00"]),
  p(["Unused", "Sundry Creditors", "Sundry Creditors", "", "", "", "", "No", "-"]),
];

describe("ledger masters", () => {
  const masters = readLedgerMasters(mRows);
  it("reads party facts, bracketed negatives and the bill-wise flag, and drops a malformed GSTIN", () => {
    expect(masters[0]).toMatchObject({ name: "Customer A", gstin: "37AAWCS5771R1ZY", pan: "AAWCS5771R", billWise: true, opening: -200 });
    expect(masters[1]!.gstin).toBeNull();
    expect(masters[3]!.opening).toBe(0);
  });
  it("agrees with the trial balance, and names a ledger whose opening differs or is missing", () => {
    const tb = readTrialBalance(tbRows);
    const ok = tbAgainstMasters(tb, masters);
    expect(ok.ok).toBe(true);
    expect(ok.compared).toBe(3);
    const bad = tbAgainstMasters(tb, [...masters.slice(0, 2), { ...masters[2]!, opening: 999 }, { ...masters[2]!, name: "Ghost", opening: 10 }]);
    expect(bad.differs).toEqual([{ name: "HDFC BANK", tb: 1000, masters: 999 }]);
    expect(bad.missingInTb).toEqual([{ name: "Ghost", opening: 10 }]);
  });
  it("feeds the group comparison with the primary group as the head, in Tally's sign", () => {
    const tb = readTrialBalance(tbRows);
    const ledgers = toMasterLedgers(tb, masters);
    expect(ledgers.find((l) => l.name === "Customer A")).toMatchObject({ opening: 200, parent: "Sundry Debtors", gstin: "37AAWCS5771R1ZY" });
    const bs = { unit: 1, lines: [], kind: "balance_sheet", asAt: "2025-03-31", entity: null, values: {} } as unknown as Statement;
    // A statement with nothing audited: every head shows the difference, and a ₹500 tolerance is what the CA chose for ₹'000 statements.
    const r = compareOpening({ ...bs, unit: 1000 } as Statement, ledgers, 500);
    expect(r.rows.find((x) => x.bucket === "cash_bank")?.status).toBe("differs");
  });
});
