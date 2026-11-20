import { describe, expect, it } from "vitest";
import { read26as, prove26as, sectionOf, booksTds, compareTds, matchDeductors } from "@/lib/practice/tax/tds";

const text = `Annual Tax Statement
  Permanent Account Number (PAN)           ABCDE1234F           Current Status of PAN            Active             Financial Year      2025-26        Assessment Year        2026-27
             Name of Assessee              ACME PRIVATE LIMITED
PART-I - Details of Tax Deducted at Source
  Sr. No.  Name of Deductor  TAN of Deductor  Total Amount Paid/ Total Tax Deducted # Total TDS
  1   MALKHED REAL ESTATE PRIVATE LIMITED   BLRM13776A   1000000.00   20000.00   20000.00
  Sr. No. Section 1 Transaction Date Status of Booking* Date of Booking Remarks** Amount Paid / Tax Deducted ## TDS Deposited
    1   194C   05-Jan-2026   F   17-May-2026   -   600000.00   12000.00   12000.00
    2   194C   12-May-2025   F   20-Jul-2025   -   400000.00   8000.00   8000.00
  Sr. No. Name of Deductor TAN of Deductor Total Amount Paid/ Total Tax Deducted # Total TDS
  2   VIRAJIT PRIVATE LTD   CALV01682C   500000.00   10000.00   9000.00
    1   194C   31-Mar-2026   U   04-Jun-2026   -   500000.00   10000.00   9000.00
PART-II-Details of Tax Deducted at Source for 15G / 15H
`;

describe("Form 26AS", () => {
  const a = read26as(text);
  it("reads the assessee, deductors and every transaction", () => {
    expect(a).toMatchObject({ pan: "ABCDE1234F", name: "ACME PRIVATE LIMITED", fy: "2025-26" });
    expect(a.deductors.map((d) => [d.name, d.tan, d.rows.length])).toEqual([["MALKHED REAL ESTATE PRIVATE LIMITED", "BLRM13776A", 2], ["VIRAJIT PRIVATE LTD", "CALV01682C", 1]]);
    expect(a.deductors[0]!.rows[0]).toMatchObject({ section: "194C", date: "2026-01-05", booked: "2026-05-17", tax: 12000 });
  });
  it("proves each deductor's lines against its own total, deposit against deduction, and the booking status", () => {
    const c = prove26as(a);
    expect(c.find((x) => x.id === "as26-lines")?.ok).toBe(true);
    expect(c.find((x) => x.id === "as26-deposit")?.ok).toBe(false); // Virajit deducted 10,000, deposited 9,000
    expect(c.find((x) => x.id === "as26-status")?.ok).toBe(false); // one line is 'U'
    const bad = read26as(text.replace("12000.00   12000.00\n    2", "11000.00   11000.00\n    2"));
    expect(prove26as(bad).find((x) => x.id === "as26-lines")?.ok).toBe(false);
  });
  it("refuses a document that is not a 26AS", () => {
    expect(read26as("Balance Sheet").notes[0]).toMatch(/not look like a Form 26AS/);
  });
});

describe("section from the ledger name", () => {
  it.each([["TDS RECEIVABLE 94-C", "194C"], ["94 A TDS Receivable", "194A"], ["194-Q TDS RECEIVABLE", "194Q"], ["TDS 94 J Receivable", "194J"], ["Tds Receivable", null], ["Input CGST", null]])("%s → %s", (n, s) => expect(sectionOf(n)).toBe(s));
});

describe("books against 26AS", () => {
  const v = (date: string, legs: [string, number, number][]) => ({ date, type: "Receipt", no: "1", legs: legs.map(([ledger, debit, credit]) => ({ ledger, debit, credit })) });
  const books = booksTds([
    v("2025-06-01", [["Bank", 9000, 0], ["TDS RECEIVABLE 94-C", 1000, 0], ["Malkhed Real Estate Pvt Ltd (Furniture)", 0, 10000]]),
    v("2025-07-01", [["Bank", 8000, 0], ["TDS RECEIVABLE 94-C", 12000, 0], ["Malkhed Real Estate Private Limited", 0, 20000]]),
    v("2026-02-01", [["Bank", 100, 0], ["TDS RECEIVABLE 94-C", 9000, 0], ["Virajith Pvt Ltd", 0, 9100]]),
    v("2026-02-02", [["TDS RECEIVABLE 94-C", 0, 500], ["Suspense", 500, 0]]),
    v("2024-01-01", [["TDS RECEIVABLE 94-C", 777, 0], ["Old", 0, 777]]),
    v("2025-09-01", [["Bank", 50, 0], ["TDS RECEIVABLE 94-C", 300, 0], ["Unknown Buyer", 0, 350]]),
  ], ["TDS RECEIVABLE 94-C"], { start: "2025-04-01", end: "2026-03-31" });
  it("sums debits to the TDS-receivable ledgers by section within the year, and the credits cleared", () => {
    expect(books.bySection).toEqual({ "194C": 22300 });
    expect(books.clearedInYear).toEqual([{ ledger: "TDS RECEIVABLE 94-C", credit: 500 }]);
  });
  it("shows books above 26AS as the direction that matters", () => {
    const c = compareTds(read26as(text), books);
    expect(c.rows).toEqual([{ section: "194C", as26: 30000, books: 22300, diff: -7700, status: "books_lower" }]);
    expect(c.notes.join(" ")).toMatch(/cannot be claimed/);
  });
  it("matches books parties to deductors by their significant words, one letter off allowed, and lists the rest", () => {
    const m = matchDeductors(read26as(text), books);
    expect(m.matches[0]!.parties.sort()).toEqual(["Malkhed Real Estate Private Limited", "Malkhed Real Estate Pvt Ltd (Furniture)"]);
    expect(m.matches[0]).toMatchObject({ books: 13000, diff: -7000 });
    expect(m.matches[1]).toMatchObject({ parties: ["Virajith Pvt Ltd"], books: 9000, diff: -1000 });
    expect(m.unassigned).toEqual([{ party: "Unknown Buyer", amount: 300 }]);
  });
});
