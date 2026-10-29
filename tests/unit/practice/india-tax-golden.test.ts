/**
 * Golden cases for Indian tax and payroll rules. Each row is what a CA would conclude by hand.
 * A failure means a check would pass something it should flag, or flag something that is fine.
 */
import { describe, expect, it } from "vitest";
import { checkGatewayGst, checkGst, checkPayroll, checkTds, statutoryDueDates, tdsSection, validGstin, gstinCheckChar } from "@/lib/practice/india";

const tds = (section: string, paid: number, deducted: number) => checkTds([{ party: "P", section, paid, tds: deducted }])[0]?.ok;

describe("TDS sections and rates", () => {
  it.each([
    ["194C individual 1%", "194C", 100000, 1000, true],
    ["194C company 2%", "194C", 100000, 2000, true],
    ["194C 10% is wrong", "194C", 100000, 10000, false],
    ["194J professional 10%", "194J", 50000, 5000, true],
    ["194J technical 2%", "194J", 50000, 1000, true],
    ["194J 5% is wrong", "194J", 50000, 2500, false],
    ["194I building 10%", "194I", 120000, 12000, true],
    ["194I machinery 2%", "194I", 120000, 2400, true],
    ["194H commission 2% (from Oct 2024)", "194H", 100000, 2000, true],
    ["194H commission 5% (earlier rate)", "194H", 100000, 5000, true],
    ["194A interest 10%", "194A", 40000, 4000, true],
    ["194Q goods purchase 0.1%", "194Q", 10000000, 10000, true],
    ["194O e-commerce 0.1%", "194O", 1000000, 1000, true],
    ["194O 1% earlier rate", "194O", 1000000, 10000, true],
    ["194G lottery agent 2%", "194G", 100000, 2000, true],
    ["194M contractor (individual payer) 2%", "194M", 100000, 2000, true],
    ["194R business benefit 10%", "194R", 50000, 5000, true],
    ["194S crypto 1%", "194S", 100000, 1000, true],
    ["194N cash withdrawal 2%", "194N", 1000000, 20000, true],
    ["194K mutual fund income 10%", "194K", 10000, 1000, true],
    ["194T partner remuneration 10%", "194T", 100000, 10000, true],
    ["no-PAN 20% is accepted", "194C", 100000, 20000, true],
    ["194IA property 1%", "194IA", 8000000, 80000, true],
    ["194IB rent by individual 2%", "194IB", 100000, 2000, true],
    ["194D insurance commission 10% (company)", "194D", 100000, 10000, true],
    ["194DA life insurance payout 5%", "194DA", 100000, 5000, true],
    ["194B lottery winnings 30%", "194B", 100000, 30000, true],
  ])("%s", (_n, section, paid, deducted, ok) => {
    expect(tds(section as string, paid as number, deducted as number)).toBe(ok);
  });

  it("reads section codes as people write them", () => {
    expect(tdsSection("Sec 194J(b)")).toBe("194J");
    expect(tdsSection("194 C")).toBe("194C");
    expect(tdsSection("u/s 194Q")).toBe("194Q");
    expect(tdsSection("194I(a)")).toBe("194I");
    expect(tdsSection("194LA")).toBe("194LA");
    expect(tdsSection("no section")).toBeNull();
  });

  it("never flags an unknown section as wrong: it cannot judge it", () => {
    expect(checkTds([{ party: "P", section: "195", paid: 100000, tds: 1 }])).toEqual([]);
  });
});

