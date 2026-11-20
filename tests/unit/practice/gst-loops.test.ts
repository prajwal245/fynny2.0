import { describe, expect, it } from "vitest";
import { readDayBookVouchers } from "@/lib/practice/review/dayBook";
import { rcmLoop, setOffCheck } from "@/lib/practice/review/setoff";
import { readGstr3bPayment } from "@/lib/practice/gst/reports";
import type { Gstr3bPayment } from "@/lib/practice/gst/reports";
import type { Gstr3bRead } from "@/lib/practice/gst/returns";

const HEAD = ["Date", "Particulars", "", "", "Vch Type", "Vch No.", "Debit", "Credit"];
const rows = (...r: string[][]) => [["Day Book"], HEAD, ["", "", "", "", "", "", "Amount", "Amount"], ...r];
const z = { taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 };
const pay = (o: Partial<Gstr3bPayment> = {}): Gstr3bPayment => ({ month: "2025-12", payable: z, paidItc: z, paidCash: z, rcmPayable: z, rcmPaidCash: z, found: true, ...o });

// The worked example in the blueprint: journal 1286 of 31 Dec 2025.
const J1286 = rows(
  ["31-Dec-25", "Output CGST", "", "", "Journal", "1286", "1,853,064.00", ""], ["", "Output SGST", "", "", "", "", "1,853,064.00", ""],
  ["", "Input IGST", "", "", "", "", "", "478,808.00"], ["", "Input IGST", "", "", "", "", "", "478,807.00"],
  ["", "Input CGST", "", "", "", "", "", "1,374,256.00"], ["", "Input SGST", "", "", "", "", "", "1,374,256.00"], ["", "GST (CGST+SGST+IGST)", "", "", "", "", "", "1.00"],
);
const dec6_1 = pay({ payable: { ...z, cgst: 1853064, sgst: 1853064 }, paidItc: { ...z, cgst: 1853064, sgst: 1853063 }, paidCash: { ...z, sgst: 1 } });

describe("set-off entry against table 6.1", () => {
  it("agrees on the blueprint's worked example (payable, credit used, cash)", () => {
    const r = setOffCheck(readDayBookVouchers(J1286), dec6_1, "2025-12");
    expect(r.status).toBe("agree");
    expect(r.entries).toEqual(["Journal 1286"]);
  });
  it("catches a liability left out of the entry (IGST payable in 6.1 but not set off)", () => {
    const r = setOffCheck(readDayBookVouchers(J1286), pay({ ...dec6_1, payable: { ...dec6_1.payable, igst: 16341 } }), "2025-12");
    expect(r.status).toBe("differs");
    expect(r.summary).toMatch(/Tax payable, IGST/);
  });
  it("says so when there is no set-off entry for the month, and does not mistake a credit note for one", () => {
    const cn = rows(["10-Dec-25", "Output CGST", "", "", "Credit Note", "C1", "3,487.50", ""], ["", "Customer", "", "", "", "", "", "3,487.50"]);
    expect(setOffCheck(readDayBookVouchers(cn), dec6_1, "2025-12").status).toBe("no_entry");
  });
  it("flags CGST credit used above the CGST liability", () => {
    const j = rows(["31-Dec-25", "Output CGST", "", "", "Journal", "9", "1,000.00", ""], ["", "Input CGST", "", "", "", "", "", "1,500.00"], ["", "Input IGST", "", "", "", "", "", "0.00"]);
    const r = setOffCheck(readDayBookVouchers(j), pay({ payable: { ...z, cgst: 1000 }, paidItc: { ...z, cgst: 1500 } }), "2025-12");
    expect(r.lines.some((l) => /CGST credit used above/.test(l.label))).toBe(true);
  });
  it("reports a month whose 6.1 is not in the file", () => {
    expect(setOffCheck([], pay({ found: false }), "2025-12").status).toBe("no_return");
  });
});

