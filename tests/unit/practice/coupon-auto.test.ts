// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { couponAmountPaise } from "@/lib/practice/billing/plans";

// The admin audit log reads the incoming request, which only exists on the server.
vi.mock("@/lib/admin/security.server", () => ({ audit: async () => undefined }));

describe("what a money coupon leaves to pay", () => {
  it("takes the discount off the plan price, then adds GST", () => {
    // Essential monthly is ₹1,999.
    expect(couponAmountPaise("starter", "monthly", 18, { kind: "percent", value: 20 })).toBe(Math.round(1999 * 0.8 * 100 * 1.18));
    expect(couponAmountPaise("starter", "monthly", 0, { kind: "percent", value: 20 })).toBe(Math.round(1999 * 0.8 * 100));
    expect(couponAmountPaise("starter", "monthly", 18, { kind: "flat", value: 500 })).toBe(Math.round(1499 * 100 * 1.18));
    expect(couponAmountPaise("scale", "annual", 18, { kind: "percent", value: 10 })).toBe(Math.round(99990 * 0.9 * 100 * 1.18));
  });
  it("is null for a trial code and for a code that would leave under ₹1", () => {
    expect(couponAmountPaise("starter", "monthly", 18, { kind: "trial_days", value: 14 })).toBeNull();
    expect(couponAmountPaise("starter", "monthly", 18, { kind: "flat", value: 1999 })).toBeNull();
    expect(couponAmountPaise("starter", "monthly", 18, { kind: "percent", value: 100 })).toBeNull();
    expect(couponAmountPaise("starter", "monthly", 18, { kind: "flat", value: 1998 })).toBeGreaterThanOrEqual(100);
  });
});

/* ── Razorpay and the database, with stand-ins ───────────── */

type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};
const rzp: { method: string; path: string; body: Record<string, unknown> }[] = [];
let rzpFails = false;

function db() {
  const from = (table: string) => {
    tables[table] ??= [];
    const f: ((r: Row) => boolean)[] = [];
    let op = "select";
    let payload: Row = {};
    const run = () => {
      const rows = tables[table];
      if (op === "insert") {
        if (table === "ca_coupons" && rows.some((r) => r["code"] === payload["code"])) return { data: null, error: { message: "duplicate key" } };
        rows.push({ ...payload });
        return { data: null, error: null };
      }
      if (op === "upsert") {
        const i = rows.findIndex((r) => ["key_id", "plan", "cycle", "amount_paise"].every((k) => r[k] === payload[k]));
        if (i >= 0) Object.assign(rows[i], payload);
        else rows.push({ ...payload });
        return { data: null, error: null };
      }
      const hit = rows.filter((r) => f.every((fn) => fn(r)));
      if (op === "update") {
        hit.forEach((r) => Object.assign(r, payload));
        return { data: null, error: null };
      }
      if (op === "delete") {
        tables[table] = rows.filter((r) => !hit.includes(r));
        return { data: null, error: null };
      }
      return { data: hit, error: null };
    };
    const b: Record<string, unknown> = {
      select: () => b,
      insert: (p: Row) => { op = "insert"; payload = p; return b; },
      upsert: (p: Row) => { op = "upsert"; payload = p; return b; },
      update: (p: Row) => { op = "update"; payload = p; return b; },
      delete: () => { op = "delete"; return b; },
      eq: (k: string, v: unknown) => { f.push((r) => r[k] === v); return b; },
      not: (k: string, _o: string, v: unknown) => { f.push((r) => (r[k] ?? null) !== v); return b; },
      limit: () => b,
      maybeSingle: async () => ({ data: (run().data as Row[] | null)?.[0] ?? null, error: null }),
      then: (ok: (v: unknown) => unknown) => Promise.resolve(run()).then(ok),
    };
    return b;
  };
  return { from } as never;
}

