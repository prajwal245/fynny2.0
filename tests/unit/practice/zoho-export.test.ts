import { describe, expect, it } from "vitest";
import { buildZohoExport, countFor, csvCell, expenseAccount, invoiceRef, partyOf, zohoDate, type ExportException } from "@/lib/practice/zohoExport";

const ex = (o: Partial<ExportException> & { id: string }): ExportException => ({ clientId: "c1", date: "2026-09-12", amount: -590, narration: "SMS CHGS", side: "bank", status: "open", ...o });
const list: ExportException[] = [
  ex({ id: "a", date: "2026-09-05", amount: -590, narration: "BANK CHARGES GST ON CHG" }),
  ex({ id: "b", date: "2026-09-08", amount: 12500, narration: "UPI/CR/4455667788/Sundar Auto/INV-2603" }),
  ex({ id: "c", date: "2026-09-20", amount: -45000, narration: "NEFT DR-OFFICE RENT-SEP" }),
  ex({ id: "d", clientId: "c2", amount: -1 }),
  ex({ id: "e", status: "resolved" }),
  ex({ id: "f", side: "books" }),
  ex({ id: "g", date: "2026-10-01", amount: -100, narration: "=HYPERLINK(\"x\")" }),
];
const opts = { clientId: "c1", clientName: "Sun International", period: "2026-09" };

describe("Export for Zoho", () => {
  it("formats dates the way Zoho imports them", () => expect(zohoDate("2026-09-05")).toBe("05/09/2026"));

  it("exports only this client's open bank-side lines in the period", () => {
    expect(countFor(list, "c1", "2026-09")).toEqual({ out: 2, in: 1, all: 3 });
    expect(countFor(list, "c1", null).all).toBe(4);
  });

  it("builds expenses with an account guess and unsigned amounts", () => {
    const x = buildZohoExport("expenses", list, opts);
    expect(x.count).toBe(2);
    expect(x.total).toBe(45590);
    expect(x.filename).toBe("zoho-expenses_sun-international_2026-09.csv");
    const rows = x.csv.trim().split("\r\n");
    expect(rows[0]).toBe("Expense Date,Expense Account,Paid Through,Amount,Vendor,Reference#,Notes");
    expect(rows[1]).toContain("05/09/2026,Bank Fees and Charges,,590.00");
    expect(rows[2]).toContain("Rent Expense,,45000.00");
  });

  it("builds receipts with the customer, UTR and invoice number", () => {
    const x = buildZohoExport("receipts", list, opts);
    expect(x.count).toBe(1);
    expect(x.csv).toContain("08/09/2026,Sundar Auto,12500.00,Bank Transfer,,4455667788,INV-2603");
  });

  it("builds Zoho's bank-statement layout with withdrawals and deposits in separate columns", () => {
    const rows = buildZohoExport("bank", list, opts).csv.trim().split("\r\n");
    expect(rows[0]).toBe("Date,Description,Reference Number,Withdrawals,Deposits,Payee");
    expect(rows).toHaveLength(4);
    expect(rows[1]).toContain(",590.00,,");
    expect(rows[2]).toContain(",,12500.00,");
  });

  it("never lets a narration run as a spreadsheet formula, and quotes commas and quotes", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("-5.00")).toBe("-5.00");
    expect(csvCell('A, "B"')).toBe('"A, ""B"""');
    const x = buildZohoExport("bank", list, { ...opts, period: "2026-10" });
    expect(x.csv).toContain("'=HYPERLINK");
  });

  it("returns an empty (header-only) file when nothing is open", () => {
    const x = buildZohoExport("receipts", [], opts);
    expect(x.count).toBe(0);
    expect(x.csv.trim().split("\r\n")).toHaveLength(1);
  });

  it("guesses accounts, parties and invoices conservatively", () => {
    expect(expenseAccount("AIRTEL BROADBAND")).toBe("Utilities");
    expect(expenseAccount("PAID TO RAMESH")).toBe("Other Expenses");
    expect(partyOf("NEFT CR-KAVERI TEXTILES PVT LTD-INV-2601")).toBe("KAVERI TEXTILES PVT LTD");
    expect(partyOf("UPI/CR/123456789012")).toBe("");
    expect(invoiceRef("NEFT CR-MEHTA-INV 2602")).toBe("INV2602");
    expect(invoiceRef("no invoice here")).toBe("");
  });
});

