import { describe, expect, it } from "vitest";
import { importVoucherXml, kindOf, parseImportReply, problemsWith, tallyDate, xmlEscape, type ApprovedLine } from "@/lib/practice/tallyVoucher";

const line: ApprovedLine = {
  id: "ln_123",
  company: "Sundara Textiles & Co",
  date: "2026-09-12",
  direction: "credit",
  amount: 48200,
  bankLedger: "HDFC Bank",
  partyLedger: "Rao Steels",
  narration: "NEFT Rao Steels",
  reference: "UTR9001",
};
const ledgers = ["HDFC Bank", "Rao Steels"];

describe("writing an approved line to Tally", () => {
  it("a credit is a Receipt and a debit is a Payment", () => {
    expect(kindOf(line)).toBe("Receipt");
    expect(kindOf({ direction: "debit" })).toBe("Payment");
  });

  it("Receipt debits the bank and credits the party; the two amounts balance", () => {
    const x = importVoucherXml(line);
    expect(x).toContain('VCHTYPE="Receipt"');
    expect(x).toContain("<DATE>20260912</DATE>");
    expect(x).toMatch(/<LEDGERNAME>Rao Steels<\/LEDGERNAME><ISDEEMEDPOSITIVE>No<\/ISDEEMEDPOSITIVE><AMOUNT>48200.00</);
    expect(x).toMatch(/<LEDGERNAME>HDFC Bank<\/LEDGERNAME><ISDEEMEDPOSITIVE>Yes<\/ISDEEMEDPOSITIVE><AMOUNT>-48200.00</);
  });

  it("Payment debits the party and credits the bank", () => {
    const x = importVoucherXml({ ...line, direction: "debit" });
    expect(x).toContain('VCHTYPE="Payment"');
    expect(x).toMatch(/<LEDGERNAME>Rao Steels<\/LEDGERNAME><ISDEEMEDPOSITIVE>Yes<\/ISDEEMEDPOSITIVE><AMOUNT>-48200.00</);
    expect(x).toMatch(/<LEDGERNAME>HDFC Bank<\/LEDGERNAME><ISDEEMEDPOSITIVE>No<\/ISDEEMEDPOSITIVE><AMOUNT>48200.00</);
  });

  it("carries the line id as REMOTEID so a resend names the same voucher", () => {
    expect(importVoucherXml(line)).toContain('REMOTEID="ln_123"');
    expect(importVoucherXml(line)).toBe(importVoucherXml(line));
  });

  it("escapes names and strips characters Tally cannot read", () => {
    const x = importVoucherXml({ ...line, company: "A & B <Co>", narration: 'Pay "X"\u0004' });
    expect(x).toContain("A &amp; B &lt;Co&gt;");
    expect(x).toContain("Pay &quot;X&quot;");
    expect(x).not.toContain("\u0004");
    expect(xmlEscape("a&b")).toBe("a&amp;b");
  });

  it("refuses a missing ledger: a new ledger is never created implicitly", () => {
    expect(problemsWith(line, ledgers)).toEqual([]);
    expect(problemsWith({ ...line, partyLedger: "New Vendor" }, ledgers)[0]).toMatch(/does not exist in Tally/);
    expect(problemsWith({ ...line, partyLedger: "" }, ledgers)[0]).toMatch(/No ledger has been approved/);
  });

  it("ledger names match without regard to case or spaces at the ends", () => {
    expect(problemsWith({ ...line, partyLedger: " rao steels " }, ledgers)).toEqual([]);
  });

  it("refuses bad amounts, bad dates and the same ledger on both sides", () => {
    expect(problemsWith({ ...line, amount: 0 }, ledgers)).not.toEqual([]);
    expect(problemsWith({ ...line, date: "12/09/2026" }, ledgers)).not.toEqual([]);
    expect(problemsWith({ ...line, partyLedger: "HDFC Bank" }, ledgers)).not.toEqual([]);
    expect(() => tallyDate("bad")).toThrow();
  });

  it("only a clear single creation counts as posted", () => {
    expect(parseImportReply("<RESPONSE><CREATED>1</CREATED><ERRORS>0</ERRORS></RESPONSE>").ok).toBe(true);
    expect(parseImportReply("<RESPONSE><CREATED>0</CREATED><ERRORS>1</ERRORS></RESPONSE>").ok).toBe(false);
    expect(parseImportReply("<RESPONSE><CREATED>0</CREATED><ALTERED>1</ALTERED></RESPONSE>").ok).toBe(false);
    expect(parseImportReply("<RESPONSE><CREATED>1</CREATED><ERRORS>0</ERRORS><LINEERROR>Ledger not found</LINEERROR></RESPONSE>")).toMatchObject({ ok: false, message: "Ledger not found" });
    expect(parseImportReply("").ok).toBe(false);
  });
});