describe("reverse charge loop", () => {
  const g3b = (rcm: number[], itc: number[]): Gstr3bRead => ({ period: null, ownGstin: null, outward: z, rcm: { ...z, igst: rcm[0]!, cgst: rcm[1]!, sgst: rcm[2]! }, itcAvailable: z, itcOnRcm: { ...z, igst: itc[0]!, cgst: itc[1]!, sgst: itc[2]! }, itcReversed: z, itcNet: z, notes: [] });
  // Journal 1278 (liability and credit) and 1279 (payment), as in Satkaarika December.
  const rcmBooks = rows(
    ["31-Dec-25", "RCM CGST INPUT", "", "", "Journal", "1278", "1,634.00", ""], ["", "RCM SGST INPUT", "", "", "", "", "1,634.00", ""], ["", "RCM INPUT IGST", "", "", "", "", "6,300.00", ""],
    ["", "RCM SGST PAYABLE", "", "", "", "", "", "1,634.00"], ["", "RCM CGST PAYABLE", "", "", "", "", "", "1,634.00"], ["", "RCM IGST PAYABLE", "", "", "", "", "", "6,300.00"],
    ["31-Dec-25", "RCM CGST PAYABLE", "", "", "Journal", "1279", "1,634.00", ""], ["", "RCM SGST PAYABLE", "", "", "", "", "1,634.00", ""], ["", "RCM IGST PAYABLE", "", "", "", "", "6,300.00", ""], ["", "GST (CGST+SGST+IGST)", "", "", "", "", "", "9,568.00"],
  );
  const p = pay({ rcmPayable: { ...z, igst: 6300, cgst: 1634, sgst: 1634 }, rcmPaidCash: { ...z, igst: 6300, cgst: 1634, sgst: 1634 } });
  it("agrees when liability, cash, credit and the return all say the same (rounding of 50 paise is allowed)", () => {
    const r = rcmLoop(readDayBookVouchers(rcmBooks), p, g3b([6300, 1633.5, 1633.5], [6300, 1633.5, 1633.5]), "2025-12");
    expect(r.status).toBe("agree");
  });
  it("catches a month where the return declares less than the books booked", () => {
    const r = rcmLoop(readDayBookVouchers(rcmBooks), p, g3b([6300, 0, 0], [6300, 0, 0]), "2025-12");
    expect(r.status).toBe("differs");
    expect(r.summary).toMatch(/3\.1\(d\)/);
  });
  it("reports nothing to check when there is no reverse charge anywhere", () => {
    expect(rcmLoop([], pay(), g3b([0, 0, 0], [0, 0, 0]), "2025-12").status).toBe("none");
  });
});

describe("table 6.1 from the annual report", () => {
  it("reads payable, credit and cash by head for the chosen month", () => {
    const blank = new Array(70).fill("");
    const row = (a: string, b: string, at: Record<number, number>) => { const r = [...blank]; r[0] = a; r[1] = b; for (const [k, v] of Object.entries(at)) r[Number(k)] = String(v); return r; };
    const dec = 7 + 5 * 8;
    const rows6 = [row("", "", { 7: 0 }).map((x, i) => (i === 7 ? "April" : x)), row("PAYMENT OF TAX (Other Than RCM)", "", {}), row("S.No.", "DETAILS", {}), row("1)", "TAX PAYABLE", { [dec + 1]: 100, [dec + 2]: 100 }), row("2)", "PAID THROUGH ITC", { [dec + 1]: 90, [dec + 2]: 90 }), row("3)", "PAID THROUGH CASH", { [dec + 1]: 10, [dec + 2]: 10 }), row("PAYMENT OF TAX (RCM Liability)", "", {}), row("1)", "TAX PAYABLE", { [dec]: 5 }), row("2)", "PAID THROUGH CASH", { [dec]: 5 })];
    const r = readGstr3bPayment(rows6, "2025-12");
    expect(r.found).toBe(true);
    expect(r.payable).toMatchObject({ cgst: 100, sgst: 100 });
    expect(r.paidItc.cgst).toBe(90);
    expect(r.paidCash.sgst).toBe(10);
    expect(r.rcmPayable.igst).toBe(5);
  });
});
