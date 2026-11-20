import { describe, expect, it } from "vitest";
import { detectWorkbook, periodKey, readGstr3bAnnual, readJournalsGst, readPortalReport, readTallyRegister } from "@/lib/practice/gst/reports";
import { checkReturns } from "@/lib/practice/gst/returns";

const pad = (a: string[], n: number) => [...a, ...new Array(Math.max(0, n - a.length)).fill("")];

const G1 = [
  ["Trade Name::", "", "", "", "", "", "SATKAARIKA"],
  ["GSTIN::", "", "", "", "", "", "37AAWCS5771R1ZY"],
  [""], [""],
  ["S.No.", "Original Period", "Amendment Period", "GSTIN", "Document Type", "Party Name", "Invoice No.", "Invoice Date", "RCM", "Invoice Type", " Taxable Value ", " GST % ", " IGST ", " CGST ", " SGST ", " CESS ", " Total Invoice Value ", "Place of Supply"],
  ["1", "Nov-25", "", "37AACCS4019G1ZI", "B2B", "SRI GOPAL", "SGAL/08", "11/17/25", "No", "Regular", " 100.00 ", " 18.00 ", " -   ", " 9.00 ", " 9.00 ", " -   ", " 118.00 ", "AP"],
  ["2", "Dec-25", "", "37AAFCM7648N1ZP", "B2B", "MALKHED", "SO/9", "12/8/25", "No", "Regular", " 1,427,836.62 ", " 18.00 ", " -   ", " 128,505.29 ", " 128,505.29 ", " -   ", " 1,684,847.00 ", "AP"],
  ["3", "Dec-25", "", "37AAFCM7648N1ZP", "Credit Note", "MALKHED", "CN/1", "12/9/25", "No", "Regular", " 1,000.00 ", " 18.00 ", " -   ", " 90.00 ", " 90.00 ", " -   ", " 1,180.00 ", "AP"],
];

describe("periods", () => {
  it("reads every way a month is written", () => {
    expect(["Dec-25", "Dec/2025", "122025", "2025-12-08"].map(periodKey)).toEqual(["2025-12", "2025-12", "2025-12", "2025-12"]);
    expect(periodKey("")).toBeNull();
  });
});

const SALES = [
  ["CO", "", "", "", "", "", "", "", "", "", ""],
  ["Sales Register"],
  [""],
  ["Date", "Particulars", "Voucher Type", "Voucher No.", "GSTIN/UIN", "Narration", "Gross Total", "Gst Sales @ 18%", "Output CGST", "Output SGST", "Round Off A/c"],
  ["08-12-2025", "MALKHED", "Sales", "SO/9", "37AAFCM7648N1ZP", "", "1,684,847.00", "1,427,836.62", "128,505.29", "128,505.29", "(0.20)"],
  ["20-11-2025", "OTHER MONTH", "Sales", "SO/1", "37AAFCM7648N1ZP", "", "118.00", "100", "9", "9", ""],
  ["Total", "", "", "", "", "", "", "", "", "", ""],
];
const PURCH = [
  ["Purchase Register"],
  ["Date", "Particulars", "Voucher Type", "Voucher No.", "Supplier Invoice No.", "Supplier Invoice Date", "GSTIN/UIN", "Narration", "Gross Total", "18% Goods", "Input CGST", "Input SGST", "Input Cgst CF 26-27", "Input Sgst CF 26-27", "Round Off A/c"],
  ["03-12-2025", "ANNAPUREDDY", "Purchase", "167", "11", "03-12-2025", "37HPCPP1404M1ZO", "", "4,991.40", "4,230.00", "", "", "380.70", "380.70", ""],
  ["04-12-2025", "R K READY MIX", "Purchase", "174", "RK/2285", "04-12-2025", "", "", "17,412.01", "14,755.93", "1,328.03", "1,328.03", "", "", "0.02"],
];
const JOURNALS = [
  ["Journal vouchers posting to GST ledgers"],
  ["Date", "Voucher Type", "Voucher No.", "Narration", "Ledger", "Debit", "Credit"],
  ["13-12-2025", "Journal", "1089", "", "18% Goods Purchase", "1,144,152.80", ""],
  ["", "", "", "", "Input CGST", "114,402.15", ""],
  ["", "", "", "", "Input SGST", "114,402.15", ""],
  ["", "", "", "", "Sri Mangalagiri", "", "1,373,957.10"],
  ["31-12-2025", "Journal", "1278", "RCM", "RCM CGST INPUT", "1,634.00", ""],
  ["", "", "", "", "RCM SGST INPUT", "1,634.00", ""],
  ["", "", "", "", "RCM INPUT IGST", "6,300.00", ""],
  ["", "", "", "", "RCM SGST PAYABLE", "", "1,634.00"],
  ["", "", "", "", "RCM CGST PAYABLE", "", "1,634.00"],
  ["", "", "", "", "RCM IGST PAYABLE", "", "6,300.00"],
  ["31-12-2025", "Journal", "1279", "", "RCM CGST PAYABLE", "1,634.00", ""],
  ["", "", "", "", "GST (CGST+SGST+IGST)", "", "1,634.00"],
  ["31-12-2025", "Journal", "1286", "", "Output CGST", "1,853,064.00", ""],
  ["", "", "", "", "Input CGST", "", "1,853,064.00"],
  ["Total"],
];

