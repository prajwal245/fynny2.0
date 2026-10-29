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
