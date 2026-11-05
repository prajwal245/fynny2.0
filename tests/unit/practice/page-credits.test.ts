import { describe, expect, it } from "vitest";
import { PLAN_PAGES, TRIAL_PAGES, pageAllowanceGrant, pageDocKey, pageLevel, pageLowThreshold, pagePackByKey, pagePackPaise, pagesForDocument } from "@/lib/practice/billing/pageCredits";
import { PLAN_CREDITS } from "@/lib/practice/billing/credits";

const billing = (over: Record<string, unknown>) => ({ plan: "professional", status: "active", cycle: "monthly", trial_ends_at: null, ...over }) as never;

describe("Tally posting pages", () => {
  it("every existing plan has a monthly page allowance that grows with the plan", () => {
    expect(Object.keys(PLAN_PAGES).sort()).toEqual(Object.keys(PLAN_CREDITS).sort());
    expect(PLAN_PAGES.starter).toBeLessThan(PLAN_PAGES.professional);
    expect(PLAN_PAGES.professional).toBeLessThan(PLAN_PAGES.scale);
  });
  it("counts a PDF's real pages, otherwise one page per 30 lines, at least one", () => {
    expect(pagesForDocument({ pdfPages: 4, rows: 500 })).toBe(4);
    expect(pagesForDocument({ rows: 0 })).toBe(1);
    expect(pagesForDocument({ rows: 30 })).toBe(1);
    expect(pagesForDocument({ rows: 31 })).toBe(2);
    expect(pagesForDocument({ pdfPages: 0, rows: 61 })).toBe(3);
    expect(pagesForDocument({ rows: -5 })).toBe(1);
  });
  it("a document is paid for once: the same key for every line of it", () => {
    expect(pageDocKey("abc")).toBe("pg:abc");
  });
  it("pack charge in paise is price plus GST, and unknown packs are refused", () => {
    const p = pagePackByKey("regular-200")!;
    expect(pagePackPaise(p, 18)).toBe(40120);
    expect(pagePackPaise(pagePackByKey("pro-3000")!, 18)).toBe(300900);
    expect(pagePackByKey("nope")).toBeNull();
    expect(pagePackByKey(null)).toBeNull();
  });
  it("levels: out at zero, low in the last fifth (never under 20 pages), otherwise ok", () => {
    expect(pageLowThreshold(100)).toBe(20);
    expect(pageLowThreshold(2000)).toBe(400);
    expect(pageLevel(0, 500)).toBe("out");
    expect(pageLevel(100, 500)).toBe("low");
    expect(pageLevel(101, 500)).toBe("ok");
  });
  it("grants the trial gift once during a trial and the plan allowance each month on a paid plan", () => {
    const now = new Date("2026-11-10T00:00:00Z");
    const trial = pageAllowanceGrant(billing({ status: "trialing", plan: "professional", trial_ends_at: "2026-11-20T00:00:00Z" }), "2026-11", now);
    expect(trial).toEqual({ kind: "trial", credits: TRIAL_PAGES, period: "trial" });
    const paid = pageAllowanceGrant(billing({}), "2026-11", now);
    expect(paid).toEqual({ kind: "plan", credits: PLAN_PAGES.professional, period: "2026-11" });
  });
});