describe("Tally registers", () => {
  it("reads sales: GSTIN, number, taxable from the heads, tax from the tax ledgers; keeps the month", () => {
    const r = readTallyRegister(SALES, { month: "2025-12", side: "sales" });
    expect(r.invoices).toHaveLength(1);
    expect(r.invoices[0]).toMatchObject({ gstin: "37AAFCM7648N1ZP", no: "SO/9", date: "2025-12-08", taxable: 1427836.62, cgst: 128505.29, total: 1684847 });
    expect(r.notes.join(" ")).not.toMatch(/do not add/);
  });
  it("uses the supplier invoice number, and tax parked in a carry-forward ledger is not claimed credit", () => {
    const r = readTallyRegister(PURCH, { month: "2025-12", side: "purchase" }) as ReturnType<typeof readTallyRegister> & { invoices: { claimedTax?: number; no: string; cgst: number }[] };
    expect(r.invoices.map((i) => i.no)).toEqual(["11", "RK/2285"]);
    expect(r.invoices[0]).toMatchObject({ cgst: 380.7, claimedTax: 0 });
    expect(r.invoices[1]!.claimedTax).toBeCloseTo(2656.06, 2);
    expect(r.notes.join(" ")).toMatch(/1 have no supplier GSTIN/);
  });
});

describe("journals with GST", () => {
  it("reads a purchase journal and the reverse charge liability, and leaves out set-off and payment entries", () => {
    const j = readJournalsGst(JOURNALS, { month: "2025-12" });
    expect(j.purchases).toHaveLength(1);
    expect(j.purchases[0]).toMatchObject({ party: "Sri Mangalagiri", no: "1089", cgst: 114402.15, taxable: 1144152.8 });
    expect(j.rcm).toMatchObject({ igst: 6300, cgst: 1634, sgst: 1634 });
    expect(j.skipped).toBe(2);
  });
});

describe("portal reports for the year", () => {
  it("keeps one month of a year-long report and reads the portal's month/day/year dates and credit notes", () => {
    const r = readPortalReport(G1, { kind: "gstr1", month: "2025-12" });
    expect(r.invoices.map((i) => i.no)).toEqual(["SO/9", "CN/1"]);
    expect(r.invoices[0]).toMatchObject({ date: "2025-12-08", gstin: "37AAFCM7648N1ZP", taxable: 1427836.62 });
    expect(r.invoices[1]).toMatchObject({ docType: "credit_note", taxable: -1000, cgst: -90 });
    expect(r.ownGstin).toBe("37AAWCS5771R1ZY");
  });
  it("tells GSTR-1 from GSTR-2B and from a Tally register by the headings", () => {
    expect(detectWorkbook([{ name: "x", rows: G1 }]).kind).toBe("gstr1_report");
    expect(detectWorkbook([{ name: "x", rows: [["Report", "GSTR - 2B"], ...G1.slice(1)] }]).kind).toBe("gstr2b_report");
    expect(detectWorkbook([{ name: "Sales Register", rows: SALES }]).kind).toBe("tally_register");
    expect(detectWorkbook([{ name: "J", rows: JOURNALS }]).kind).toBe("tally_journals");
  });
});

