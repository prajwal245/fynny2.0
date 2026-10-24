import { describe, expect, it } from "vitest";
import {
  accessFor,
  cheapestPlan,
  documentAllowance,
  documentWarning,
  monthlyBill,
  PLANS,
  planAmountPaise,
  planEnvKey,
  statusFromRazorpay,
  TRIAL_MAX_ACTIVE_CLIENTS,
  TRIAL_MAX_DOCUMENTS,
  trialEndFrom,
} from "@/lib/practice/billing/plans";

const now = new Date("2026-10-12T10:00:00Z");
const row = (o: Partial<Parameters<typeof accessFor>[0]>) => ({
  plan: "starter" as const,
  cycle: "monthly" as const,
  status: "trialing" as const,
  trial_ends_at: trialEndFrom(now).toISOString(),
  current_period_end: null,
  trial_started_at: now.toISOString(),
  ...o,
});

describe("the final plans (16 Oct 2026)", () => {
  it("lists the published prices before GST", () => {
    expect([PLANS.starter.name, PLANS.professional.name, PLANS.scale.name]).toEqual(["Essential", "Firm", "Scale"]);
    expect([PLANS.starter.monthly, PLANS.professional.monthly, PLANS.scale.monthly]).toEqual([1999, 4499, 9999]);
    expect([PLANS.starter.annual, PLANS.professional.annual, PLANS.scale.annual]).toEqual([19990, 44990, 99990]);
    // Annual is two months free.
    for (const p of Object.values(PLANS)) expect(p.monthly * 12 - p.annual).toBe(p.monthly * 2);
    expect(Object.values(PLANS).map((p) => Math.round(p.annual / 12))).toEqual([1666, 3749, 8333]);
  });

  it("matches every worked example (before GST)", () => {
    const sub = (plan: "starter" | "professional" | "scale", activeClients: number) => monthlyBill(plan, "monthly", { activeClients, documents: 0 }).subtotal;
    expect(sub("starter", 10)).toBe(1999);
    expect(sub("starter", 22)).toBe(3787);
    expect(sub("professional", 55)).toBe(7474);
    expect(sub("scale", 140)).toBe(16434);
    expect(sub("professional", 45)).toBe(6284); // 60 clients, 45 active in a quiet month
  });

  it("has the upgrade points in the plan", () => {
    expect(monthlyBill("starter", "monthly", { activeClients: 25, documents: 0 }).subtotal).toBe(4234);
    expect(PLANS.professional.monthly - 4234).toBe(265);
    expect(cheapestPlan(26).plan).toBe("professional"); // Essential stops at 25
    expect(cheapestPlan(82).plan).toBe("professional");
    expect(cheapestPlan(83).plan).toBe("scale");
    expect(cheapestPlan(22).plan).toBe("starter");
  });

  it("adds 18% GST and charges ₹499 per 250 documents over the pooled allowance", () => {
    expect(monthlyBill("starter", "monthly", { activeClients: 10, documents: 0 })).toMatchObject({ subtotal: 1999, gst: 359.82, total: 2358.82 });
    expect(documentAllowance("professional", 40)).toBe(2000);
    expect(documentAllowance("professional", 5)).toBe(1500); // never fewer than the included clients
    expect(monthlyBill("professional", "monthly", { activeClients: 40, documents: 2001 }).overageAmount).toBe(499);
    expect(monthlyBill("professional", "monthly", { activeClients: 40, documents: 2251 }).overageAmount).toBe(998);
    expect(monthlyBill("professional", "monthly", { activeClients: 40, documents: 2000 }).overageAmount).toBe(0);
  });

  it("warns at 80% and 100% of the document allowance", () => {
    expect(documentWarning("starter", { activeClients: 10, documents: 319 })).toBeNull();
    expect(documentWarning("starter", { activeClients: 10, documents: 320 })?.level).toBe("80");
    expect(documentWarning("starter", { activeClients: 10, documents: 400 })?.level).toBe("100");
  });

  it("prices Razorpay plans in paise with GST on top", () => {
    expect(planAmountPaise("starter", "monthly")).toBe(235882);
    expect(planAmountPaise("professional", "annual")).toBe(5308820);
    expect(planAmountPaise("starter", "monthly", 0)).toBe(199900);
    expect(planAmountPaise("scale", "monthly", Number("not a number"))).toBe(999900);
  });
});

