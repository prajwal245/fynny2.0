import { describe, expect, it } from "vitest";
import { unsupportedReport } from "@/lib/practice/extract/unsupported";

describe("reports FynHelp does not read yet", () => {
  it("recognises a trial balance and says what to export instead", () => {
    const m = unsupportedReport([["Kaveri Traders"], ["Trial Balance"], ["1-Apr-2026 to 30-Nov-2026"], ["Particulars", "Debit", "Credit"], ["Capital Account", "", "10,00,000.00"]]);
    expect(m).toMatch(/Trial Balance/);
    expect(m).toMatch(/Ledger/);
  });
  it("recognises an ageing report", () => {
    expect(unsupportedReport([["Bills Receivable"], ["Ageing analysis"], ["Ref No", "Due on", "Pending"]])).toMatch(/ageing/);
  });
  it("does not mistake a bank statement for one", () => {
    expect(unsupportedReport([["HDFC Bank statement"], ["Date", "Narration", "Withdrawal", "Deposit"], ["02/11/26", "NEFT trial balance adjustment", "500", ""]])).toBeNull();
  });
  it("leaves an ordinary Tally ledger alone", () => {
    expect(unsupportedReport([["Kaveri Traders"], ["HDFC Bank"], ["Date", "Particulars", "Vch Type", "Debit", "Credit"]])).toBeNull();
  });
});