beforeEach(() => {
  tables = { ca_billing_plans: [], ca_billing: [], ca_billing_events: [], ca_coupons: [], admin_audit_logs: [] };
  rzp.length = 0;
  rzpFails = false;
  process.env["RAZORPAY_KEY_ID"] = "rzp_test_x";
  process.env["RAZORPAY_KEY_SECRET"] = "secret";
  process.env["FYNHELP_GST_PERCENT"] = "18";
  vi.stubGlobal("fetch", async (url: string, init: { method: string; body?: string }) => {
    const path = String(url).replace(/^.*\/v1/, "");
    const body = init.body ? JSON.parse(init.body) : {};
    rzp.push({ method: init.method, path, body });
    if (rzpFails) return { ok: false, status: 400, json: async () => ({ error: { description: "bad" } }) };
    if (init.method === "POST" && path === "/plans") return { ok: true, json: async () => ({ id: `plan_${rzp.length}`, ...body }) };
    if (path === "/plans?count=100") return { ok: true, json: async () => ({ items: [] }) };
    return { ok: true, json: async () => ({ id: "sub_1", plan_id: body.plan_id, status: "active" }) };
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "FYNHELP_GST_PERCENT"]) delete process.env[k];
});

const coupon = { code: "SAVE20", kind: "percent" as const, value: 20, razorpay_offer_id: null, plans: null, cycles: null, expires_at: null, max_redemptions: null, per_firm_limit: 1, active: true, duration: "first" as const };

describe("a discount applied by FynHelp, not by a hand-made Razorpay offer", () => {
  it("creates the discounted plan once, at the discounted price with GST, and reuses it", async () => {
    const { discountedPlanId } = await import("@/lib/practice/billing.server");
    const id = await discountedPlanId(db(), "starter", "monthly", coupon);
    expect(id).toMatch(/^plan_/);
    const made = rzp.find((r) => r.method === "POST" && r.path === "/plans")!;
    expect((made.body["item"] as { amount: number }).amount).toBe(Math.round(1999 * 0.8 * 100 * 1.18));
    expect((made.body["item"] as { name: string }).name).toContain("SAVE20");
    expect(await discountedPlanId(db(), "starter", "monthly", coupon)).toBe(id);
    expect(rzp.filter((r) => r.path === "/plans" && r.method === "POST")).toHaveLength(1);
  });

  it("checkout uses the discounted plan for a new code and the offer for an old one", async () => {
    const { checkoutPlan } = await import("@/lib/practice/billing.server");
    const auto = await checkoutPlan(db(), "professional", "annual", coupon);
    expect(auto.offerId).toBeNull();
    expect(auto.planId).toMatch(/^plan_/);
    const legacy = await checkoutPlan(db(), "professional", "annual", { ...coupon, razorpay_offer_id: "offer_abc" });
    expect(legacy.offerId).toBe("offer_abc");
    const none = await checkoutPlan(db(), "professional", "annual", null);
    expect(none.offerId).toBeNull();
  });

  it("says how long the discount lasts", async () => {
    const { describeCoupon, isAutoCoupon } = await import("@/lib/practice/billing.server");
    expect(describeCoupon(coupon)).toBe("20% off your first payment");
    expect(describeCoupon({ ...coupon, duration: "forever" })).toBe("20% off every payment");
    expect(describeCoupon({ ...coupon, kind: "flat", value: 500 })).toBe("₹500 off your first payment");
    expect(describeCoupon({ ...coupon, razorpay_offer_id: "offer_x" })).toBe("20% off");
    expect(describeCoupon({ ...coupon, kind: "trial_days", value: 14 })).toBe("14 more days of free trial");
    expect(isAutoCoupon(coupon)).toBe(true);
    expect(isAutoCoupon({ ...coupon, razorpay_offer_id: "offer_x" })).toBe(false);
  });
});

