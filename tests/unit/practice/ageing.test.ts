import { describe, expect, it } from "vitest";
import { agePosting, ledgerClosing, postingsFromDayBook } from "@/lib/practice/ageing";

describe("ageing a debtor", () => {
  const p = [
    { date: "2025-09-01", amount: 1000, ref: "INV-1" },
    { date: "2025-10-15", amount: 500, ref: "INV-2" },
    { date: "2025-12-01", amount: 300, ref: "INV-3" },
    { date: "2025-12-10", amount: -1200, ref: "RCT-9" },
  ];
  it("settles the oldest bill first (FIFO) when there are no bill references, and ages what is left", () => {
    const a = agePosting("A", p, "2025-12-31", { side: "debtor" });
    expect(a.method).toBe("fifo");
    // 1,200 knocks off INV-1 (1,000) and 200 of INV-2.
    expect(a.open.map((b) => [b.ref, b.amount])).toEqual([["INV-2", 300], ["INV-3", 300]]);
    expect(a.buckets).toEqual({ current: 300, d31_60: 0, d61_90: 300, d90plus: 0 });
    expect(a.closing).toBe(600);
    expect(a.closing).toBe(ledgerClosing(p, "2025-12-31", "debtor"));
  });
  it("uses the bill reference where there is one, even if an older bill is open", () => {
    const q = [
      { date: "2025-09-01", amount: 1000, ref: "A", billType: "new" as const },
      { date: "2025-10-01", amount: 500, ref: "B", billType: "new" as const },
      { date: "2025-11-01", amount: -500, ref: "B", billType: "against" as const },
    ];
    const a = agePosting("A", q, "2025-12-31", { side: "debtor" });
    expect(a.method).toBe("bill-wise");
    expect(a.open.map((b) => [b.ref, b.amount])).toEqual([["A", 1000]]);
  });
  it("keeps a receipt beyond the open bills as on account, and the closing is still the ledger's", () => {
    const q = [{ date: "2025-10-01", amount: 100, ref: "A" }, { date: "2025-11-01", amount: -250, ref: "R" }];
    const a = agePosting("A", q, "2025-12-31", { side: "debtor" });
    expect(a.onAccount).toBe(150);
    expect(a.closing).toBe(-150);
    expect(a.closing).toBe(ledgerClosing(q, "2025-12-31", "debtor"));
  });
  it("ages an opening balance from the opening date and ignores postings after the report date", () => {
    const a = agePosting("A", [{ date: "2026-02-01", amount: 999 }], "2025-12-31", { side: "debtor", opening: 400, openingDate: "2025-03-31" });
    expect(a.open).toHaveLength(1);
    expect(a.buckets.d90plus).toBe(400);
  });
});

describe("ageing a creditor", () => {
  it("treats credits as bills and debits as payments", () => {
    const p = [{ date: "2025-11-01", amount: -800, ref: "P1" }, { date: "2025-12-05", amount: 300, ref: "PAY" }];
    const a = agePosting("S", p, "2025-12-31", { side: "creditor" });
    expect(a.closing).toBe(500);
    expect(a.open[0]).toMatchObject({ ref: "P1", amount: 500 });
  });
});

describe("postings from a Tally Day Book export", () => {
  it("collects each ledger's legs with their voucher", () => {
    const rows = [
      ["Date", "Particulars", "", "", "Vch Type", "Vch No.", "Debit", "Credit"],
      ["18-Jul-25", "Malkhed", "", "", "Sales", "S/1", "1,180.00", ""],
      ["", "Sales", "", "", "", "", "", "1,000.00"],
      ["", "Output CGST", "", "", "", "", "", "180.00"],
      ["20-Jul-25", "Bank", "", "", "Receipt", "7", "500.00", ""],
      ["", "Malkhed", "", "", "", "", "", "500.00"],
    ];
    const m = postingsFromDayBook(rows);
    expect(m.get("Malkhed")).toEqual([
      { date: "2025-07-18", amount: 1180, ref: "S/1", voucher: "Sales S/1" },
      { date: "2025-07-20", amount: -500, ref: "7", voucher: "Receipt 7" },
    ]);
  });
});
