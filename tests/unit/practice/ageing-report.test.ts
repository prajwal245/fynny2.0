import { describe, expect, it } from "vitest";
import { ageingReport, postingsFromVouchers } from "@/lib/practice/review/ageingReport";
import type { Voucher } from "@/lib/practice/review/dayBook";
import type { TrialBalance, MasterRow } from "@/lib/practice/review/trialBalance";
import { postingsFromDayBook } from "@/lib/practice/ageing";

const v = (date: string, type: string, no: string, legs: [string, number, number][]): Voucher => ({ date, type, no, narration: "", row: 0, legs: legs.map(([ledger, debit, credit]) => ({ ledger, debit, credit })) });
const tbl = (name: string, primary: string, opening: number, movement: number) => ({ name, group: primary, primary, opening, movement, closing: opening + movement, movementDr: Math.max(movement, 0), movementCr: Math.max(-movement, 0), row: 0 });
const tb: TrialBalance = { statedOpeningDiff: null, closingStated: false, notes: [], ledgers: [
  tbl("Acme Ltd", "Sundry Debtors", 1000, 4000 - 3000), // opens 1,000 owed; bills 5,000 (Apr) and 4,000 (Feb); receipts 3,000 and 6,000
  tbl("Vendor Co", "Sundry Creditors", -2000, -500),
  tbl("Cash", "Cash-in-hand", 0, 0),
] };
const vouchers = [
  v("2025-04-10", "Sales", "1", [["Acme Ltd", 5000, 0], ["Sales", 0, 5000]]),
  v("2025-06-01", "Receipt", "2", [["Bank", 3000, 0], ["Acme Ltd", 0, 3000]]),
  v("2026-02-20", "Sales", "3", [["Acme Ltd", 4000, 0], ["Sales", 0, 4000]]),
  v("2026-03-10", "Receipt", "4", [["Bank", 6000, 0], ["Acme Ltd", 0, 6000]]),
  v("2025-05-05", "Purchase", "5", [["Purchases", 1500, 0], ["Vendor Co", 0, 1500]]),
  v("2025-07-01", "Payment", "6", [["Vendor Co", 1000, 0], ["Bank", 0, 1000]]),
];
const tbFixed: TrialBalance = { ...tb, ledgers: [tbl("Acme Ltd", "Sundry Debtors", 1000, 0), tbl("Vendor Co", "Sundry Creditors", -2000, -500)] };
// Acme: 1000 + 5000 − 3000 + 4000 − 6000 = 1000 ; Vendor: owed 2000 + 1500 − 1000 = 2500 → TB movement = −500 Dr−Cr
const masters: MasterRow[] = [{ name: "Acme Ltd", group: "Sundry Debtors", primary: "Sundry Debtors", gstin: "37AAWCS5771R1ZY", pan: null, state: null, regType: null, billWise: true, opening: 1000 }];

describe("ageing report", () => {
  it("ages debtors first in first out from the opening balance, and ties to the Trial Balance closing", () => {
    const tbA: TrialBalance = { ...tbFixed, ledgers: [tbl("Acme Ltd", "Sundry Debtors", 1000, 0), tbl("Vendor Co", "Sundry Creditors", -2000, -500)] };
    const r = ageingReport(vouchers, tbA, masters, { side: "debtor", asAt: "2026-03-31", fyStart: "2025-04-01" });
    const a = r.rows[0]!;
    // 1000 opening + 5000 − 3000 − 6000 (settles 1000 opening, 2000 of April bill, then 3000 of Feb bill is not yet billed → bills in date order)
    expect(a.closing).toBe(1000);
    expect(r.untied).toEqual([]);
    expect(a.billWise).toBe(true);
    expect(a.gstin).toBe("37AAWCS5771R1ZY");
    expect(r.notes.join(" ")).toMatch(/bill-wise in Tally/);
    expect(r.totals.closing).toBe(1000);
  });
  it("ages creditors by what the firm owes and reports a party whose postings do not reach the Trial Balance closing", () => {
    const r = ageingReport(vouchers, tbFixed, masters, { side: "creditor", asAt: "2026-03-31", fyStart: "2025-04-01", tbDate: "2026-03-31" });
    expect(r.rows[0]!.closing).toBe(2500);
    expect(r.untied).toEqual([]);
    const wrong: TrialBalance = { ...tbFixed, ledgers: [tbl("Vendor Co", "Sundry Creditors", -2000, -999)] };
    const r2 = ageingReport(vouchers, wrong, [], { side: "creditor", asAt: "2026-03-31", fyStart: "2025-04-01", tbDate: "2026-03-31" });
    expect(r2.untied.map((x) => x.party)).toEqual(["Vendor Co"]);
  });
  it("ages from the due date when a credit period is set, and says which basis it used", () => {
    const only = [v("2026-03-01", "Sales", "9", [["Acme Ltd", 100, 0], ["Sales", 0, 100]])];
    const t: TrialBalance = { ...tb, ledgers: [tbl("Acme Ltd", "Sundry Debtors", 0, 100)] };
    const plain = ageingReport(only, t, [], { side: "debtor", asAt: "2026-03-31", fyStart: "2025-04-01" });
    expect(plain.rows[0]!.buckets.current).toBe(100); // 30 days from invoice
    expect(plain.dueBasis).toMatch(/invoice date/);
    const due = ageingReport(only, t, [], { side: "debtor", asAt: "2026-03-31", fyStart: "2025-04-01", creditDays: 45 });
    expect(due.rows[0]!.open[0]!.age).toBe(0); // not yet due
    expect(due.dueBasis).toMatch(/due date/);
  });
  it("builds postings per ledger from vouchers, and reads the new six-column Day Book export", () => {
    expect(postingsFromVouchers(vouchers).get("Acme Ltd")!.map((p) => p.amount)).toEqual([5000, -3000, 4000, -6000]);
    const rows = [["Date", "Particulars", "Vch Type", "Vch No.", "Debit Amount", "Credit Amount"], ["1-Apr-25", "Acme Ltd", "Sales", "1", "5,000.00", ""], ["", "Sales", "", "", "", "5,000.00"]];
    expect(postingsFromDayBook(rows).get("Acme Ltd")![0]!.amount).toBe(5000);
  });
});
