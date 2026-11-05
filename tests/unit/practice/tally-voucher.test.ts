import { describe, expect, it } from "vitest";
import { importVoucherXml, kindOf, parseImportReply, problemsWith, tallyDate, xmlEscape, type ApprovedLine } from "@/lib/practice/tallyVoucher";

const line: ApprovedLine = {
  id: "ln_123",
  company: "Sundara Textiles & Co",
  date: "2026-09-12",
  direction: "in",
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
    expect(kindOf({ direction: "out" })).toBe("Payment");
  });

  it("Receipt debits the bank and credits the party; the two amounts balance", () => {
    const x = importVoucherXml(line);
    expect(x).toContain('VCHTYPE="Receipt"');
    expect(x).toContain("<DATE>20260912</DATE>");
    expect(x).toMatch(/<LEDGERNAME>Rao Steels<\/LEDGERNAME><ISDEEMEDPOSITIVE>No<\/ISDEEMEDPOSITIVE><AMOUNT>48200.00</);
    expect(x).toMatch(/<LEDGERNAME>HDFC Bank<\/LEDGERNAME><ISDEEMEDPOSITIVE>Yes<\/ISDEEMEDPOSITIVE><AMOUNT>-48200.00</);
  });

  it("Payment debits the party and credits the bank", () => {
    const x = importVoucherXml({ ...line, direction: "out" });
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

import { splitGstInclusive } from "@/lib/practice/tallyVoucher";

describe("contra, bank charges and GST splits", () => {
  const all = ["HDFC Bank", "ICICI Bank", "Cash", "Bank Charges", "Input CGST", "Input SGST", "Input IGST", "Rao Steels"];
  const bankLike = ["HDFC Bank", "ICICI Bank", "Cash"];

  it("a transfer between own accounts is a Contra and balances", () => {
    const l: ApprovedLine = { ...line, direction: "out", kind: "Contra", partyLedger: "ICICI Bank" };
    expect(problemsWith(l, all, bankLike)).toEqual([]);
    const x = importVoucherXml(l);
    expect(x).toContain('VCHTYPE="Contra"');
    expect(x).toMatch(/<LEDGERNAME>ICICI Bank<\/LEDGERNAME><ISDEEMEDPOSITIVE>Yes<\/ISDEEMEDPOSITIVE><AMOUNT>-48200.00</);
    expect(x).toMatch(/<LEDGERNAME>HDFC Bank<\/LEDGERNAME><ISDEEMEDPOSITIVE>No<\/ISDEEMEDPOSITIVE><AMOUNT>48200.00</);
  });
  it("a Contra to a non-bank ledger, and a Receipt from a bank ledger, are refused", () => {
    expect(problemsWith({ ...line, kind: "Contra", partyLedger: "Rao Steels" }, all, bankLike)[0]).toMatch(/not a bank or cash ledger/);
    expect(problemsWith({ ...line, partyLedger: "ICICI Bank" }, all, bankLike)[0]).toMatch(/must be posted as a Contra/);
  });

  it("GST inside a total is split into whole paise that add up exactly", () => {
    const r = splitGstInclusive(118, 18, true);
    expect(r).toEqual({ base: 100, cgst: 9, sgst: 9, igst: 0 });
    for (const total of [1, 99.99, 590, 1234.57, 0.5]) {
      const s = splitGstInclusive(total, 18, true);
      expect(Math.round((s.base + s.cgst + s.sgst) * 100)).toBe(Math.round(total * 100));
      expect(s.cgst).toBe(s.sgst);
      const i = splitGstInclusive(total, 18, false);
      expect(Math.round((i.base + i.igst) * 100)).toBe(Math.round(total * 100));
    }
    expect(() => splitGstInclusive(0, 18, true)).toThrow();
  });

  it("a bank charge with GST posts as one Payment with a split other side", () => {
    const g = splitGstInclusive(590, 18, true);
    const l: ApprovedLine = {
      ...line,
      direction: "out",
      partyLedger: "Bank Charges",
      splits: [
        { ledger: "Bank Charges", amount: g.base },
        { ledger: "Input CGST", amount: g.cgst },
        { ledger: "Input SGST", amount: g.sgst },
      ],
      amount: 590,
    };
    expect(problemsWith(l, all, bankLike)).toEqual([]);
    const x = importVoucherXml(l);
    expect(x).toContain('VCHTYPE="Payment"');
    expect((x.match(/<ALLLEDGERENTRIES.LIST>/g) ?? []).length).toBe(4);
    expect(x).toMatch(/<LEDGERNAME>Input CGST<\/LEDGERNAME><ISDEEMEDPOSITIVE>Yes<\/ISDEEMEDPOSITIVE><AMOUNT>-45.00</);
    expect(x).toMatch(/<LEDGERNAME>HDFC Bank<\/LEDGERNAME><ISDEEMEDPOSITIVE>No<\/ISDEEMEDPOSITIVE><AMOUNT>590.00</);
  });

  it("a split that does not add up, uses a missing ledger or is a Contra is refused", () => {
    const base = { ...line, direction: "out" as const, amount: 590, partyLedger: "Bank Charges" };
    expect(problemsWith({ ...base, splits: [{ ledger: "Bank Charges", amount: 500 }, { ledger: "Input CGST", amount: 80 }] }, all, bankLike).join()).toMatch(/add up/);
    expect(problemsWith({ ...base, splits: [{ ledger: "Bank Charges", amount: 500 }, { ledger: "Nope GST", amount: 90 }] }, all, bankLike).join()).toMatch(/does not exist/);
    expect(problemsWith({ ...base, splits: [{ ledger: "Bank Charges", amount: 590 }] }, all, bankLike).join()).toMatch(/between 2 and 10/);
    expect(problemsWith({ ...base, kind: "Contra", splits: [{ ledger: "Cash", amount: 300 }, { ledger: "ICICI Bank", amount: 290 }] }, all, bankLike).join()).toMatch(/cannot be split/);
  });
});