describe("moving a firm back to the normal price after the first payment", () => {
  it("schedules the normal plan at the end of the period, then stops trying", async () => {
    const { settleCouponReverts } = await import("@/lib/practice/billing.server");
    tables.ca_billing = [{ ca_firm_id: "f1", plan: "starter", cycle: "monthly", status: "active", razorpay_subscription_id: "sub_9", coupon_revert_pending: true }];
    expect(await settleCouponReverts(db())).toEqual({ moved: 1, waiting: 0 });
    const patch = rzp.find((r) => r.method === "PATCH")!;
    expect(patch.path).toBe("/subscriptions/sub_9");
    expect(patch.body).toMatchObject({ schedule_change_at: "cycle_end" });
    expect(tables.ca_billing[0].coupon_revert_pending).toBe(false);
    expect(await settleCouponReverts(db())).toEqual({ moved: 0, waiting: 0 });
  });

  it("keeps trying when Razorpay is not ready, and moves nothing else", async () => {
    const { settleCouponReverts } = await import("@/lib/practice/billing.server");
    tables.ca_billing = [{ ca_firm_id: "f1", plan: "starter", cycle: "monthly", status: "active", razorpay_subscription_id: "sub_9", coupon_revert_pending: true }, { ca_firm_id: "f2", plan: "starter", cycle: "monthly", status: "active", razorpay_subscription_id: "sub_8", coupon_revert_pending: false }];
    rzpFails = true;
    expect(await settleCouponReverts(db())).toEqual({ moved: 0, waiting: 1 });
    expect(tables.ca_billing[0].coupon_revert_pending).toBe(true);
    expect(rzp.filter((r) => r.method === "PATCH")).toHaveLength(0);
  });
});

describe("creating a code in the admin panel", () => {
  const ctx = () => ({ db: db(), userId: "u1", email: "a@fynhelp.com", ip: "1.1.1.1", roles: ["admin"] }) as never;

  it("needs no Razorpay offer: it makes the plans for every plan and billing cycle by itself", async () => {
    const { createCoupon } = await import("@/lib/admin/admin.server");
    const r = await createCoupon(ctx(), { code: "save20", kind: "percent", value: 20 });
    expect(r).toMatchObject({ code: "SAVE20", prepared: 6, warning: null });
    expect(tables.ca_coupons[0]).toMatchObject({ code: "SAVE20", kind: "percent", razorpay_offer_id: null, duration: "first" });
    expect(rzp.filter((x) => x.method === "POST" && x.path === "/plans")).toHaveLength(6);
  });

  it("only makes the plans the code covers", async () => {
    const { createCoupon } = await import("@/lib/admin/admin.server");
    const r = await createCoupon(ctx(), { code: "FIRM10", kind: "percent", value: 10, plans: ["professional"], cycles: ["annual"], duration: "forever" });
    expect(r.prepared).toBe(1);
    expect(tables.ca_coupons[0]).toMatchObject({ duration: "forever", plans: ["professional"] });
  });

  it("a trial code needs nothing from Razorpay", async () => {
    const { createCoupon } = await import("@/lib/admin/admin.server");
    expect(await createCoupon(ctx(), { code: "TRIAL14", kind: "trial_days", value: 14 })).toMatchObject({ prepared: 0 });
    expect(rzp).toHaveLength(0);
  });

  it("refuses a code that makes no sense, in words an admin can act on", async () => {
    const { createCoupon } = await import("@/lib/admin/admin.server");
    await expect(createCoupon(ctx(), { code: "X", kind: "percent", value: 20 })).rejects.toThrow(/3 to 32/);
    await expect(createCoupon(ctx(), { code: "FREE", kind: "percent", value: 100 })).rejects.toThrow(/free trial days/);
    await expect(createCoupon(ctx(), { code: "BIG", kind: "flat", value: 5000, plans: ["starter"] })).rejects.toThrow(/more than the Essential/);
    await expect(createCoupon(ctx(), { code: "TRIALX", kind: "trial_days", value: 200 })).rejects.toThrow(/1 to 90/);
    expect(tables.ca_coupons).toHaveLength(0);
  });

  it("if Razorpay refuses, nothing is left half-made", async () => {
    const { createCoupon } = await import("@/lib/admin/admin.server");
    rzpFails = true;
    await expect(createCoupon(ctx(), { code: "SAVE20", kind: "percent", value: 20 })).rejects.toThrow(/Nothing was created/);
    expect(tables.ca_coupons).toHaveLength(0);
  });

  it("without payments connected the code is still created and says when the plans will be made", async () => {
    const { createCoupon } = await import("@/lib/admin/admin.server");
    delete process.env["RAZORPAY_KEY_ID"];
    const r = await createCoupon(ctx(), { code: "SAVE20", kind: "percent", value: 20 });
    expect(r.prepared).toBe(0);
    expect(r.warning).toContain("first time someone uses");
    expect(tables.ca_coupons).toHaveLength(1);
  });
});
