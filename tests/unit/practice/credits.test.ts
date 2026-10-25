// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  allowanceGrant,
  CREDIT_PACKS,
  creditLevel,
  lowThreshold,
  monthlyAllowance,
  packPaise,
  PLAN_CREDITS,
  pricePerCredit,
  remindersLeft,
  TRIAL_CREDITS,
} from "@/lib/practice/billing/credits";
import type { BillingRow } from "@/lib/practice/billing/plans";

const now = new Date("2026-10-20T08:00:00Z");
const row = (o: Partial<BillingRow> = {}): BillingRow => ({
  plan: "professional",
  cycle: "monthly",
  status: "active",
  trial_ends_at: "2026-11-01T00:00:00Z",
  current_period_end: "2026-11-20T00:00:00Z",
  trial_started_at: "2026-10-10T00:00:00Z",
  ...o,
});

describe("credit rules", () => {
  it("each plan gets its monthly allowance, trial firms get the trial gift once", () => {
    expect(allowanceGrant(row({ plan: "starter" }), "2026-10", now)).toEqual({ kind: "plan", credits: 100, period: "2026-10" });
    expect(allowanceGrant(row({ plan: "professional" }), "2026-10", now)).toEqual({ kind: "plan", credits: 500, period: "2026-10" });
    expect(allowanceGrant(row({ plan: "scale" }), "2026-10", now)).toEqual({ kind: "plan", credits: 2000, period: "2026-10" });
    expect(allowanceGrant(row({ status: "trialing" }), "2026-10", now)).toEqual({ kind: "trial", credits: TRIAL_CREDITS, period: "trial" });
  });

  it("no allowance once the trial is over or the plan has ended", () => {
    expect(allowanceGrant(row({ status: "trialing", trial_ends_at: "2026-10-01T00:00:00Z" }), "2026-10", now)).toBeNull();
    expect(allowanceGrant(row({ status: "halted" }), "2026-10", now)).toBeNull();
    expect(allowanceGrant(row({ status: "cancelled", current_period_end: "2026-10-01T00:00:00Z" }), "2026-10", now)).toBeNull();
  });

  it("packs: the agreed prices, GST on top, and a falling price per reminder", () => {
    expect(CREDIT_PACKS.map((p) => [p.credits, p.price])).toEqual([[500, 499], [2000, 1799], [5000, 3999]]);
    expect(packPaise(CREDIT_PACKS[0], 18)).toBe(58882);
    expect(CREDIT_PACKS.map(pricePerCredit)).toEqual([1, 0.9, 0.8]);
    expect(PLAN_CREDITS).toEqual({ starter: 100, professional: 500, scale: 2000 });
  });

  it("warns in the last fifth of the allowance, never under 10 credits", () => {
    expect(lowThreshold(500)).toBe(100);
    expect(lowThreshold(25)).toBe(10);
    expect(creditLevel(101, 500)).toBe("ok");
    expect(creditLevel(100, 500)).toBe("low");
    expect(creditLevel(1, 500)).toBe("low");
    expect(creditLevel(0, 500)).toBe("out");
  });

  it("says how many reminders are left", () => {
    expect(remindersLeft(1)).toBe("1 reminder left");
    expect(remindersLeft(1250)).toBe("1,250 reminders left");
    expect(monthlyAllowance(row({ status: "trialing" }), now)).toBe(TRIAL_CREDITS);
    expect(monthlyAllowance(row({ plan: "scale" }), now)).toBe(2000);
  });
});

/* ── spending, with a stand-in database ───────────────────── */

const state = {
  balance: 0,
  test: false,
  billing: row() as BillingRow & { razorpay_subscription_id: string | null },
  settings: null as null | { auto_topup: boolean; auto_pack: string; auto_max_per_month: number; low_notified_month?: string; out_notified_month?: string },
  autoLots: 0,
  rpc: [] as { fn: string; args: Record<string, unknown> }[],
  notifications: [] as Record<string, unknown>[],
  addons: [] as { path: string; body: unknown }[],
  addonFails: false,
};

vi.mock("@/lib/practice/billing.server", () => ({
  loadBilling: async () => state.billing,
  razorpayReady: () => true,
  gstPercent: () => 18,
  razorpayApi: async (_m: string, path: string, body: unknown) => {
    if (state.addonFails) throw new Error("razorpay down");
    state.addons.push({ path, body });
    return { id: "addon_1" };
  },
  checkoutSignatureValid: async () => true,
}));
vi.mock("@/lib/practice/testMode.server", () => ({ isTestFirm: async () => state.test, assertNotTest: async () => undefined }));

function db() {
  const chain = (table: string) => {
    let op = "select";
    let payload: Record<string, unknown> = {};
    const b: Record<string, unknown> = {
      select: () => b,
      eq: () => b,
      like: () => b,
      insert: (p: Record<string, unknown>) => { op = "insert"; payload = p; if (table === "ca_notifications") state.notifications.push(p); return b; },
      upsert: (p: Record<string, unknown>) => {
        op = "upsert";
        payload = p;
        state.settings = { auto_topup: false, auto_pack: "c500", auto_max_per_month: 2, ...(state.settings ?? {}), ...p } as never;
        return b;
      },
      update: (p: Record<string, unknown>) => { op = "update"; payload = p; return b; },
      maybeSingle: async () => ({ data: table === "ca_credit_settings" ? state.settings : null, error: null }),
      then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null, count: table === "ca_credit_lots" ? state.autoLots : 0 }).then(ok),
    };
    void op;
    void payload;
    return b;
  };
  return {
    from: chain,
    rpc: async (fn: string, args: Record<string, unknown>) => {
      state.rpc.push({ fn, args });
      if (fn === "ca_credits_spend") {
        const n = Number(args["p_amount"]);
        if (state.balance < n) return { data: -1, error: null };
        state.balance -= n;
        return { data: state.balance, error: null };
      }
      if (fn === "ca_credits_balance") return { data: state.balance, error: null };
      if (fn === "ca_credits_refund") { state.balance += 1; return { data: 1, error: null }; }
      if (fn === "ca_credits_grant") {
        if (args["p_kind"] === "auto_topup") { state.autoLots++; state.balance += Number(args["p_credits"]); }
        return { data: true, error: null };
      }
      return { data: null, error: null };
    },
  } as never;
}