import { buildTallyExport, detectBooks } from "@/lib/practice/zohoExport";

describe("Export for Tally", () => {
  const o = { clientId: "c1", clientName: "Sun International", period: "2026-09", bankLedger: "Axis Bank A/c" };

  it("writes a Payment voucher (expense debited, bank credited) and a Receipt voucher (bank debited, party credited)", () => {
    const x = buildTallyExport(list, o);
    expect(x.count).toBe(3);
    expect(x.filename).toBe("tally-vouchers_sun-international_2026-09.xml");
    expect(x.xml).toContain('<VOUCHER VCHTYPE="Payment" ACTION="Create"><DATE>20260905</DATE>');
    expect(x.xml).toContain("<LEDGERNAME>Bank Charges</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-590.00</AMOUNT>");
    expect(x.xml).toContain("<LEDGERNAME>Axis Bank A/c</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>590.00</AMOUNT>");
    expect(x.xml).toContain('<VOUCHER VCHTYPE="Receipt" ACTION="Create"><DATE>20260908</DATE>');
    expect(x.xml).toContain("<LEDGERNAME>Sundar Auto</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>12500.00</AMOUNT>");
  });

  it("every voucher balances: debits equal credits", () => {
    const x = buildTallyExport(list, o).xml;
    for (const v of x.split("<VOUCHER ").slice(1)) {
      const amounts = [...v.matchAll(/<AMOUNT>(-?[\d.]+)<\/AMOUNT>/g)].map((m) => Number(m[1]));
      expect(Math.round(amounts.reduce((a, b) => a + b, 0) * 100)).toBe(0);
    }
  });

  it("creates the ledgers it names under a group, escapes XML and never writes a bad character", () => {
    const x = buildTallyExport([ex({ id: "z", date: "2026-09-02", amount: -100, narration: 'R&D <test> "x"\u0001' })], { ...o, bankLedger: "A & B Bank" }).xml;
    expect(x).toContain('<LEDGER NAME="Miscellaneous Expenses" ACTION="Create">');
    expect(x).toContain("<PARENT>Indirect Expenses</PARENT>");
    expect(x).toContain("R&amp;D &lt;test&gt; &quot;x&quot;");
    expect(x).toContain("A &amp; B Bank");
    expect(x).not.toMatch(/\u0001/);
  });

  it("knows which books a client keeps from the documents already there", () => {
    expect(detectBooks([{ clientId: "c1", source: "Zoho Books" }], "c1")).toBe("zoho");
    expect(detectBooks([{ clientId: "c1", side: "books", kind: "tally_xml" }], "c1")).toBe("tally");
    expect(detectBooks([{ clientId: "c1", side: "bank", kind: "csv" }], "c1")).toBeNull();
    expect(detectBooks([{ clientId: "c2", source: "Zoho Books" }], "c1")).toBeNull();
  });
});

import { similarLines } from "@/lib/practice/zohoExport";

describe("similar lines", () => {
  const more: ExportException[] = [
    ex({ id: "s1", amount: -17.7, narration: "SMS CHGS 01-07-25 TO 30-09-25" }),
    ex({ id: "s2", amount: -590, narration: "BANK CHARGES GST ON CHG" }),
    ex({ id: "s3", amount: -45000, narration: "SHOP RENT - GURU NANAK MARKET" }),
    ex({ id: "s4", amount: 5000, narration: "NEFT CR-KAVERI TEXTILES-INV-2601" }),
    ex({ id: "s5", amount: 7000, narration: "NEFT CR-KAVERI TEXTILES-INV-2609" }),
    ex({ id: "s6", amount: 9000, narration: "NEFT CR-MEHTA FOODS-INV-2602" }),
  ];
  it("groups bank charges together and keeps rent apart", () => {
    expect(similarLines(more, { amount: -17.7, narration: "SMS CHGS" }).map((e) => e.id)).toEqual(["s1", "s2"]);
  });
  it("groups receipts from the same customer, not every receipt", () => {
    expect(similarLines(more, { amount: 5000, narration: "NEFT CR-KAVERI TEXTILES-INV-2601" }).map((e) => e.id)).toEqual(["s4", "s5"]);
  });
});
