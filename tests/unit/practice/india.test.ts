import { describe, expect, it } from "vitest";
import { checkGatewayGst, checkGst, checkPayroll, checkTds, gstinCheckChar, statutoryDueDates, tdsSection, validGstin } from "@/lib/practice/india";
import { parseDelimited } from "@/lib/practice/extract/table";
import { summariseRegister } from "@/lib/practice/extract/registers";

describe("Indian rules verified in code", () => {
  it("GSTIN check character", () => {
    const base = "27AAPFU0939F1Z";
    const g = base + gstinCheckChar(base);
    expect(validGstin(g)).toBe(true);
    const wrong = base + (g[14] === "A" ? "B" : "A");
    expect(validGstin(wrong)).toBe(false);
    expect(validGstin("27AAPFU0939F1ZV")).toBe(true); // a published sample GSTIN
  });

  it("TDS section rates", () => {
    expect(tdsSection("194I(b)")).toBe("194I");
    expect(tdsSection("194IA")).toBe("194IA");
    const ok = checkTds([
      { party: "Prime Estates", section: "194I", paid: 85000, tds: 8500 },
      { party: "Swift Logistics", section: "194C", paid: 20000, tds: 400 },
      { party: "Rao & Co", section: "194J", paid: 96000, tds: 9600 },
    ]);
    expect(ok[0].ok).toBe(true);
    const bad = checkTds([{ party: "Rao & Co", section: "194J", paid: 96000, tds: 960 }]);
    expect(bad[0].ok).toBe(false);
    expect(bad[0].detail).toContain("Rao & Co");
  });

  it("GST: rate, IGST vs CGST/SGST and GSTIN", () => {
    const good = checkGst([
      { ref: "S-1", gstin: "27AAPFU0939F1ZV", taxable: 10000, igst: 0, cgst: 900, sgst: 900 },
      { ref: "S-2", taxable: 20000, igst: 3600, cgst: 0, sgst: 0 },
      { ref: "S-3", taxable: 1000, igst: 50, cgst: 0, sgst: 0 },
    ]);
    expect(good.every((c) => c.ok)).toBe(true);
    const bad = checkGst([
      { ref: "S-9", gstin: "27AAPFU0939F1ZX", taxable: 10000, igst: 900, cgst: 900, sgst: 700 },
      { ref: "S-10", taxable: 10000, igst: 1300, cgst: 0, sgst: 0 },
    ]);
    expect(bad.filter((c) => !c.ok).map((c) => c.label).sort()).toEqual(["GST rate", "GSTIN", "IGST vs CGST/SGST"]);
  });

  it("PF, ESI and GST on gateway fees", () => {
    expect(checkPayroll([{ name: "A", basic: 12000, gross: 20000, pf: 1440, esi: 150 }]).every((c) => c.ok)).toBe(true);
    expect(checkPayroll([{ name: "B", basic: 30000, gross: 52000, pf: 1800, esi: 390 }]).find((c) => c.label === "ESI")?.ok).toBe(false);
    expect(checkGatewayGst(1000, 180)[0].ok).toBe(true);
    expect(checkGatewayGst(1000, 120)[0].ok).toBe(false);
  });

  it("statutory due dates", () => {
    expect(statutoryDueDates("2026-07-31", ["TDS 194C deposit", "EPF challan"])).toEqual([
      { label: "TDS deducted this month to be deposited", due: "2026-08-07" },
      { label: "PF and ESI for this month's wages", due: "2026-08-15" },
    ]);
    expect(statutoryDueDates("2027-03-31", ["TDS"])[0].due).toBe("2027-04-30");
  });

  it("a TDS register carries its checks", () => {
    const s = summariseRegister(
      "tds_register",
      parseDelimited(`Deductee,PAN,Section,Amount Paid,TDS Rate %,TDS Deducted
Prime Estates,AAAPE1234F,194I,85000,10,8500
Swift Logistics,AABCS5678K,194C,20000,2,400`),
    );
    expect(s.checks?.[0]).toMatchObject({ label: "TDS rates", ok: true });
  });
});

describe("GSTIN on the client forms", () => {
  it("explains a mistyped last character", async () => {
    const { gstinProblem } = await import("@/lib/practice/india");
    expect(gstinProblem("27AABCS1429B1ZU")).toBeNull();
    expect(gstinProblem("27AABCS1429B1ZP")).toMatch(/should be U/);
    expect(gstinProblem("27AABCS")).toMatch(/15 characters/);
  });
});
