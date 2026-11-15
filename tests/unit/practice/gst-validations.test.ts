import { describe, expect, it } from "vitest";
import { gstinCheckChar, validGstin } from "@/lib/practice/india";
import { isoDate, money, normInvoiceNo, looseInvoiceNo, readGstr2bJson, readInvoiceRows } from "@/lib/practice/gst/invoices";
import { runValidations, VALIDATION_COUNT } from "@/lib/practice/gst/validations";

const gstin = (state: string, pan: string) => {
  const first14 = `${state}${pan}1Z`;
  return first14 + gstinCheckChar(first14);
};
const SELLER = gstin("29", "ABCDE1234F");
const BUYER = gstin("27", "PQRST5678K");

const HEAD = ["GSTIN of Supplier", "Trade Name", "Invoice Number", "Invoice Date", "Place of Supply", "Taxable Value", "Integrated Tax", "Central Tax", "State/UT Tax", "Invoice Value"];

function read(rows: (string | number)[][]) {
  return readInvoiceRows([HEAD, ...rows].map((r) => r.map(String)));
}
const find = (run: ReturnType<typeof runValidations>, id: string) => run.results.find((r) => r.id === id)!;

describe("invoice readers", () => {
  it("reads money, dates and numbers the way Indian files write them", () => {
    expect(money("₹1,23,456.50")).toBe(123456.5);
    expect(money("(500.00)")).toBe(-500);
    expect(money("abc")).toBeNull();
    expect(isoDate("05-09-2026")).toBe("2026-09-05");
    expect(isoDate("05-Sep-2026")).toBe("2026-09-05");
    expect(isoDate("31-02-2026")).toBeNull();
    expect(isoDate(46266)).toBe("2026-09-01");
    expect(normInvoiceNo("inv/0042-25")).toBe("INV004225");
    expect(looseInvoiceNo("INV0042")).toBe(looseInvoiceNo("INV42"));
  });

  it("adds up the rows of one invoice (one per tax rate)", () => {
    const r = read([
      [SELLER, "Alpha", "A-1", "05-09-2026", "29", 1000, 0, 90, 90, 1180],
      [SELLER, "Alpha", "A-1", "05-09-2026", "29", 1000, 0, 90, 90, 1180],
    ]);
    expect(r.invoices).toHaveLength(1);
    expect(r.invoices[0]!.taxable).toBe(2000);
    expect(r.invoices[0]!.lines).toBe(2);
  });

  it("says so when there is no invoice table", () => {
    expect(readInvoiceRows([["hello"], ["world"]]).notes[0]).toMatch(/No invoice table/);
  });

  it("reads a GSTR-2B JSON from the portal", () => {
    const r = readGstr2bJson({
      data: { gstin: BUYER, rtnprd: "092026", docdata: { b2b: [{ ctin: SELLER, trdnm: "Alpha", inv: [{ inum: "A-1", dt: "05-09-2026", val: 1180, pos: "27", itcavl: "Y", itms: [{ itm_det: { txval: 1000, iamt: 180, camt: 0, samt: 0, csamt: 0, rt: 18 } }] }] }] } },
    });
    expect(r.period).toBe("2026-09");
    expect(r.ownGstin).toBe(BUYER);
    expect(r.invoices[0]).toMatchObject({ gstin: SELLER, no: "A-1", taxable: 1000, igst: 180, itc: "Y" });
    expect(readGstr2bJson("not json").notes[0]).toMatch(/not valid JSON/);
  });
});

describe("gst validations", () => {
  const today = new Date("2026-10-15");
  const ctx = { side: "purchase" as const, period: "2026-09", ownGstin: BUYER, today };

  it("has the full pack", () => {
    expect(VALIDATION_COUNT).toBeGreaterThanOrEqual(30);
  });

  it("passes a clean purchase register", () => {
    const run = runValidations(read([[SELLER, "Alpha", "A-1", "05-09-2026", "27", 1000, 180, 0, 0, 1180]]).invoices, ctx);
    expect(run.summary.errors).toBe(0);
    expect(run.failed.filter((f) => f.severity !== "info")).toEqual([]);
  });

  it("catches a bad GSTIN check character", () => {
    expect(validGstin(SELLER)).toBe(true);
    const bad = SELLER.slice(0, 14) + (SELLER[14] === "A" ? "B" : "A");
    const run = runValidations(read([[bad, "Alpha", "A-1", "05-09-2026", "27", 1000, 180, 0, 0, 1180]]).invoices, ctx);
    expect(find(run, "gstin_check").count).toBe(1);
  });

  it("catches duplicate invoice numbers, mixed IGST and CGST, and unequal CGST/SGST", () => {
    const run = runValidations(
      read([
        [SELLER, "Alpha", "A-1", "05-09-2026", "27", 1000, 180, 0, 0, 1180],
        [SELLER, "Alpha", "A-1", "05-09-2026", "27", 1000, 180, 0, 0, 1180],
        [SELLER, "Alpha", "A-2", "07-09-2026", "27", 1000, 90, 90, 0, 1180],
        [SELLER, "Alpha", "A-3", "07-09-2026", "27", 1000, 0, 100, 80, 1180],
      ]).invoices,
      ctx,
    );
    expect(find(run, "repeated_rows").count).toBe(1);
    expect(find(run, "igst_cgst_mixed").count).toBe(1);
    expect(find(run, "cgst_sgst_equal").count).toBeGreaterThanOrEqual(1);
  });

  it("flags future and pre-GST dates, and over-long invoice numbers", () => {
    const run = runValidations(
      read([
        [SELLER, "Alpha", "A-1", "05-12-2026", "27", 1000, 180, 0, 0, 1180],
        [SELLER, "Alpha", "A-2", "05-01-2016", "27", 1000, 180, 0, 0, 1180],
        [SELLER, "Alpha", "THIS-NUMBER-IS-FAR-TOO-LONG-1", "05-09-2026", "27", 1000, 180, 0, 0, 1180],
      ]).invoices,
      { ...ctx, side: "sales" },
    );
    expect(find(run, "date_future").count).toBe(1);
    expect(find(run, "date_pre_gst").count).toBe(1);
    expect(find(run, "no_length").count).toBe(1);
  });

  it("skips (not fails) checks the file cannot support, and says how many", () => {
    const run = runValidations(read([[SELLER, "Alpha", "A-1", "05-09-2026", "27", 1000, 180, 0, 0, 1180]]).invoices, { side: "purchase", today });
    expect(run.skipped).toBeGreaterThan(0);
    expect(find(run, "own_gstin").skipped).toBe(true);
  });

  it("gives every result a plain-language detail", () => {
    const run = runValidations(read([[SELLER, "Alpha", "", "05-12-2026", "27", 1000, 90, 90, 0, 9999]]).invoices, ctx);
    expect(run.failed.length).toBeGreaterThan(0);
    for (const r of run.failed) expect(r.detail.length).toBeGreaterThan(20);
  });
});
