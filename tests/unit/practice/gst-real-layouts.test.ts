// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { detectDateOrder, isoDate, readInvoiceRows } from "@/lib/practice/gst/invoices";
import { readGstFile, readGstr3bFile } from "@/lib/practice/gst/files";
import { gstr3bFor, inMonth, isGstr1Workbook, periodOfMonth, readGstr3bAnnualRows, toGstr1Read } from "@/lib/practice/gst/portalExcel";
import { readTallyJournalsGst, readTallyRegisterRows, readTallyRegisterWorkbook } from "@/lib/practice/gst/tallyRegister";
import { checkReturns } from "@/lib/practice/gst/returns";
import { runValidations } from "@/lib/practice/gst/validations";
import { OWN, SALES, PURCHASES, DEBIT_NOTES, JOURNALS, G1, ANNUAL, BUYER_A, SUP_A, SUP_B } from "../../helpers/gstRealLayouts";

describe("dates written month first", () => {
  it("reads 4/22/2025 as 22 April once any date in the column proves month first", () => {
    expect(detectDateOrder(["12/8/2025", "4/22/2025"])).toBe("mdy");
    expect(isoDate("12/8/2025", "mdy")).toBe("2025-12-08");
  });
  it("keeps Indian day-first as the default, and never lets one proof override the other", () => {
    expect(detectDateOrder(["12/8/2025", "22/4/2025"])).toBe("dmy");
    expect(detectDateOrder(["12/8/2025"])).toBe("dmy");
    expect(detectDateOrder(["4/22/2025", "22/4/2025"])).toBe("dmy");
    expect(isoDate("12/8/2025")).toBe("2025-08-12");
  });
});

describe("GSTR-1 workbook", () => {
  const r = readInvoiceRows(G1, { dateOrder: "mdy" });
  it("is recognised by its title", () => expect(isGstr1Workbook(G1)).toBe(true));
  it("reads every invoice with month-first dates, the credit note negative, and skips the total row", () => {
    expect(r.invoices.map((i) => i.no)).toEqual(["SGAL/C/08", "SGAL/CR/01", "SO/IT/008", "SO/IT/009", "SO/IT/010", "SO/LS/01", "SGAL/C/09"]);
    const dec = r.invoices.find((i) => i.no === "SO/LS/01")!;
    expect(dec).toMatchObject({ date: "2025-12-13", taxable: 3_500_000, cgst: 315_000, sgst: 315_000, gstin: BUYER_A });
    expect(r.invoices.find((i) => i.no === "SGAL/CR/01")).toMatchObject({ docType: "credit_note", taxable: -40_000, date: "2025-11-25" });
  });
  it("detects the month-first order by itself when the column proves it", () => {
    const auto = readInvoiceRows(G1);
    expect(auto.invoices.find((i) => i.no === "SO/IT/008")!.date).toBe("2025-12-08");
    expect(auto.notes.join(" ")).toMatch(/month first/);
  });
  it("cuts one month out for the checks", () => {
    const dec = inMonth(r, "2025-12");
    expect(dec.invoices).toHaveLength(5);
    expect(toGstr1Read(r, "2025-12").invoices).toHaveLength(5);
  });
});