beforeEach(() => {
  Object.assign(state, {
    balance: 300,
    test: false,
    billing: { ...row(), razorpay_subscription_id: "sub_1" },
    settings: null,
    autoLots: 0,
    rpc: [],
    notifications: [],
    addons: [],
    addonFails: false,
  });
});
afterEach(() => vi.clearAllMocks());

describe("spending credits on a WhatsApp reminder", () => {
  it("costs one credit on FynHelp's number", async () => {
    const { spendForReminder } = await import("@/lib/practice/billing/credits.server");
    const r = await spendForReminder(db(), "f1", { sharedNumber: true, now });
    expect(r).toMatchObject({ ok: true, free: false, balance: 299 });
    expect(r.ok && r.ref).toMatch(/^wa:/);
    expect(state.rpc.filter((c) => c.fn === "ca_credits_spend")).toHaveLength(1);
  });

  it("is free from the firm's own number, and for test accounts", async () => {
    const { spendForReminder } = await import("@/lib/practice/billing/credits.server");
    expect(await spendForReminder(db(), "f1", { sharedNumber: false, now })).toMatchObject({ ok: true, free: true, ref: null });
    state.test = true;
    expect(await spendForReminder(db(), "f1", { sharedNumber: true, now })).toMatchObject({ ok: true, free: true });
    expect(state.rpc.some((c) => c.fn === "ca_credits_spend")).toBe(false);
    expect(state.balance).toBe(300);
  });

  it("refuses when there are no credits, spends nothing, and tells the firm once", async () => {
    const { spendForReminder } = await import("@/lib/practice/billing/credits.server");
    state.balance = 0;
    expect(await spendForReminder(db(), "f1", { sharedNumber: true, now })).toEqual({ ok: false, balance: 0 });
    expect(await spendForReminder(db(), "f1", { sharedNumber: true, now })).toEqual({ ok: false, balance: 0 });
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]).toMatchObject({ type: "credits_out", severity: "critical" });
  });

  it("warns once when the balance drops into the last fifth", async () => {
    const { spendForReminder } = await import("@/lib/practice/billing/credits.server");
    state.balance = 101;
    await spendForReminder(db(), "f1", { sharedNumber: true, now });
    await spendForReminder(db(), "f1", { sharedNumber: true, now });
    expect(state.notifications.filter((n) => n["type"] === "credits_low")).toHaveLength(1);
  });

  it("gives the credit back when the message was not sent", async () => {
    const { spendForReminder, refundReminder } = await import("@/lib/practice/billing/credits.server");
    const r = await spendForReminder(db(), "f1", { sharedNumber: true, now });
    expect(r.ok).toBe(true);
    await refundReminder(db(), "f1", r.ok ? r.ref : null);
    expect(state.balance).toBe(300);
    await refundReminder(db(), "f1", null);
    expect(state.rpc.filter((c) => c.fn === "ca_credits_refund")).toHaveLength(1);
  });
});

describe("automatic top-up", () => {
  const on = { auto_topup: true, auto_pack: "c500", auto_max_per_month: 2 };

  it("adds a pack, bills it as a plan add-on with GST, and the reminder goes out", async () => {
    const { spendForReminder } = await import("@/lib/practice/billing/credits.server");
    state.balance = 0;
    state.settings = on;
    const r = await spendForReminder(db(), "f1", { sharedNumber: true, now });
    expect(r.ok).toBe(true);
    expect(state.balance).toBe(499);
    expect(state.addons).toHaveLength(1);
    expect(state.addons[0].path).toBe("/subscriptions/sub_1/addons");
    expect(JSON.stringify(state.addons[0].body)).toContain('"amount":58882');
  });

  it("stops at the firm's monthly limit", async () => {
    const { spendForReminder } = await import("@/lib/practice/billing/credits.server");
    state.balance = 0;
    state.settings = { ...on, auto_max_per_month: 1 };
    state.autoLots = 1;
    expect(await spendForReminder(db(), "f1", { sharedNumber: true, now })).toEqual({ ok: false, balance: 0 });
    expect(state.addons).toHaveLength(0);
  });

  it("takes the credits back if the charge could not be created", async () => {
    const { autoTopUp } = await import("@/lib/practice/billing/credits.server");
    state.settings = on;
    state.addonFails = true;
    expect(await autoTopUp(db(), "f1", now)).toBe(false);
  });

  it("does nothing on a yearly plan, without a live subscription, or when switched off", async () => {
    const { autoTopUp } = await import("@/lib/practice/billing/credits.server");
    expect(await autoTopUp(db(), "f1", now)).toBe(false);
    state.settings = on;
    state.billing = { ...state.billing, cycle: "annual" };
    expect(await autoTopUp(db(), "f1", now)).toBe(false);
    state.billing = { ...state.billing, cycle: "monthly", razorpay_subscription_id: null };
    expect(await autoTopUp(db(), "f1", now)).toBe(false);
    expect(state.addons).toHaveLength(0);
  });
});