describe("GSTR-3B annual report", () => {
  // Year total block at columns 2..6, then April at 7..11, May at 12..16 ...
  const blank = new Array(70).fill("");
  const row = (label: string, at: Record<number, string | number>, col0 = "") => { const r = [...blank]; r[0] = col0; r[1] = label; for (const [k, v] of Object.entries(at)) r[Number(k)] = String(v); return r; };
  const monthCol = (m: number) => 7 + 5 * m; // April = 0
  const dec = monthCol(8);
  const rows = [
    row("GSTR-3B Annual Report", {}),
    row("DETAILS OF OUTWARD SUPPLIES", { 7: "April", 12: "May" }),
    row("(A)OUTWARD TAXABLE  SUPPLIES  (OTHER THAN ZERO RATED, NIL RATED AND EXEMPTED)", { [dec]: 20589596.57, [dec + 1]: 0, [dec + 2]: 1853063.7, [dec + 3]: 1853063.7, [dec + 4]: 0 }, "1)"),
    row("(D)INWARD SUPPLIES (LIABLE TO REVERSE CHARGE)", { [dec]: 53150, [dec + 1]: 6300, [dec + 2]: 1633.5, [dec + 3]: 1633.5 }, "4)"),
    row("ELIGIBLE ITC", {}),
    row("INWARD SUPPLIES LIABLE TO REVERSE CHARGE(OTHER THAN 1 & 2 ABOVE)", { [dec]: 6300, [dec + 1]: 1633.5, [dec + 2]: 1633.5, [dec + 3]: 0 }, "3)"),
    row("(B) ITC REVERSED", { [dec]: 0 }),
    row("(C) NET ITC AVAILABLE (A)-(B)", { [dec]: 957615.3, [dec + 1]: 1655405.21, [dec + 2]: 1655405.21, [dec + 3]: 0 }),
  ];
  it("takes the chosen month's block", () => {
    const r = readGstr3bAnnual(rows, "2025-12");
    expect(r.outward).toMatchObject({ taxable: 20589596.57, cgst: 1853063.7 });
    expect(r.rcm).toMatchObject({ igst: 6300, cgst: 1633.5 });
    expect(r.itcOnRcm.igst).toBe(6300);
    expect(r.itcNet).toMatchObject({ igst: 957615.3, cgst: 1655405.21 });
  });
  it("runs the four checks on a real-shaped month, finds the invoice only GSTR-1 has, and agrees reverse charge to the rupee", () => {
    const g1 = readPortalReport([...G1, ["4", "Dec-25", "", "37AACCS4019G1ZI", "B2B", "SRI GOPAL", "SGAL/09", "12/17/25", "No", "Regular", " 12,556,526.00 ", " 18.00 ", " -   ", " 1,130,087.34 ", " 1,130,087.34 ", " -   ", " 14,816,701.00 ", "AP"]], { kind: "gstr1", month: "2025-12" });
    const sales = readTallyRegister(SALES, { month: "2025-12", side: "sales" });
    const j = readJournalsGst(JOURNALS, { month: "2025-12" });
    const c = checkReturns({ salesBooks: sales, gstr1: { ...g1, b2c: { taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 }, exportsAndNil: { taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 } }, gstr3b: readGstr3bAnnual(rows, "2025-12"), rcmBooks: j.rcm });
    const s = c.find((x) => x.id === "sales")!;
    expect(s.invoiceRecon!.missingInBooks.map((i) => i.no)).toEqual(["CN/1", "SGAL/09"]);
    expect(c.find((x) => x.id === "rcm")!.status).toBe("agree");
  });
});