describe("GST rates, split and GSTIN", () => {
  const inv = (taxable: number, igst: number, cgst = 0, sgst = 0, gstin?: string) => checkGst([{ ref: "I", taxable, igst, cgst, sgst, gstin }]);
  const failing = (c: ReturnType<typeof checkGst>) => c.filter((x) => !x.ok).map((x) => x.label);

  it.each([
    ["5% intra", 10000, 0, 250, 250],
    ["12% intra (earlier slab)", 10000, 0, 600, 600],
    ["18% intra", 10000, 0, 900, 900],
    ["28% intra (earlier slab)", 10000, 0, 1400, 1400],
    ["40% inter (sin goods, from Sep 2025)", 10000, 4000, 0, 0],
    ["18% inter", 10000, 1800, 0, 0],
    ["0% nil rated", 10000, 0, 0, 0],
    ["3% gold", 100000, 3000, 0, 0],
    ["0.25% rough diamonds", 100000, 250, 0, 0],
  ])("accepts %s", (_n, taxable, igst, cgst, sgst) => {
    expect(failing(inv(taxable as number, igst as number, cgst as number, sgst as number))).toEqual([]);
  });

  it("flags a non-slab rate (13%, 17.5%)", () => {
    expect(failing(inv(10000, 1300))).toEqual(["GST rate"]);
    expect(failing(inv(10000, 0, 875, 875))).toEqual(["GST rate"]);
  });
  it("flags CGST that differs from SGST", () => {
    expect(failing(inv(10000, 0, 900, 800))).toContain("IGST vs CGST/SGST");
  });
  it("flags IGST together with CGST/SGST on one invoice", () => {
    expect(failing(inv(10000, 900, 450, 450))).toContain("IGST vs CGST/SGST");
  });
  it("accepts paise-level rounding", () => {
    expect(failing(inv(3333.33, 0, 300, 300))).toEqual([]);
  });

  it("validates GSTINs by check character and rejects lookalikes", () => {
    const base = "29AABCT1332L1Z";
    expect(validGstin(base + gstinCheckChar(base))).toBe(true);
    expect(validGstin("29AABCT1332L1Z0")).toBe(base + gstinCheckChar(base) === "29AABCT1332L1Z0");
    expect(validGstin("29aabct1332l1z" + gstinCheckChar(base).toLowerCase())).toBe(true); // case is not an error
    expect(validGstin("29AABCT1332L0ZX")).toBe(false); // entity number cannot be 0
    expect(validGstin("")).toBe(false);
    expect(validGstin("123")).toBe(false);
  });
});

describe("PF, ESI and gateway GST", () => {
  const pf = (basic: number, amount: number) => checkPayroll([{ name: "E", basic, gross: basic * 1.6, pf: amount }]).find((c) => c.label === "PF")?.ok;
  const esi = (gross: number, amount: number) => checkPayroll([{ name: "E", gross, esi: amount }]).find((c) => c.label === "ESI")?.ok;

  it("PF is 12% of basic, or of the ₹15,000 ceiling", () => {
    expect(pf(12000, 1440)).toBe(true);
    expect(pf(30000, 1800)).toBe(true); // ceiling: 12% of 15,000
    expect(pf(30000, 3600)).toBe(true); // on full basic
    expect(pf(30000, 2500)).toBe(false);
    expect(pf(12000, 1200)).toBe(false); // 10% is wrong
  });
  it("ESI is 0.75% employee / 3.25% employer up to ₹21,000 gross, none above", () => {
    expect(esi(20000, 150)).toBe(true);
    expect(esi(20000, 650)).toBe(true);
    expect(esi(20000, 800)).toBe(true);
    expect(esi(21000, 158)).toBe(true); // 157.5 rounds up
    expect(esi(25000, 188)).toBe(false); // above the limit, none is due
    expect(esi(20000, 400)).toBe(false);
  });
  it("gateway fee carries 18% GST", () => {
    expect(checkGatewayGst(2500, 450)[0]?.ok).toBe(true);
    expect(checkGatewayGst(2500, 300)[0]?.ok).toBe(false);
    expect(checkGatewayGst(0, 0)).toEqual([]);
  });
});

describe("statutory calendar", () => {
  it("TDS by the 7th, except March which is 30 April", () => {
    expect(statutoryDueDates("2025-08-31", ["TDS PAYMENT"])[0]?.due).toBe("2025-09-07");
    expect(statutoryDueDates("2026-03-31", ["TDS PAYMENT"])[0]?.due).toBe("2026-04-30");
  });
  it("PF/ESI by the 15th and GSTR-3B by the 20th, rolling over the year end", () => {
    const out = statutoryDueDates("2025-12-31", ["EPFO PF", "GST CPIN"]);
    expect(out).toEqual([
      { label: "PF and ESI for this month's wages", due: "2026-01-15" },
      { label: "GSTR-3B and GST payment for this month", due: "2026-01-20" },
    ]);
  });
  it("lists nothing when no statutory payment was seen", () => {
    expect(statutoryDueDates("2025-08-31", ["RENT", "SALARY"])).toEqual([]);
  });
});
