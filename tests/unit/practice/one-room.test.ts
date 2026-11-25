import { describe, expect, it } from "vitest";
import { booksExportKind, readDayBookVouchers, voucherIdentity } from "@/lib/practice/review/dayBook";
import { coverageNote, coversMonth, inputKeyOfDoc, type DocFact } from "@/lib/practice/readiness/documents";

const doc = (o: Partial<DocFact>): DocFact => ({ filename: "x.xlsx", side: null, classification: null, createdAt: "2026-11-20", ...o });

describe("one mapping from a stored file to a readiness input", () => {
  it("a bank ledger extract is not a Day Book", () => {
    expect(inputKeyOfDoc(doc({ side: "books", booksKind: "ledger" }))).toBeNull();
    expect(inputKeyOfDoc(doc({ side: "books", filename: "CA Ledger.xlsx" }))).toBeNull();
    expect(inputKeyOfDoc(doc({ side: "books", booksKind: "day_book" }))).toBe("day_book");
  });
  it("loan statements and bank statements stay apart", () => {
    expect(inputKeyOfDoc(doc({ classification: "loan_statement" }))).toBe("loan_statements");
    expect(inputKeyOfDoc(doc({ classification: "bank_statement" }))).toBe("bank_statements");
  });
});

describe("coverage comes from the file's own dates, not the upload date", () => {
  const stmt = doc({ classification: "bank_statement", period: { from: "2025-04-01", to: "2026-03-31" } });
  it("a year statement covers every month in it and no month outside it", () => {
    expect(coversMonth(stmt, "2025-12")).toBe(true);
    expect(coversMonth(stmt, "2026-11")).toBe(false);
  });
  it("says what the files cover together", () => {
    expect(coverageNote([stmt])).toBe("1 file, Apr 2025 to Mar 2026");
  });
});

describe("a voucher is counted once", () => {
  const rows = [["Date", "Particulars", "Vch Type", "Vch No.", "Debit", "Credit"]];
  it("identity ignores which file it came from", () => {
    const v = { date: "2025-12-01", type: "Contra", no: "7", narration: "", row: 1, legs: [{ ledger: "A", debit: 100, credit: 0 }, { ledger: "B", debit: 0, credit: 100 }] };
    expect(voucherIdentity(v)).toBe(voucherIdentity({ ...v, row: 99 }));
  });
  it("an empty sheet is unknown, not a Day Book", () => {
    expect(booksExportKind(rows, readDayBookVouchers(rows))).not.toBe("day_book");
  });
});
