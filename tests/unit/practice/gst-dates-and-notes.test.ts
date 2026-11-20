import { describe, expect, it } from "vitest";
import { gstinCheckChar } from "@/lib/practice/india";
import { detectDateOrder, isoDate, readInvoiceRows } from "@/lib/practice/gst/invoices";
import { readTallyRegister } from "@/lib/practice/gst/reports";
import { runValidations } from "@/lib/practice/gst/validations";

/** Layouts copied from real files a CA sent; names, GSTINs and amounts are made up. */
const gstin = (state: string, pan: string) => {
  const first14 = `${state}${pan}1Z`;
  return first14 + gstinCheckChar(first14);
};
const SUP = gstin("37", "DDDDD3333D");

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

describe("an invoice list that has both Document Type and Invoice Type", () => {
  const head = ["S.No.", "Original Period", "GSTIN", "Document Type", "Party Name", "Invoice No.", "Invoice Date", "Invoice Type", " Taxable Value ", " GST % ", " IGST ", " CGST ", " SGST ", " Total Invoice Value "];
  const rows = [
    head,
    ["1", "Nov-25", SUP, "B2B", "BUYER", "S/08", "11/22/2025", "Regular", " 800,000.00 ", " 18.00 ", " - ", " 72,000.00 ", " 72,000.00 ", " 944,000.00 "],
    ["2", "Nov-25", SUP, "Credit Note", "BUYER", "CR/01", "11/25/2025", "Regular", " -40,000.00 ", " 18.00 ", " - ", " -3,600.00 ", " -3,600.00 ", " -47,200.00 "],
    ["3", "Dec-25", SUP, "B2B", "BUYER", "S/09", "12/8/2025", "Regular", " 1,000,000.00 ", " 18.00 ", " - ", " 90,000.00 ", " 90,000.00 ", " 1,180,000.00 "],
  ];
  const r = readInvoiceRows(rows);
  it("takes the document kind from Document Type, so a credit note is a credit note", () => {
    expect(r.invoices.find((i) => i.no === "CR/01")).toMatchObject({ docType: "credit_note", taxable: -40_000, date: "2025-11-25" });
    expect(r.invoices.find((i) => i.no === "S/08")!.docType).toBe("invoice");
  });
  it("reads the month-first dates by itself and says so", () => {
    expect(r.invoices.find((i) => i.no === "S/09")!.date).toBe("2025-12-08");
    expect(r.notes.join(" ")).toMatch(/month first/);
  });
});

describe("purchases booked long after the supplier's invoice", () => {
  const rows = [
    ["Purchase Register"],
    ["Date", "Particulars", "Voucher Type", "Voucher No.", "Supplier Invoice No.", "Supplier Invoice Date", "GSTIN/UIN", "Narration", "Gross Total", "18% Goods Purchase", "Input CGST", "Input SGST", "Round Off A/c"],
    ["01-12-2025", "SUPPLIER ONE", "Purchase", "166", "6", "15-07-2025", SUP, "", "118,000.00", "100,000.00", "9,000.00", "9,000.00", ""],
    ["08-12-2025", "SUPPLIER TWO", "Purchase", "179", "RK/2318", "08-12-2025", SUP, "", "17,700.00", "15,000.00", "1,350.00", "1,350.00", ""],
    ["Total", "", "", "", "", "", "", "", "135,700.00", "115,000.00", "10,350.00", "10,350.00", ""],
  ];
  const r = readTallyRegister(rows, { side: "purchase" });
  it("keeps the booking date only when it differs from the invoice date", () => {
    expect(r.invoices.find((i) => i.no === "6")).toMatchObject({ date: "2025-07-15", bookedOn: "2025-12-01" });
    expect(r.invoices.find((i) => i.no === "RK/2318")!.bookedOn).toBeNull();
  });
  it("flags the late one and only that one", () => {
    const run = runValidations(r.invoices, { side: "purchase", period: "2025-12" });
    const v = run.failed.find((x) => x.id === "booked_late");
    expect(v?.count).toBe(1);
    expect(v?.examples.join(" ")).toMatch(/\b6\b/);
  });
  it("does not run the rule on a register that carries no booking dates", () => {
    const run = runValidations(r.invoices.map((i) => ({ ...i, bookedOn: undefined })), { side: "purchase", period: "2025-12" });
    expect(run.results.find((x) => x.id === "booked_late")?.skipped).toBe(true);
  });
});
