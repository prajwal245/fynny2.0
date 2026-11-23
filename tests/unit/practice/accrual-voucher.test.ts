import { describe, expect, it } from "vitest";
import {
  TAX_REFERENCE_FILE,
  isAccrualVoucher,
} from "@/lib/practice/documents.server";

const raw = (type: string) =>
  `Date: 2025-05-01 | Particulars: MANOHAR CIVIL STRUCTURES | Vch Type: ${type} | Vch No.: 29`;
describe("Day Book lines that cannot be bank movements", () => {
  it("treats a bill or invoice with no bank ledger as an accrual entry", () => {
    expect(
      isAccrualVoucher(
        "MANOHAR CIVIL STRUCTURES",
        raw("Sub Contract Services"),
      ),
    ).toBe(true);
    expect(
      isAccrualVoucher("SRI GOPAL AUTOMOTIVE LTD", raw("B 2 B Services")),
    ).toBe(true);
    expect(isAccrualVoucher("PVR", raw("Journal"))).toBe(true);
  });
  it("keeps a payment or receipt, and anything that names a bank ledger", () => {
    expect(isAccrualVoucher("MANOHAR", raw("Payment"))).toBe(false);
    expect(isAccrualVoucher("MANOHAR", raw("Receipts"))).toBe(false);
    expect(isAccrualVoucher("MANOHAR", raw("Bank Payment"))).toBe(false);
    expect(
      isAccrualVoucher(
        "MANOHAR CIVIL (Indian Bank CC A/c 6407563276)",
        raw("Sub Contract Services"),
      ),
    ).toBe(false);
  });
  it("does not guess when the voucher type is missing", () => {
    expect(isAccrualVoucher("X", "Date: 2025-05-01 | Particulars: X")).toBe(
      false,
    );
  });
});

describe("tax and return files are references", () => {
  it("matches the file names from the test report", () => {
    for (const f of [
      "GSTR-3B Mar 2026.pdf",
      "GSTR 9C.pdf",
      "26AS FY 24-25.pdf",
      "AIS part 1.pdf",
      "ITR-6 part 2.pdf",
      "Form 3CD.pdf",
      "ITC claimed vs utilised.xlsx",
      "GST credit and liability.xlsx",
    ])
      expect(TAX_REFERENCE_FILE.test(f), f).toBe(true);
  });
  it("does not match a bank statement or ledger", () => {
    for (const f of ["CA 7856871247.pdf", "Day Book.xlsx", "HDFC_2932.pdf"])
      expect(TAX_REFERENCE_FILE.test(f), f).toBe(false);
  });
});

import {
  TAX_REFERENCE_FILE as REF,
  looksLikeBankStatement,
} from "@/lib/practice/extract/taxReference";
import { rowsFromTable } from "@/lib/practice/extract/table";

describe("files from the 23 Nov retest", () => {
  it("catches challans, return status, registers and AIS parts by name", () => {
    for (const f of [
      "GST Challans and Return Filing Status FY 2025-26.xlsx",
      "Satkaarika - Sales and Purchase Registers Dec 2025 (Tally 19-11-2026).xlsx",
      "Satkaarika - AIS FY 2025-26 (Part 2 of 2).pdf",
      "Form 3CD FY 2024-25.pdf",
    ])
      expect(REF.test(f), f).toBe(true);
    for (const f of [
      "Satkaarika - Ledger Indian Bank CA 7856871247 FY 2025-26 (Tally 16-11-2026).xlsx",
      "Day Book.xlsx",
      "CA 8088091704.pdf",
    ])
      expect(REF.test(f), f).toBe(false);
  });
  it("keeps a real statement even if its name looks like a return", () => {
    const withBalance = [1, 2, 3, 4].map((n) => ({ balance: 100 * n }));
    expect(looksLikeBankStatement(withBalance)).toBe(true);
    expect(
      looksLikeBankStatement([
        { balance: null },
        { balance: null },
        { balance: null },
        { balance: 5 },
      ]),
    ).toBe(false);
  });
});

describe("a transfer to another of the client's bank accounts in a bank ledger", () => {
  const ledger = [
    ["SATKAARIKA ENTERPRISES PRIVATE LIMITED", "", "", "", "", ""],
    ["Ledger Account", "", "", "", "", ""],
    ["Indian bank CA 7856871247", "", "", "", "", ""],
    ["1-Apr-25 to 31-Mar-26", "", "", "", "", ""],
    ["Date", "Particulars", "Vch Type", "Vch No.", "Debit", "Credit"],
    [
      "2025-08-30",
      "To Indian Bank CC A/c 6407563276",
      "Contra",
      "3",
      "50000000",
      "",
    ],
    [
      "2025-09-01",
      "By Indian Bank CC A/c 6407563276",
      "Receipt",
      "43",
      "",
      "50000000",
    ],
    [
      "2025-09-02",
      "By R K READY MIX CONCRETE (as per details)",
      "Payment",
      "361",
      "",
      "799229.21",
    ],
    [
      "2025-09-03",
      "To Sri Gopal Automotive Ltd",
      "Receipt",
      "44",
      "250000",
      "",
    ],
  ];
  it("takes its direction from Debit and Credit, not from the voucher type", () => {
    const rows = rowsFromTable(ledger, "books")!;
    const by = (d: string) => rows.find((r) => r.date === d)!;
    expect(by("2025-08-30")).toMatchObject({
      direction: "in",
      amount: 50_000_000,
    });
    expect(by("2025-09-01")).toMatchObject({
      direction: "out",
      amount: 50_000_000,
    });
  });
  it("still uses the voucher type for an ordinary party", () => {
    const rows = rowsFromTable(ledger, "books")!;
    expect(rows.find((r) => r.date === "2025-09-02")).toMatchObject({
      direction: "out",
    });
    expect(rows.find((r) => r.date === "2025-09-03")).toMatchObject({
      direction: "in",
    });
  });
});
