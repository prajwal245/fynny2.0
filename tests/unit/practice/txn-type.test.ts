import { describe, expect, it } from "vitest";
import { txnType, txnDirection } from "@/lib/practice/txnType";

describe("transaction type", () => {
  it.each([
    ["UPI/412345/PAYTM/rent", "UPI"],
    ["NEFT-HDFCN52026091512345-ACME LTD", "NEFT"],
    ["RTGS CR-ICIC0000001-X", "RTGS"],
    ["IMPS/P2A/123/RAVI", "IMPS"],
    ["CHQ 004512 CLG", "Cheque"],
    ["ATM WDL 1234", "Cash"],
    ["SMS ALERT CHARGES", "Bank charges"],
    ["UPI CHARGES", "Bank charges"],
    ["CREDIT INTEREST", "Interest"],
    ["NACH DR LIC", "Auto-debit"],
    ["something odd", "Other"],
  ])("%s -> %s", (n, t) => expect(txnType(n)).toBe(t));
  it("direction follows the sign", () => {
    expect(txnDirection(-5)).toBe("Money out");
    expect(txnDirection(5)).toBe("Money in");
  });
});
