import { describe, expect, it } from "vitest";
import { checkReturns, readGstr1Json, readGstr3bJson, taxOf } from "@/lib/practice/gst/returns";
import { readGstr2bJson, type GstInvoice, type ReadInvoices } from "@/lib/practice/gst/invoices";

const inv = (no: string, gstin: string, taxable: number, tax = 0.18, extra: Partial<GstInvoice> = {}): GstInvoice => ({
  gstin, party: "P", no, date: "2026-09-10", pos: "37", taxable, igst: 0, cgst: taxable * tax / 2, sgst: taxable * tax / 2, cess: 0, total: null, rate: 18, hsn: "", irn: "",
  reverseCharge: false, itc: null, docType: "invoice", filedIn: null, row: 1, lines: 1, repeats: 0, ...extra,
});
const read = (invoices: GstInvoice[]): ReadInvoices => ({ invoices, period: "2026-09", ownGstin: null, notes: [] });
const G1 = {
  gstin: "37AAAAA0000A1Z5", fp: "092026",
  b2b: [{ ctin: "37BBBBB1111B1Z5", inv: [{ inum: "S-1", idt: "05-09-2026", val: 11800, pos: "37", itms: [{ num: 1, itm_det: { rt: 18, txval: 10000, camt: 900, samt: 900 } }] }] }],
  b2cs: [{ sply_ty: "INTRA", rt: 18, typ: "OE", pos: "37", txval: 5000, camt: 450, samt: 450 }],
};
const G3B = {
  gstin: "37AAAAA0000A1Z5", ret_period: "092026",
  sup_details: { osup_det: { txval: 15000, iamt: 0, camt: 1350, samt: 1350, csamt: 0 }, isup_rev: { txval: 1000, iamt: 0, camt: 90, samt: 90, csamt: 0 } },
  itc_elg: { itc_avl: [{ ty: "OTH", iamt: 0, camt: 1000, samt: 1000, csamt: 0 }, { ty: "ISRC", iamt: 0, camt: 90, samt: 90, csamt: 0 }], itc_rev: [], itc_net: { iamt: 0, camt: 1090, samt: 1090, csamt: 0 } },
};

describe("GSTR-1 and GSTR-3B readers", () => {
  it("reads invoices to registered buyers and B2C totals", () => {
    const g = readGstr1Json(G1);
    expect(g.period).toBe("2026-09");
    expect(g.invoices).toHaveLength(1);
    expect(g.invoices[0]).toMatchObject({ gstin: "37BBBBB1111B1Z5", no: "S-1", taxable: 10000, cgst: 900 });
    expect(g.b2c.taxable).toBe(5000);
  });
  it("reads the outward, reverse charge and ITC tables", () => {
    const b = readGstr3bJson(G3B);
    expect(taxOf(b.outward)).toBe(2700);
    expect(taxOf(b.rcm)).toBe(180);
    expect(taxOf(b.itcOnRcm)).toBe(180);
    expect(taxOf(b.itcNet)).toBe(2180);
    expect(b.period).toBe("2026-09");
  });
  it("says so when a file is the wrong kind", () => {
    expect(readGstr1Json({ foo: 1 }).notes[0]).toMatch(/does not look like a GSTR-1/);
    expect(readGstr3bJson({ foo: 1 }).notes[0]).toMatch(/does not look like a GSTR-3B/);
  });
});

describe("return checks", () => {
  const sales = read([inv("S-1", "37BBBBB1111B1Z5", 10000), inv("S-2", "", 5000)]);
  it("agrees when books, GSTR-1 and GSTR-3B tell the same story", () => {
    const c = checkReturns({ salesBooks: sales, gstr1: readGstr1Json(G1), gstr3b: readGstr3bJson(G3B) });
    expect(c.find((x) => x.id === "sales")).toMatchObject({ status: "agree" });
    expect(c.find((x) => x.id === "outward")).toMatchObject({ status: "agree" });
  });
  it("catches a sale missing from GSTR-1 and tax that differs", () => {
    const more = read([...sales.invoices, inv("S-3", "37CCCCC2222C1Z5", 20000)]);
    const s = checkReturns({ salesBooks: more, gstr1: readGstr1Json(G1) }).find((x) => x.id === "sales")!;
    expect(s.status).toBe("differs");
    expect(s.invoiceRecon?.missingInPortal.map((i) => i.no)).toEqual(["S-3"]);
    expect(s.lines.find((l) => l.label === "Tax")!.diff).toBeCloseTo(3600, 2);
  });
  it("catches outward tax in GSTR-3B that differs from GSTR-1", () => {
    const low = { ...G3B, sup_details: { ...G3B.sup_details, osup_det: { txval: 15000, camt: 1000, samt: 1000 } } };
    const o = checkReturns({ gstr1: readGstr1Json(G1), gstr3b: readGstr3bJson(low) }).find((x) => x.id === "outward")!;
    expect(o.status).toBe("differs");
    expect(o.lines[1]!.diff).toBe(700);
  });
  it("flags ITC claimed above what GSTR-2B makes available", () => {
    const b2b = { data: { rtnprd: "092026", docdata: { b2b: [{ ctin: "37DDDDD3333D1Z5", inv: [{ inum: "P-1", dt: "03-09-2026", val: 1, itcavl: "Y", itms: [{ itm_det: { txval: 10000, camt: 900, samt: 900 } }] }] }] } } };
    const c = checkReturns({ gstr2b: readGstr2bJson(b2b), gstr3b: readGstr3bJson(G3B) }).find((x) => x.id === "itc")!;
    // 2B offers 1,800; 3B claims 2,180 net of 180 on RCM = 2,000: 200 too much.
    expect(c.status).toBe("differs");
    expect(c.lines[0]!.diff).toBe(-200);
    expect(c.summary).toMatch(/more ITC than GSTR-2B/);
  });
  it("compares reverse charge in the books with GSTR-3B 3.1(d) and the credit taken", () => {
    const purchases = read([inv("R-1", "37EEEEE4444E1Z5", 1000, 0.18, { reverseCharge: true })]);
    const c = checkReturns({ purchaseBooks: purchases, gstr3b: readGstr3bJson(G3B) }).find((x) => x.id === "rcm")!;
    expect(c.status).toBe("agree");
    const none = checkReturns({ purchaseBooks: read([inv("R-1", "37E", 1000)]), gstr3b: readGstr3bJson(G3B) }).find((x) => x.id === "rcm")!;
    expect(none.status).toBe("differs");
    expect(none.summary).toMatch(/no purchase marked reverse charge/);
  });
  it("names the missing file instead of showing a partial answer", () => {
    const c = checkReturns({});
    expect(c.every((x) => x.status === "needs")).toBe(true);
    expect(c[0]!.summary).toMatch(/sales register and the GSTR-1/);
  });
});

describe("sales from a Day Book with no GSTIN", () => {
  it("matches GSTR-1 invoices on their number", () => {
    const books = { ...read([inv("S-1", "", 10000), inv("S-2", "", 5000), inv("S-9", "", 7000)]), notes: [] };
    const s = checkReturns({ salesBooks: books, gstr1: readGstr1Json(G1) }).find((x) => x.id === "sales")!;
    expect(s.invoiceRecon!.matched.map((p) => p.books.no)).toEqual(["S-1"]);
    expect(s.invoiceRecon!.missingInPortal.map((i) => i.no).sort()).toEqual(["S-2", "S-9"]);
    expect(s.summary).toMatch(/B2C/);
  });
});
