import { describe, expect, it } from "vitest";
import { accessFor, statusFromRazorpay, trialEndFrom, TRIAL_MAX_CLIENTS, planEnvKey } from "@/lib/practice/billing/plans";

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
});
