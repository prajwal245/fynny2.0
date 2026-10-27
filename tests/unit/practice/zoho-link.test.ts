import { describe, expect, it } from "vitest";
import { defaultMonth, monthOptions, nameLikeness, owedSummary, setupStage, suggestOrganisation } from "@/lib/practice/zohoLink";

const orgs = [
  { id: "1", name: "Kaveri Textiles Private Limited" },
  { id: "2", name: "Mehta Foods LLP" },
  { id: "3", name: "Mehta Traders" },
];

describe("suggesting the Zoho organisation for a client", () => {
  it("ignores Pvt Ltd style endings", () => {
    expect(nameLikeness("Kaveri Textiles Pvt Ltd", "Kaveri Textiles Private Limited")).toBe(1);
    expect(suggestOrganisation("Kaveri Textiles Pvt. Ltd.", orgs)?.id).toBe("1");
  });
  it("suggests nothing when two organisations are as close, or none is", () => {
    expect(suggestOrganisation("Mehta", orgs)).toBeNull();
    expect(suggestOrganisation("Orion IT Services", orgs)).toBeNull();
    expect(suggestOrganisation("Anything", [])).toBeNull();
  });
  it("picks the clearly better of two similar names", () => {
    expect(suggestOrganisation("Mehta Foods", orgs)?.id).toBe("2");
  });
});

describe("months, owed money and setup progress", () => {
  const now = new Date(Date.UTC(2026, 9, 27));
  it("offers recent months newest first, and defaults to the last full month", () => {
    const m = monthOptions(now, 3);
    expect(m.map((x) => x.value)).toEqual(["2026-10", "2026-09", "2026-08"]);
    expect(m[0]!.label).toContain("so far");
    expect(defaultMonth(now)).toBe("2026-09");
    expect(monthOptions(new Date(Date.UTC(2026, 0, 15)), 2)[1]!.value).toBe("2025-12");
  });
  it("sums what is owed and what is overdue", () => {
    const s = owedSummary([
      { number: "INV-2601", customer: "Kaveri", balance: 18000, dueDate: "2026-09-02" },
      { number: "INV-2602", customer: "Mehta", balance: 40800, dueDate: "2026-10-03" },
      { number: "INV-2607", customer: "Mehta", balance: 28100, dueDate: "2026-11-12" },
    ], "2026-10-27");
    expect(s).toMatchObject({ count: 3, total: 86900, overdueCount: 2, overdueTotal: 58800 });
    expect(s.top[0]).toEqual({ customer: "Mehta", balance: 68900 });
  });
  it("walks the four setup stages", () => {
    expect(setupStage({ connected: false, links: [] })).toBe(0);
    expect(setupStage({ connected: true, links: [] })).toBe(1);
    expect(setupStage({ connected: true, links: [{ last_synced_at: null }] })).toBe(2);
    expect(setupStage({ connected: true, links: [{ last_synced_at: "2026-10-01" }] })).toBe(3);
  });
});
