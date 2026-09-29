import { describe, expect, it } from "vitest";
import {
  computeGstSummary,
  gstRateForCategory,
  inputGstForExpense,
  itcMatchStatus,
  itcTolerance,
  splitGst,
  taxFromInclusive,
} from "@/lib/gstCompute";

describe("gstRateForCategory", () => {
  it("treats payroll-type categories as outside GST", () => {
    expect(gstRateForCategory("Salary")).toBe(0);
    expect(gstRateForCategory("Payroll", "Bonus")).toBe(0);
    expect(gstRateForCategory("Statutory", "PF contribution")).toBe(0);
  });

  it("treats rent, interest and taxes paid as non-creditable", () => {
    expect(gstRateForCategory("Office rent")).toBe(0);
    expect(gstRateForCategory("Finance", "Bank charges")).toBe(0);
    expect(gstRateForCategory("Taxes", "TDS")).toBe(0);
  });

  it("uses concessional rates for transport, travel and food", () => {
    expect(gstRateForCategory("Logistics")).toBe(0.05);
    expect(gstRateForCategory("Travel", "Hotel stay")).toBe(0.05);
    expect(gstRateForCategory("Team", "Restaurant")).toBe(0.05);
  });

  it("defaults to the standard rate for services and unknown categories", () => {
    expect(gstRateForCategory("Software subscription")).toBe(0.18);
    expect(gstRateForCategory("Professional fees")).toBe(0.18);
    expect(gstRateForCategory("Miscellaneous")).toBe(0.18);
    expect(gstRateForCategory(null, null)).toBe(0.18);
  });
});

describe("taxFromInclusive", () => {
  it("extracts embedded tax from a gross amount", () => {
    expect(taxFromInclusive(1180, 0.18)).toBe(180);
    expect(taxFromInclusive(1050, 0.05)).toBe(50);
  });

  it("returns zero for a zero rate or non-positive amount", () => {
    expect(taxFromInclusive(1180, 0)).toBe(0);
    expect(taxFromInclusive(0, 0.18)).toBe(0);
    expect(taxFromInclusive(-500, 0.18)).toBe(0);
  });

  it("rounds to paise", () => {
    expect(taxFromInclusive(1000, 0.18)).toBe(152.54);
  });
});

describe("inputGstForExpense", () => {
  it("prefers an explicit tax amount over the estimate", () => {
    expect(inputGstForExpense({ amount: 1180, tax_amount: 200, category: "Software" })).toBe(200);
    expect(inputGstForExpense({ amount: 1180, gst_amount: 90, category: "Software" })).toBe(90);
  });

  it("uses an explicit rate when present", () => {
    expect(inputGstForExpense({ amount: 1120, gst_rate: 0.12 })).toBe(120);
  });

  it("falls back to the category rate", () => {
    expect(inputGstForExpense({ amount: 1180, category: "Consulting" })).toBe(180);
    expect(inputGstForExpense({ amount: 50000, category: "Salary" })).toBe(0);
  });
});

describe("splitGst", () => {
  it("splits intra-state tax into equal CGST and SGST", () => {
    expect(splitGst(180, "29ABCDE1234F1Z5", "29XYZAB5678G1Z2")).toEqual({ cgst: 90, sgst: 90, igst: 0 });
  });

  it("puts inter-state tax entirely in IGST", () => {
    expect(splitGst(180, "29ABCDE1234F1Z5", "27XYZAB5678G1Z2")).toEqual({ cgst: 0, sgst: 0, igst: 180 });
  });

  it("defaults to intra-state when a GSTIN is missing", () => {
    expect(splitGst(100, null, "27XYZAB5678G1Z2")).toEqual({ cgst: 50, sgst: 50, igst: 0 });
  });

  it("keeps halves adding back to the total on odd paise", () => {
    const s = splitGst(0.05, "29A", "29B");
    expect(s.cgst + s.sgst).toBeCloseTo(0.05, 2);
  });

  it("returns zeroes for a non-positive tax", () => {
    expect(splitGst(0, "29A", "27B")).toEqual({ cgst: 0, sgst: 0, igst: 0 });
  });
});

describe("computeGstSummary", () => {
  it("nets output against estimated input credit", () => {
    const summary = computeGstSummary(
      [{ tax_amount: 1800 }, { tax_amount: 900 }],
      [{ amount: 1180, category: "Software" }, { amount: 100000, category: "Payroll" }],
    );
    expect(summary.outputGst).toBe(2700);
    expect(summary.inputGst).toBe(180);
    expect(summary.netPayable).toBe(2520);
    expect(summary.netRefund).toBe(0);
  });

  it("reports a refund position when credit exceeds output", () => {
    const summary = computeGstSummary([{ tax_amount: 100 }], [{ amount: 11800, category: "Software" }]);
    expect(summary.netPayable).toBe(0);
    expect(summary.netRefund).toBe(1700);
  });

  it("handles empty inputs", () => {
    expect(computeGstSummary([], [])).toEqual({ outputGst: 0, inputGst: 0, netPayable: 0, netRefund: 0 });
  });
});

describe("ITC matching", () => {
  it("uses 1% of the larger value with a Rs 1 floor", () => {
    expect(itcTolerance(10000, 10050)).toBeCloseTo(100.5, 2);
    expect(itcTolerance(10, 10)).toBe(1);
  });

  it("matches inside tolerance and flags outside it", () => {
    expect(itcMatchStatus(10000, 10050)).toBe("matched");
    expect(itcMatchStatus(10000, 10500)).toBe("mismatched");
    expect(itcMatchStatus(10000, 10000)).toBe("matched");
  });

  it("treats exactly-at-tolerance as a match", () => {
    expect(itcMatchStatus(10000, 10100)).toBe("matched");
  });

  it("labels one-sided invoices", () => {
    expect(itcMatchStatus(null, 500)).toBe("missing_in_books");
    expect(itcMatchStatus(500, null)).toBe("missing_in_2b");
  });
});