describe("credit notes in portal reports", () => {
  const head = ["S.No.", "Original Period", "Amendment Period", "GSTIN", "Document Type", "Party Name", "Invoice No.", "Invoice Date", "RCM", "Invoice Type", " Taxable Value ", " GST % ", " IGST ", " CGST ", " SGST ", " CESS ", " Total Invoice Value "];
  it("keeps a credit note negative whether the file prints it negative or positive (the year total once added them)", () => {
    const rows = [head,
      ["1", "Dec-25", "", "37AAA", "B2B", "X", "I1", "12/8/25", "No", "Regular", " 1,000.00 ", " 18.00 ", " -   ", " 90.00 ", " 90.00 ", " -   ", " 1,180.00 "],
      ["2", "Dec-25", "", "37AAA", "Credit Note", "X", "C1", "12/9/25", "No", "Regular", " -38,750.00 ", " 18.00 ", " -   ", " -3,487.50 ", " -3,487.50 ", " -   ", " -45,725.00 "],
      ["3", "Dec-25", "", "37AAA", "Credit Note", "X", "C2", "12/9/25", "No", "Regular", " 100.00 ", " 18.00 ", " -   ", " 9.00 ", " 9.00 ", " -   ", " 118.00 "]];
    const r = readPortalReport(rows, { kind: "gstr1", month: "2025-12" });
    expect(r.invoices.map((i) => i.taxable)).toEqual([1000, -38750, -100]);
    expect(r.invoices[1]!.cgst).toBe(-3487.5);
  });
});

import { fiscalMonths, yearView } from "@/lib/practice/gst/year";
import type { ReadInvoices } from "@/lib/practice/gst/invoices";

describe("GST by year", () => {
  const inv = (tax: number): ReadInvoices => ({ period: null, ownGstin: null, notes: [], invoices: [{ gstin: "G", party: "", no: "1", date: null, pos: "", taxable: tax * 5.5556, igst: 0, cgst: tax / 2, sgst: tax / 2, cess: 0, total: null, rate: 18, hsn: "", irn: "", reverseCharge: false, itc: "Y", docType: "invoice", filedIn: null, row: 1, lines: 1, repeats: 0 }] });
  const empty = (): ReadInvoices => ({ period: null, ownGstin: null, notes: [], invoices: [] });
  const z = { taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 };
  const b3 = (out: number, net = 0): import("@/lib/practice/gst/returns").Gstr3bRead => ({ period: null, ownGstin: null, outward: { taxable: out * 5.5556, igst: 0, cgst: out / 2, sgst: out / 2, cess: 0 }, rcm: z, itcAvailable: z, itcOnRcm: z, itcReversed: z, itcNet: { ...z, cgst: net / 2, sgst: net / 2 }, notes: [] });
  it("lists the twelve months of a financial year, April first", () => {
    const m = fiscalMonths(2025);
    expect([m[0], m[8], m[11]]).toEqual(["2025-04", "2025-12", "2026-03"]);
  });
  it("shows a difference that clears the next month as timing: the running total returns to nil", () => {
    // Month 1: 3B declares 100 less than GSTR-1; month 2: 3B declares 100 more. A month-only cut shows two differences; the year shows none.
    const v = yearView(["2025-04", "2025-05"], { gstr1: () => inv(1000), gstr2b: () => empty(), gstr3b: (m) => (m === "2025-04" ? b3(900) : b3(1100)) });
    expect(v.rows.map((r) => r.outwardDiff)).toEqual([100, -100]);
    expect(v.rows.map((r) => r.outwardCumulative)).toEqual([100, 0]);
    expect(v.totals.outwardDiff).toBe(0);
  });
  it("calls a year with a missing month incomplete", () => {
    const v = yearView(["2025-04", "2025-05"], { gstr1: (m) => (m === "2025-04" ? inv(10) : empty()), gstr2b: () => inv(5), gstr3b: () => b3(10) });
    expect(v.missing.gstr1).toEqual(["2025-05"]);
    expect(v.notes.join(" ")).toMatch(/incomplete/);
    expect(v.notes.join(" ")).toMatch(/provisional/);
  });
});
