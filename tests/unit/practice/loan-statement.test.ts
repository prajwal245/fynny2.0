import { describe, expect, it } from "vitest";
import { looksLikeLoanStatement, summariseLoanStatement } from "@/lib/practice/extract/loanStatement";

const loan = `AXIS BANK LTD
Loan Account Statement
Loan A/c No 123456789  Customer: TRITIKSHA GOLD
Sanctioned amount 50,00,000.00  Rate of interest 9.25%  Outstanding principal 38,12,455.00
Date Particulars Instalment (EMI) Principal Interest Balance
05-05-2025 EMI RECEIVED 1,02,000.00 61,400.00 40,600.00 39,38,600.00
05-06-2025 EMI RECEIVED 1,02,000.00 61,800.00 40,200.00 38,76,800.00
05-07-2025 EMI RECEIVED 1,02,000.00 62,345.00 39,655.00 38,12,455.00`;

const bank = `ICICI Bank Account statement
Account number 110805501053 Current Account
Date Transaction ID Description Withdrawal Deposit Balance
01-Apr-2025 S6164188 ECS/EMI/LOAN 87015 1,39,307.00 87,18,700.96
01-Apr-2025 S6164189 ECS/EMI/LOAN 87016 1,39,307.00 85,79,393.96
01-Apr-2025 S6164190 ECS/EMI/LOAN 87017 1,39,307.00 84,40,086.96
02-Apr-2025 S6164191 LOAN REPAYMENT HDFC 5,00,000.00 79,40,086.96
interest credited on principal outstanding`;

describe("loan statements", () => {
  it("recognises a statement that calls itself a loan account", () => {
    expect(looksLikeLoanStatement(loan)).toBe(true);
  });
  it("does not take a bank statement full of loan EMIs for one", () => {
    expect(looksLikeLoanStatement(bank)).toBe(false);
    expect(looksLikeLoanStatement("Current account statement. Loan against FD interest.")).toBe(false);
  });
  it("summarises only what the text says: the dated lines, the instalments, the last balance", () => {
    const s = summariseLoanStatement(loan);
    expect(s.entries).toBe(3);
    expect(s.totals).toEqual([{ label: "Instalment lines", amount: 3 }, { label: "Last balance printed", amount: 3812455 }]);
    expect(s.note).toMatch(/loan account, not a bank account/);
  });
  it("a loan statement with no entries says so", () => {
    expect(summariseLoanStatement("Loan Account Statement no transactions in this period").note).toMatch(/no dated entries/);
  });
});

import { describeSheets } from "@/lib/practice/extract/sheets";
describe("describing the sheets of a workbook", () => {
  const books = { name: "Day Book", rows: [["ACME PRIVATE LIMITED", "", "", "", "", "", "", ""], ["Day Book", "", "", "", "", "", "", ""], ["1-Apr-25 to 30-Apr-25", "", "", "", "", "", "", ""], ["Date", "Particulars", "", "", "Vch Type", "Vch No.", "Debit", "Credit"], ["", "", "", "", "", "", "Amount", "Amount"], ["15-Apr-25", "Sunon Modular", "", "", "Payment", "1", "1000", ""], ["", "Indian bank CA 7856871247", "", "", "", "", "", "1000"]] };
  const tds = { name: "TDS Summary", rows: [["Section", "Party", "TDS deducted", "TDS rate %"], ["194C", "Sunon", "100", "1"], ["194J", "Ravi", "200", "10"]] };
  it("says what each sheet holds, marks the one FynHelp would read, and shows the title lines", () => {
    const d = describeSheets([tds, books], "Acme", "books", (k) => k);
    expect(d.map((x) => x.name)).toEqual(["TDS Summary", "Day Book"]);
    expect(d[1]!.finds).toMatch(/Book lines: 1/);
    expect(d[1]!.title).toContain("Day Book");
    expect(d.filter((x) => x.chosen)).toHaveLength(1);
    expect(d[1]!.chosen).toBe(true);
  });
});