describe("trial and plan access", () => {
  it("does not start the clock until the first upload", () => {
    const a = accessFor(row({ trial_started_at: null }), now);
    expect(a).toMatchObject({ state: "trial", canWork: true, trialNotStarted: true, trialDaysLeft: null });
  });
  it("runs 14 days from the first upload, with trial limits and no WhatsApp Chaser", () => {
    const a = accessFor(row({}), now);
    expect(a).toMatchObject({ state: "trial", canWork: true, trialDaysLeft: 14, maxActiveClients: TRIAL_MAX_ACTIVE_CLIENTS, maxDocuments: TRIAL_MAX_DOCUMENTS, whatsappChaser: false, features: "professional" });
  });
  it("the last 24 hours count as the last day", () => {
    const a = accessFor(row({ trial_ends_at: new Date(now.getTime() + 3_600_000).toISOString() }), now);
    expect(a.trialDaysLeft).toBe(1);
    expect(a.canWork).toBe(true);
  });
  it("an ended trial is read-only and says data stays available", () => {
    const a = accessFor(row({ trial_ends_at: new Date(now.getTime() - 1000).toISOString() }), now);
    expect(a.canWork).toBe(false);
    expect(a.reason).toMatch(/readable and exportable for 30 days/);
  });
  it("older trials without a start date keep running on their original end date", () => {
    const { trial_started_at: _drop, ...old } = row({});
    expect(accessFor(old, now).trialDaysLeft).toBe(14);
  });
  it("paid plans: Essential caps active clients at 25 and has no WhatsApp Chaser; Firm has both", () => {
    expect(accessFor(row({ status: "active" }), now)).toMatchObject({ canWork: true, maxActiveClients: 25, whatsappChaser: false, maxDocuments: null });
    expect(accessFor(row({ status: "active", plan: "professional" }), now)).toMatchObject({ maxActiveClients: null, whatsappChaser: true });
  });
  it("a failed renewal keeps working while Razorpay retries, then pauses when halted", () => {
    expect(accessFor(row({ status: "past_due" }), now).canWork).toBe(true);
    expect(accessFor(row({ status: "halted" }), now).canWork).toBe(false);
  });
  it("a cancelled plan works until the paid period ends", () => {
    const later = new Date(now.getTime() + 86_400_000).toISOString();
    const earlier = new Date(now.getTime() - 86_400_000).toISOString();
    expect(accessFor(row({ status: "cancelled", current_period_end: later }), now).canWork).toBe(true);
    expect(accessFor(row({ status: "cancelled", current_period_end: earlier }), now).canWork).toBe(false);
  });
  it("maps Razorpay statuses", () => {
    expect(statusFromRazorpay("authenticated")).toBe("pending");
    expect(statusFromRazorpay("active")).toBe("active");
    expect(statusFromRazorpay("pending")).toBe("past_due");
    expect(statusFromRazorpay("halted")).toBe("halted");
    expect(statusFromRazorpay("cancelled")).toBe("cancelled");
    expect(statusFromRazorpay("created")).toBeNull();
    expect(planEnvKey("professional", "annual")).toBe("RAZORPAY_PLAN_PROFESSIONAL_ANNUAL");
  });
});

describe("plan changes, the money-back window and GSTIN", async () => {
  const { changeTiming, refundWindowEnd, validGstin } = await import("@/lib/practice/billing/plans");
  it("upgrades now, downgrades and cycle switches at renewal", () => {
    expect(changeTiming({ plan: "starter", cycle: "monthly" }, { plan: "professional", cycle: "monthly" })).toBe("now");
    expect(changeTiming({ plan: "scale", cycle: "annual" }, { plan: "starter", cycle: "annual" })).toBe("renewal");
    expect(changeTiming({ plan: "starter", cycle: "monthly" }, { plan: "starter", cycle: "annual" })).toBe("renewal");
    expect(changeTiming({ plan: "starter", cycle: "annual" }, { plan: "starter", cycle: "annual" })).toBe("same");
  });
  it("refunds a first annual payment in full within 30 days, once", () => {
    const base = { first_paid_cycle: "annual", first_payment_id: "pay_1", first_paid_at: "2026-10-10T10:00:00Z", refund_used: false };
    expect(refundWindowEnd(base, now)?.toISOString()).toBe("2026-11-09T10:00:00.000Z");
    expect(refundWindowEnd({ ...base, first_paid_at: "2026-09-01T10:00:00Z" }, now)).toBeNull();
    expect(refundWindowEnd({ ...base, refund_used: true }, now)).toBeNull();
    expect(refundWindowEnd({ ...base, first_paid_cycle: "monthly" }, now)).toBeNull();
  });
  it("checks GSTIN shape", () => {
    expect(validGstin("29ABCDE1234F1Z5")).toBe(true);
    expect(validGstin("29abcde1234f1z5")).toBe(true);
    expect(validGstin("29ABCDE1234F1X5")).toBe(false);
    expect(validGstin("ABCDE1234F")).toBe(false);
  });
});
