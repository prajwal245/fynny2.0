import { describe, expect, it } from "vitest";
import { accessFor, statusFromRazorpay, trialEndFrom, TRIAL_MAX_CLIENTS, planEnvKey, planAmountPaise } from "@/lib/practice/billing/plans";

const now = new Date("2026-10-12T10:00:00Z");
const row = (o: Partial<Parameters<typeof accessFor>[0]>) => ({
  plan: "starter" as const,
  cycle: "monthly" as const,
  status: "trialing" as const,
  trial_ends_at: trialEndFrom(now).toISOString(),
  current_period_end: null,
  ...o,
});

describe("trial and plan access", () => {
  it("a new trial shows 14 days left and allows work", () => {
    const a = accessFor(row({}), now);
    expect(a).toMatchObject({ state: "trial", canWork: true, trialDaysLeft: 14, maxClients: TRIAL_MAX_CLIENTS });
  });
  it("the last 24 hours count as the last day", () => {
    const a = accessFor(row({ trial_ends_at: new Date(now.getTime() + 3_600_000).toISOString() }), now);
    expect(a.trialDaysLeft).toBe(1);
    expect(a.canWork).toBe(true);
  });
  it("an ended trial pauses new work but says data is safe", () => {
    const a = accessFor(row({ trial_ends_at: new Date(now.getTime() - 1000).toISOString() }), now);
    expect(a.canWork).toBe(false);
    expect(a.reason).toMatch(/data is safe/);
  });
  it("paid plans work; Starter is capped at 25 clients, Professional is not", () => {
    expect(accessFor(row({ status: "active" }), now)).toMatchObject({ canWork: true, maxClients: 25 });
    expect(accessFor(row({ status: "active", plan: "professional" }), now).maxClients).toBeNull();
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
  it("prices plans in paise, adding GST only when a rate is set", () => {
    expect(planAmountPaise("starter", "monthly")).toBe(299900);
    expect(planAmountPaise("professional", "annual")).toBe(6119000);
    expect(planAmountPaise("starter", "monthly", 18)).toBe(353882);
    expect(planAmountPaise("scale", "monthly", Number("not a number"))).toBe(1299900);
  });
});

describe("plan changes, the refund window and GSTIN (Refund and Cancellation Policy)", async () => {
  const { changeTiming, refundWindowEnd, validGstin } = await import("@/lib/practice/billing/plans");
  it("upgrades now, downgrades and cycle switches at renewal", () => {
    expect(changeTiming({ plan: "starter", cycle: "monthly" }, { plan: "professional", cycle: "monthly" })).toBe("now");
    expect(changeTiming({ plan: "scale", cycle: "annual" }, { plan: "starter", cycle: "annual" })).toBe("renewal");
    expect(changeTiming({ plan: "starter", cycle: "monthly" }, { plan: "starter", cycle: "annual" })).toBe("renewal");
    expect(changeTiming({ plan: "starter", cycle: "annual" }, { plan: "starter", cycle: "annual" })).toBe("same");
  });
  it("refunds a first annual payment only within 7 days, once", () => {
    const base = { first_paid_cycle: "annual", first_payment_id: "pay_1", first_paid_at: "2026-10-10T10:00:00Z", refund_used: false };
    expect(refundWindowEnd(base, now)?.toISOString()).toBe("2026-10-17T10:00:00.000Z");
    expect(refundWindowEnd({ ...base, first_paid_at: "2026-10-01T10:00:00Z" }, now)).toBeNull();
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
