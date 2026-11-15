import { describe, expect, it } from "vitest";
import type { GstInvoice } from "@/lib/practice/gst/invoices";
import { reconcileGstr2b, vendorMessage } from "@/lib/practice/gst/reconcile";

const inv = (o: Partial<GstInvoice>): GstInvoice => ({ gstin: "29ABCDE1234F1Z5", party: "Alpha", no: "A-1", date: "2026-09-05", pos: "27", taxable: 1000, igst: 180, cgst: 0, sgst: 0, cess: 0, total: null, rate: null, hsn: "", irn: "", reverseCharge: false, itc: null, docType: "invoice", filedIn: null, row: 1, lines: 1, repeats: 0, ...o });

describe("GSTR-2B reconciliation", () => {
  it("matches the same invoice and counts its tax", () => {
    const r = reconcileGstr2b([inv({})], [inv({ itc: "Y" })]);
    expect(r.matched).toHaveLength(1);
    expect(r.totals.matchedTax).toBe(180);
    expect(r.missingInBooks).toHaveLength(0);
  });

  it("matches numbers written differently", () => {
    const r = reconcileGstr2b([inv({ no: "INV/0042" })], [inv({ no: "inv42" })]);
    expect(r.matched[0]!.how).toBe("loose");
  });

  it("matches a mistyped number by supplier, amounts and date", () => {
    const r = reconcileGstr2b([inv({ no: "A-1" })], [inv({ no: "A-7", date: "2026-09-08" })]);
    expect(r.matched[0]!.how).toBe("amount");
  });

  it("reports an amount difference instead of accepting it", () => {
    const r = reconcileGstr2b([inv({ taxable: 1000, igst: 180 })], [inv({ taxable: 900, igst: 162 })]);
    expect(r.matched).toHaveLength(0);
    expect(r.mismatched).toHaveLength(1);
    expect(r.mismatched[0]!.diffs.map((d) => d.field)).toEqual(["taxable", "igst"]);
    expect(r.totals.mismatchTaxDiff).toBe(18);
  });

  it("finds invoices on only one side and builds the vendor follow-up with ITC at risk", () => {
    const r = reconcileGstr2b(
      [inv({ no: "B-1" }), inv({ no: "B-2", taxable: 500, igst: 90 }), inv({ gstin: "", no: "C-1" })],
      [inv({ no: "B-1" }), inv({ gstin: "27PQRST5678K1Z6", party: "Beta", no: "P-9", taxable: 200, igst: 36 })],
    );
    expect(r.missingInPortal.map((i) => i.no)).toEqual(["B-2", "C-1"]);
    expect(r.missingInBooks.map((i) => i.no)).toEqual(["P-9"]);
    expect(r.vendors).toHaveLength(1);
    expect(r.vendors[0]!.itcAtRisk).toBe(90);
    expect(r.totals.unbookedItc).toBe(36);
  });

  it("uses each invoice once", () => {
    const r = reconcileGstr2b([inv({ no: "A-1" }), inv({ no: "A-1", row: 2 })], [inv({ no: "A-1" })]);
    expect(r.matched).toHaveLength(1);
    expect(r.missingInPortal).toHaveLength(1);
  });

  it("separates credit notes from invoices", () => {
    const r = reconcileGstr2b([inv({ no: "A-1", docType: "credit_note", taxable: -1000, igst: -180 })], [inv({ no: "A-1" })]);
    expect(r.matched).toHaveLength(0);
  });

  it("lists ITC the portal marks not available", () => {
    expect(reconcileGstr2b([], [inv({ itc: "N" })]).itcBlocked).toHaveLength(1);
  });

  it("writes a vendor message with the numbers", () => {
    const r = reconcileGstr2b([inv({ no: "B-2", taxable: 500, igst: 90 })], []);
    const m = vendorMessage(r.vendors[0]!, "2026-09", "Sharma & Co");
    expect(m).toContain("B-2");
    expect(m).toContain("₹90");
    expect(m).toContain("Sharma & Co");
  });
});
