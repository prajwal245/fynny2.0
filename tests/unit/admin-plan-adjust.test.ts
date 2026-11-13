// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_CREDIT_ADJUST, canWaiveCharge, creditAdjustProblem, manualPlanEnd, planFitsUsage, planRoute } from "@/lib/admin/planAdjust";
import { can } from "@/lib/admin/rbac";

describe("rules for admin plan and credit changes", () => {
  it("only finance and super admins may adjust billing", () => {
    expect(can(["super_admin"], "billing.adjust")).toBe(true);
    expect(can(["finance_manager"], "billing.adjust")).toBe(true);
    for (const r of ["support_agent", "ops_admin", "analyst", "content_collaborator"]) expect(can([r], "billing.adjust"), r).toBe(false);
  });

  it("checks a credit change: whole number, size, reason, and never below zero", () => {
    expect(creditAdjustProblem(100, "Goodwill after outage", 0)).toBeNull();
    expect(creditAdjustProblem(0, "reason here")).toMatch(/whole number/);
    expect(creditAdjustProblem(1.5, "reason here")).toMatch(/whole number/);
    expect(creditAdjustProblem(MAX_CREDIT_ADJUST + 1, "reason here")).toMatch(/At most/);
    expect(creditAdjustProblem(50, "  ok ")).toMatch(/why/);
    expect(creditAdjustProblem(-60, "Duplicate grant", 50)).toMatch(/only 50/);
    expect(creditAdjustProblem(-50, "Duplicate grant", 50)).toBeNull();
  });

  it("a manual plan ends on a real day between tomorrow and about a year", () => {
    const now = new Date("2026-11-13T08:00:00Z");
    expect(manualPlanEnd("soon", now)).toMatchObject({ ok: false });
    expect(manualPlanEnd("2026-11-13", now)).toMatchObject({ ok: false });
    expect(manualPlanEnd("2026-11-14", now)).toMatchObject({ ok: true });
    expect(manualPlanEnd("2028-01-01", now)).toMatchObject({ ok: false });
    const ok = manualPlanEnd("2026-12-31", now);
    expect(ok.ok && ok.endsAt).toBe(new Date("2026-12-31T23:59:59+05:30").toISOString());
  });

  it("refuses a plan too small for the firm's active clients", () => {
    expect(planFitsUsage("starter", 25)).toBeNull();
    expect(planFitsUsage("starter", 26)).toMatch(/up to 25/);
    expect(planFitsUsage("professional", 400)).toBeNull();
  });

  it("only waives a charge that failed to go out", () => {
    expect(canWaiveCharge("failed")).toBe(true);
    for (const s of ["billed", "paid", "pending", "none", "waived"]) expect(canWaiveCharge(s), s).toBe(false);
  });

  it("routes a paying firm through Razorpay and everyone else to a manual plan", () => {
    expect(planRoute({ razorpay_subscription_id: "sub_1", status: "active" })).toBe("razorpay");
    expect(planRoute({ razorpay_subscription_id: "sub_1", status: "active", cancel_at_period_end: true })).toBe("blocked");
    expect(planRoute({ razorpay_subscription_id: null, status: "trialing" })).toBe("manual");
    expect(planRoute({ razorpay_subscription_id: "sub_1", status: "cancelled" })).toBe("manual");
  });
});

/* ── server: credits, manual plan, waiver, with stand-ins ── */

