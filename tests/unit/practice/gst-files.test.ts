// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readGstFile, toCsv } from "@/lib/practice/gst/files";

describe("gst file reader", () => {
  it("reads a CSV purchase register", async () => {
    const csv = "GSTIN of Supplier,Trade Name,Invoice Number,Invoice Date,Taxable Value,Integrated Tax\n29ABCDE1234F1Z5,Alpha,A-1,05-09-2026,1000,180\n";
    const r = await readGstFile(new File([csv], "purchases.csv", { type: "text/csv" }));
    expect(r.invoices).toHaveLength(1);
    expect(r.invoices[0]).toMatchObject({ no: "A-1", taxable: 1000, igst: 180 });
  });
  it("reads a GSTR-2B JSON and refuses a broken one in plain words", async () => {
    const good = JSON.stringify({ data: { gstin: "27PQRST5678K1Z6", rtnprd: "092026", docdata: { b2b: [{ ctin: "29ABCDE1234F1Z5", trdnm: "Alpha", inv: [{ inum: "A-1", dt: "05-09-2026", val: 1180, itms: [{ itm_det: { txval: 1000, iamt: 180 } }] }] }] } } });
    expect((await readGstFile(new File([good], "r.json"))).invoices).toHaveLength(1);
    expect((await readGstFile(new File(["{oops"], "r.json"))).notes[0]).toMatch(/not valid JSON/);
  });
  it("says so when a file has no invoice table", async () => {
    const r = await readGstFile(new File(["a,b\n1,2\n"], "x.csv"));
    expect(r.invoices).toHaveLength(0);
    expect(r.notes[0]).toMatch(/No invoice table/);
  });
  it("neutralises formula characters in the exported list", () => {
    expect(toCsv(["a"], [["=SUM(A1)"], ["plain, text"]])).toBe('a\r\n\'=SUM(A1)\r\n"plain, text"');
  });
});
