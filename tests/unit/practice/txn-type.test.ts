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
    // As the tester's real statements print them (13 Nov retest): the bank glues its own code onto the mode.
    ["UPIAB/108698566055/CR/SRI", "UPI"],
    ["UPIAR/078630359826/DR/ S", "UPI"],
    ["IMPSAB/513810256248/SRI S", "IMPS"],
    ["MOBFT/ELUGUBANTI VARDHANA", "Transfer"],
    ["MMT/IMPS/535009654928/Daddy/UBIN0801526", "IMPS"],
    ["INF/INFT/040231942541/V S S CONSTRUCT", "Transfer"],
    ["TRFR FROM:KESARAPU LAKSHMI", "Transfer"],
    ["110805501053:Int.Coll: to 01-04- 2025", "Interest"],
    ["MAB CHGSBCH", "Bank charges"],
    ["UNCOLL CHRG DT:25/06/2025JRNL:785001701/ACCOUNT KEEPING CH ARGES", "Bank charges"],
    // A NEFT payment that states its own fee is a NEFT payment, not a bank charge.
    ["TRANSFER TO 89634000339 Txn Amt. 48,903.00 Charges. 5.61 /N EFT/HDFC/IDIBN52025071500249134/Y", "NEFT"],
    ["TRANSFER TO 98906000129 Txn Amt. 9,00,000.00 Charges. 58.00 /RTGS/HDFC/IDIBR52025071946550750", "RTGS"],
    ["BIL/VehicleLoan XX87016 EMI Sri S", "Auto-debit"],
  ])("%s -> %s", (n, t) => expect(txnType(n)).toBe(t));
  it("direction follows the sign", () => {
    expect(txnDirection(-5)).toBe("Money out");
    expect(txnDirection(5)).toBe("Money in");
  });
});