vi.mock("@/lib/admin/security.server", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/practice/db.server", () => ({ logActivity: vi.fn(async () => undefined) }));
const state = { billing: {} as Record<string, unknown>, usage: { activeClients: 3, documents: 10, month: "2026-11" }, changed: [] as unknown[], rz: [] as string[], rzFails: false };
vi.mock("@/lib/practice/billing.server", () => ({
  loadBilling: async () => state.billing,
  razorpayApi: async (_m: string, path: string) => { if (state.rzFails) throw new Error("Razorpay could not cancel the subscription"); state.rz.push(path); return {}; },
  changePlan: async (_db: unknown, _ctx: unknown, plan: string, cycle: string) => { state.changed.push({ plan, cycle }); return { timing: "now" }; },
}));
vi.mock("@/lib/practice/billing/usage.server", () => ({ usageFor: async () => state.usage }));

import { adjustFirmCredits, setFirmPlan, waiveUsageCharge } from "@/lib/admin/adminBilling.server";
import { audit } from "@/lib/admin/security.server";

type Json = Record<string, unknown>;
function ctx(opts: { balance?: number; isTest?: boolean; charge?: Json | null } = {}) {
  let balance = opts.balance ?? 100;
  const calls: { fn: string; args: Json }[] = [];
  const updates: { table: string; patch: Json }[] = [];
  const q = (table: string) => {
    const api: Record<string, unknown> = {
      select: () => api,
      eq: () => api,
      order: () => api,
      limit: () => Promise.resolve({ data: [], error: null }),
      maybeSingle: () =>
        Promise.resolve({
          data: table === "ca_firms" ? { id: "f1", firm_name: "Alpha", email: "a@x.in", is_test: !!opts.isTest, is_demo: false } : table === "ca_usage_charges" ? (opts.charge ?? null) : null,
          error: null,
        }),
      update: (patch: Json) => { updates.push({ table, patch }); const u: Record<string, unknown> = { eq: () => u, select: () => Promise.resolve({ data: [{ month: "2026-10" }], error: null }), then: (r: (v: unknown) => void) => r({ error: null }) }; return u; },
      insert: () => Promise.resolve({ error: null }),
    };
    return api;
  };
  const db = {
    from: q,
    rpc: async (fn: string, args: Json) => {
      calls.push({ fn, args });
      if (fn === "ca_credits_balance") return { data: balance, error: null };
      if (fn === "ca_credits_grant") { balance += Number(args["p_credits"]); return { data: true, error: null }; }
      if (fn === "ca_credits_spend") { if (balance < Number(args["p_amount"])) return { data: -1, error: null }; balance -= Number(args["p_amount"]); return { data: balance, error: null }; }
      return { data: null, error: null };
    },
  };
  return { c: { db, userId: "admin1", email: "a@fynhelp.com", roles: ["super_admin"], adminSessionId: "s", ip: "1.1.1.1" } as never, calls, updates };
}

beforeEach(() => { vi.mocked(audit).mockClear(); state.changed = []; state.rz = []; state.rzFails = false; state.usage = { activeClients: 3, documents: 10, month: "2026-11" }; });

describe("admin credit adjustment", () => {
  it("adds bonus credits and records who, why and the balance before and after", async () => {
    const { c, calls } = ctx({ balance: 100 });
    const r = await adjustFirmCredits(c, "f1", 500, "Goodwill after the outage");
    expect(r.balance).toBe(600);
    expect(calls.find((x) => x.fn === "ca_credits_grant")?.args).toMatchObject({ p_kind: "bonus", p_credits: 500, p_months: 12 });
    expect(vi.mocked(audit).mock.calls[0]?.[1]).toBe("firm_credits_adjusted");
    expect(vi.mocked(audit).mock.calls[0]?.[4]).toMatchObject({ delta: 500, before: 100, after: 600 });
  });
  it("takes credits back through the locked spend function, and relabels the ledger line", async () => {
    const { c, updates } = ctx({ balance: 100 });
    const r = await adjustFirmCredits(c, "f1", -40, "Duplicate grant");
    expect(r.balance).toBe(60);
    expect(updates.find((u) => u.table === "ca_credit_ledger")?.patch["note"]).toBe("Taken back by FynHelp: Duplicate grant");
  });
  it("never takes a firm below zero and changes nothing", async () => {
    const { c, calls } = ctx({ balance: 30 });
    await expect(adjustFirmCredits(c, "f1", -40, "Duplicate grant")).rejects.toThrow(/only 30/);
    expect(calls.some((x) => x.fn === "ca_credits_spend")).toBe(false);
  });
  it("needs a reason and refuses test firms", async () => {
    await expect(adjustFirmCredits(ctx().c, "f1", 10, "no")).rejects.toThrow(/why/i);
    await expect(adjustFirmCredits(ctx({ isTest: true }).c, "f1", 10, "Testing the thing")).rejects.toThrow(/test firm/i);
  });
});

describe("admin plan change", () => {
  const soon = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
  const manual = { plan: "starter", cycle: "monthly", status: "trialing", razorpay_subscription_id: null, current_period_end: null };
  it("gives a manual plan that ends on its own date and is never billed", async () => {
    state.billing = manual;
    const { c, updates } = ctx();
    const r = await setFirmPlan(c, "f1", "professional", "monthly", soon, "Pilot partner, agreed with founder");
    expect(r.route).toBe("manual");
    expect(updates.find((u) => u.table === "ca_billing")?.patch).toMatchObject({ plan: "professional", status: "cancelled", cancel_at_period_end: false });
    expect(state.changed).toHaveLength(0);
  });
  it("switches a paying firm in Razorpay instead of editing its row", async () => {
    state.billing = { plan: "starter", cycle: "monthly", status: "active", razorpay_subscription_id: "sub_1", current_period_end: "2026-12-01" };
    const { c, updates } = ctx();
    const r = await setFirmPlan(c, "f1", "professional", "monthly", null, "Asked for an upgrade by phone");
    expect(r.route).toBe("razorpay");
    expect(state.changed).toEqual([{ plan: "professional", cycle: "monthly" }]);
    expect(updates.some((u) => u.table === "ca_billing")).toBe(false);
  });
  it("refuses a plan too small, a firm that is cancelling, a bad date and a missing reason", async () => {
    state.billing = manual;
    state.usage = { activeClients: 40, documents: 0, month: "2026-11" };
    await expect(setFirmPlan(ctx().c, "f1", "starter", "monthly", soon, "Pilot partner")).rejects.toThrow(/up to 25/);
    state.usage = { activeClients: 3, documents: 0, month: "2026-11" };
    await expect(setFirmPlan(ctx().c, "f1", "scale", "monthly", "yesterday", "Pilot partner")).rejects.toThrow(/day/i);
    await expect(setFirmPlan(ctx().c, "f1", "scale", "monthly", soon, "x")).rejects.toThrow(/why/i);
    state.billing = { plan: "starter", cycle: "monthly", status: "active", razorpay_subscription_id: "sub_1", cancel_at_period_end: true };
    await expect(setFirmPlan(ctx().c, "f1", "scale", "monthly", null, "Pilot partner")).rejects.toThrow(/cancelled/i);
  });
});

describe("assigning a plan manually to a firm that pays through Razorpay", () => {
  const paying = { plan: "starter", cycle: "monthly", status: "active", razorpay_subscription_id: "sub_9", current_period_end: "2026-12-01" };
  const soon = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
  it("asks for explicit confirmation first and touches nothing without it", async () => {
    state.billing = paying;
    const { c, updates } = ctx();
    await expect(setFirmPlan(c, "f1", "scale", "annual", soon, "Pilot partner, invoiced offline", { mode: "manual" })).rejects.toThrow(/cancels that subscription/);
    expect(state.rz).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });
  it("cancels the Razorpay subscription, then records the manual plan", async () => {
    state.billing = paying;
    const { c, updates } = ctx();
    const r = await setFirmPlan(c, "f1", "scale", "annual", soon, "Pilot partner, invoiced offline", { mode: "manual", endRazorpay: true });
    expect(r.route).toBe("manual");
    expect(state.rz).toEqual(["/subscriptions/sub_9/cancel"]);
    expect(updates.find((u) => u.table === "ca_billing")?.patch).toMatchObject({ plan: "scale", cycle: "annual", status: "cancelled" });
    expect(vi.mocked(audit).mock.calls[0]?.[4]).toMatchObject({ route: "manual", endedRazorpay: true });
  });
  it("validates the date before Razorpay is touched, and changes nothing if Razorpay refuses", async () => {
    state.billing = paying;
    await expect(setFirmPlan(ctx().c, "f1", "scale", "annual", "yesterday", "Pilot partner, invoiced offline", { mode: "manual", endRazorpay: true })).rejects.toThrow(/day/i);
    expect(state.rz).toHaveLength(0);
    state.rzFails = true;
    const { c, updates } = ctx();
    await expect(setFirmPlan(c, "f1", "scale", "annual", soon, "Pilot partner, invoiced offline", { mode: "manual", endRazorpay: true })).rejects.toThrow(/cancel the subscription/);
    expect(updates).toHaveLength(0);
  });
  it("lets a firm that is already cancelling be given a manual plan, without another cancel", async () => {
    state.billing = { ...paying, cancel_at_period_end: true };
    const { c } = ctx();
    const r = await setFirmPlan(c, "f1", "professional", "monthly", soon, "Keeping them on, agreed by phone", { mode: "manual" });
    expect(r.route).toBe("manual");
    expect(state.rz).toHaveLength(0);
  });
});

describe("admin charge waiver", () => {
  it("waives a failed charge only", async () => {
    await expect(waiveUsageCharge(ctx({ charge: { status: "failed", total: 590 } }).c, "f1", "2026-10", "Our billing bug")).resolves.toEqual({ month: "2026-10" });
    await expect(waiveUsageCharge(ctx({ charge: { status: "billed", total: 590 } }).c, "f1", "2026-10", "Our billing bug")).rejects.toThrow(/failed to go out/);
    await expect(waiveUsageCharge(ctx({ charge: null }).c, "f1", "2026-10", "Our billing bug")).rejects.toThrow(/no charge/i);
  });
});