describe("Tally sales and purchase registers", () => {
  it("adds the ledger columns into the taxable value and ties each voucher to its gross total", () => {
    const r = readTallyRegisterRows(SALES, { kind: "sales" });
    expect(r.invoices).toHaveLength(4);
    const ls = r.invoices.find((i) => i.no === "SO/LS/01")!;
    expect(ls).toMatchObject({ taxable: 3_500_000, cgst: 315_000, sgst: 315_000, date: "2025-12-13", gstin: BUYER_A });
    expect(r.invoices.find((i) => i.no === "SO/IT/009")!.taxable).toBe(200_000); // round-off is not taxable
    expect(r.notes.join(" ")).not.toMatch(/do not add up/);
    expect(r.period).toBe("2025-12");
  });
  it("names a voucher whose ledger columns do not explain its gross total", () => {
    const bad = SALES.map((r) => (r[3] === "SO/IT/010" ? r.map((c, k) => (k === 6 ? "600,000.00" : c)) : r));
    const r = readTallyRegisterRows(bad, { kind: "sales" });
    expect(r.notes.join(" ")).toMatch(/1 voucher's ledger columns do not add up to the gross total \(SO\/IT\/010/);
  });
  it("reads purchases by the supplier's invoice number and keeps the booking date", () => {
    const r = readTallyRegisterRows(PURCHASES, { kind: "purchase" });
    expect(r.invoices).toHaveLength(4);
    const late = r.invoices.find((i) => i.no === "6")!;
    expect(late).toMatchObject({ date: "2025-07-15", bookedOn: "2025-12-01", taxable: 100_000, cgst: 9_000, gstin: SUP_A });
    const inter = r.invoices.find((i) => i.no === "RK0259")!;
    expect(inter).toMatchObject({ igst: 3_150, cgst: 0, taxable: 17_500, gstin: SUP_B });
    expect(r.invoices.find((i) => i.no === "RK/2318")!.gstin).toBe("");
  });
  it("uses the voucher number and says so when a purchase has no supplier invoice number", () => {
    const rows = PURCHASES.map((r) => (r[3] === "166" ? r.map((c, k) => (k === 4 ? "" : c)) : r));
    const r = readTallyRegisterRows(rows, { kind: "purchase" });
    expect(r.invoices.some((i) => i.no === "166")).toBe(true);
    expect(r.notes.join(" ")).toMatch(/1 purchase voucher has no supplier invoice number/);
  });
  it("reads a debit note register as credit notes that reduce the purchases", () => {
    const wb = readTallyRegisterWorkbook([
      { name: "Purchase Register", rows: PURCHASES },
      { name: "Debit Note Register", rows: DEBIT_NOTES },
      { name: "Journals with GST", rows: JOURNALS },
    ])!;
    const note = wb.purchases!.invoices.find((i) => i.no === "MW1")!;
    expect(note).toMatchObject({ docType: "credit_note", taxable: -10_000, cgst: -900, sgst: -900 });
    expect(wb.purchases!.notes.join(" ")).toMatch(/journal voucher takes input tax credit|journal voucher/);
  });
  it("finds input credit taken through journals, and ignores reverse charge and payments", () => {
    const j = readTallyJournalsGst(JOURNALS)!;
    expect(j.vouchers).toBe(3);
    expect(j.inputCreditJournals).toEqual([{ no: "1089", date: "2025-12-13", amount: 180 }]);
    expect(j.note).toMatch(/1 journal voucher take/);
  });
  it("says a sheet is not a Tally register instead of guessing", () => {
    expect(readTallyRegisterRows([["a", "b"], ["1", "2"]], { kind: "sales" }).invoices).toHaveLength(0);
    expect(readTallyRegisterWorkbook([{ name: "Sheet1", rows: [["a"]] }])).toBeNull();
  });
});

describe("GSTR-3B annual report", () => {
  const a = readGstr3bAnnualRows(ANNUAL);
  it("reads the financial year and names the twelve months", () => {
    expect(a.startYear).toBe(2025);
    expect(a.months).toHaveLength(12);
    expect(a.months.map((m) => m.period)).toEqual(["2025-04", "2025-05", "2025-06", "2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03"]);
    expect(periodOfMonth(2025, 0)).toBe("2025-04");
    expect(periodOfMonth(2025, 9)).toBe("2026-01");
  });
  it("reads one month's outward supplies, reverse charge and ITC", () => {
    const dec = gstr3bFor(a, "2025-12")!;
    expect(dec.outward).toMatchObject({ taxable: 12_200_000, cgst: 1_098_000, sgst: 1_098_000, igst: 0 });
    expect(dec.rcm.igst).toBe(600);
    expect(dec.itcAvailable.cgst + dec.itcAvailable.sgst).toBe(400_000);
    expect(dec.itcNet.cgst + dec.itcNet.sgst).toBe(400_000);
    expect(gstr3bFor(a, "2026-02")!.outward.taxable).toBe(0);
    expect(gstr3bFor(a, "2024-12")).toBeNull();
  });
  it("refuses a sheet that is not the annual report in plain words", () => {
    expect(readGstr3bAnnualRows([["a", "b"]]).notes[0]).toMatch(/does not look like the GSTR-3B annual report/);
  });
});

describe("the real December case: GSTR-1 and 3B agree, one invoice is missing from the books", () => {
  const books = readTallyRegisterRows(SALES, { kind: "sales" });
  const g1 = toGstr1Read(readInvoiceRows(G1, { dateOrder: "mdy" }), "2025-12");
  const g3b = gstr3bFor(readGstr3bAnnualRows(ANNUAL), "2025-12")!;
  const checks = checkReturns({ salesBooks: books, gstr1: g1, gstr3b: g3b });
  it("finds GSTR-1 and GSTR-3B in agreement", () => {
    const outward = checks.find((c) => c.id === "outward")!;
    expect(outward.status).toBe("agree");
  });
  it("names the invoice that is in GSTR-1 but not in the Tally sales register, and the tax it leaves out", () => {
    const sales = checks.find((c) => c.id === "sales")!;
    expect(sales.status).toBe("differs");
    expect(sales.invoiceRecon!.missingInBooks.map((i) => i.no)).toEqual(["SGAL/C/09"]);
    const tax = sales.lines.find((l) => l.label === "Tax")!;
    expect(tax.a).toBe(936_000); // Tally: 468,000 + 468,000
    expect(tax.b).toBe(2_196_000); // GSTR-1: 1,098,000 + 1,098,000
    expect(tax.diff).toBe(-1_260_000); // = the missing invoice's tax
  });
});

describe("what the validations say about the real purchase register", () => {
  const r = readTallyRegisterRows(PURCHASES, { kind: "purchase" });
  const run = runValidations(r.invoices, { side: "purchase", period: "2025-12", ownGstin: OWN });
  const failed = (id: string) => run.failed.find((v) => v.id === id);
  it("flags tax charged by a supplier whose GSTIN is not recorded", () => {
    expect(failed("gstin_missing")?.count).toBe(1);
    expect(failed("gstin_missing")?.examples.join(" ")).toMatch(/RK\/2318/);
  });
  it("flags the same amount twice from one supplier on one day under different numbers", () => {
    expect(failed("probable_duplicate")?.count).toBeGreaterThan(0);
  });
  it("flags an invoice booked months after its date", () => {
    expect(failed("booked_late")?.count).toBe(1);
    expect(failed("booked_late")?.examples.join(" ")).toMatch(/6/);
  });
});

describe("reading real workbooks from disk-like Excel files", () => {
  const book = (sheets: Record<string, string[][]>) => {
    const wb = XLSX.utils.book_new();
    for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    return (name: string) => new File([out], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  };
  it("takes the sales register for the sales slot and the purchase register for the purchase slot", async () => {
    const file = book({ "Sales Register": SALES, "Purchase Register": PURCHASES, "Debit Note Register": DEBIT_NOTES, "Journals with GST": JOURNALS })("Registers.xlsx");
    const s = await readGstFile(file, { kind: "sales" });
    expect(s.invoices.map((i) => i.no)).toContain("SO/LS/01");
    expect(s.invoices.some((i) => i.no === "RK0259")).toBe(false);
    const p = await readGstFile(file, { kind: "purchase" });
    expect(p.invoices.some((i) => i.no === "RK0259")).toBe(true);
    expect(p.invoices.some((i) => i.no === "MW1" && i.docType === "credit_note")).toBe(true);
  });
  it("leaves a plain register alone even when its sheet is called Purchase Register", async () => {
    const plain = [
      ["GSTIN of Supplier", "Trade Name", "Invoice Number", "Invoice Date", "Taxable Value", "Central Tax", "State/UT Tax", "Invoice Value"],
      [SUP_A, "Alpha", "A-1", "2026-09-03", "800000", "72000", "72000", "944000"],
    ];
    const r = await readGstFile(book({ "Purchase Register": plain })("06_Purchase_Register.xlsx"), { kind: "purchase" });
    expect(r.invoices).toHaveLength(1);
    expect(r.invoices[0]).toMatchObject({ no: "A-1", taxable: 800_000, cgst: 72_000, gstin: SUP_A });
    expect(readTallyRegisterWorkbook([{ name: "Purchase Register", rows: plain }])).toBeNull();
  });
  it("says so when the workbook has no sheet for the register asked for", async () => {
    const r = await readGstFile(book({ "Sales Register": SALES })("s.xlsx"), { kind: "purchase" });
    expect(r.invoices).toHaveLength(0);
    expect(r.notes[0]).toMatch(/no purchase register sheet/);
  });
  it("reads the GSTR-1 workbook with month-first dates without being told", async () => {
    const r = await readGstFile(book({ Summary: [["Summary"], ["Trade Name", "ACME"]], "Outward Supply Details": G1 })("GSTR-1.xlsx"));
    expect(r.invoices.find((i) => i.no === "SO/IT/008")!.date).toBe("2025-12-08");
    expect(r.invoices).toHaveLength(7);
  });
  it("reads the GSTR-3B annual report file", async () => {
    const a = await readGstr3bFile(book({ Sheet1: ANNUAL })("GSTR-3B.xlsx"));
    expect(gstr3bFor(a, "2025-12")!.outward.cgst).toBe(1_098_000);
    expect((await readGstr3bFile(book({ Sheet1: [["x"]] })("bad.xlsx"))).months).toHaveLength(0);
  });
});
