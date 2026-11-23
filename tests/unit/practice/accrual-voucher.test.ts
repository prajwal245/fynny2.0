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
