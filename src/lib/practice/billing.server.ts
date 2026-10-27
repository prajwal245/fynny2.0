/**
 * Billing: the 14-day trial, the gate on new work, and Razorpay Subscriptions.
 *
 * Razorpay needs these environment variables (all server-side):
 *   RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET      API keys (Dashboard → Account & Settings → API keys)
 *   RAZORPAY_WEBHOOK_SECRET                   the secret typed when adding the webhook
 * Optional:
 *   FYNHELP_GST_PERCENT                       GST added on top of list prices (default 18; list prices exclude GST)
 *   RAZORPAY_PLAN_{STARTER|PROFESSIONAL|SCALE}_{MONTHLY|ANNUAL}
 *                                             use an existing plan id instead of the one FynHelp creates
 * The six Razorpay plans are created on first use and remembered in
 * ca_billing_plans, per key (test and live keys have separate plans).
 * Without keys the trial still runs and pauses work at the end; the Billing
 * screen says payments are being set up.
 */
import { LAUNCH_CODE, LAUNCH_DAYS } from "@/lib/launchCode";
import type { Db, FirmContext } from "./db.server";
import { canSignOff, logActivity } from "./db.server";
import { sendEmail } from "./email.server";
import { assertNotTest, isTestFirm } from "./testMode.server";
import { PracticeError } from "./core";
import {
  accessFor,
  changeTiming,
  documentWarning,
  GST_PERCENT,
  couponAmountPaise,
  monthlyBill,
  TRIAL_DAYS,
  type BillBreakdown,
  type UsageWarning,
  PLANS,
  planAmountPaise,
  planEnvKey,
  refundWindowEnd,
  statusFromRazorpay,
  trialEndFrom,
  validGstin,
  type Access,
  type BillingRow,
  type Cycle,
  type PlanKey,
} from "./billing/plans";

// RAZORPAY_API_BASE exists only so tests can point at a stand-in Razorpay.
const API = process.env["RAZORPAY_API_BASE"] || "https://api.razorpay.com/v1";
const env = (k: string) => process.env[k] || undefined;
/** GST added on top of list prices (default 18%). */
export const gstPercent = () => {
  const v = Number(env("FYNHELP_GST_PERCENT") ?? GST_PERCENT);
  return Number.isFinite(v) && v >= 0 ? v : GST_PERCENT;
};

export interface BillingView extends BillingRow {
  access: Access;
  /** Razorpay keys and all six plan ids are set. */
  paymentsReady: boolean;
  /** Plans a partner can pick right now (their plan id is configured). */
  available: { plan: PlanKey; cycle: Cycle }[];
  hasSubscription: boolean;
  /** Cancelled by the firm; the plan runs to current_period_end and stops. */
  cancelAtPeriodEnd: boolean;
  /** A downgrade or cycle change waiting for the next renewal. */
  scheduled: { plan: PlanKey; cycle: Cycle } | null;
  billingName: string | null;
  billingGstin: string | null;
  /** Until when cancelling refunds the first annual payment in full. */
  refundUntil: string | null;
  /** This calendar month so far. */
  usage: { month: string; activeClients: number; documents: number };
  /** What this month comes to on the current plan (paid plans; the trial shows the Firm plan). */
  bill: BillBreakdown;
  warning: UsageWarning | null;
  activated: boolean;
  /** Extras billed for past months, newest first. */
  usageCharges: import("./billing/arrears.server").UsageChargeRow[];
  /** Lifecycle emails (tips, trial reminders) are on for this firm. */
  lifecycleEmails: boolean;
}

const COLS =
  "plan, cycle, status, trial_ends_at, current_period_end, trial_started_at, activated_at, razorpay_subscription_id, cancel_at_period_end, scheduled_plan, scheduled_cycle, billing_name, billing_gstin, first_payment_id, first_paid_at, first_paid_cycle, refund_used, trial_bonus_days";

type Row = BillingRow & {
  razorpay_subscription_id: string | null;
  cancel_at_period_end?: boolean | null;
  scheduled_plan?: PlanKey | null;
  scheduled_cycle?: Cycle | null;
  billing_name?: string | null;
  billing_gstin?: string | null;
  first_payment_id?: string | null;
  first_paid_at?: string | null;
  first_paid_cycle?: string | null;
  refund_used?: boolean | null;
  /** Days earned from referral rewards before the trial clock started. */
  trial_bonus_days?: number | null;
};

const FAR_FUTURE = "2099-12-31T00:00:00.000Z";

/** A test firm is always on a full plan with nothing to pay: every feature works, nothing is ever charged. */
function testFirmBilling(row: Row): Row {
  return { ...row, plan: "scale", cycle: "monthly", status: "active", trial_ends_at: FAR_FUTURE, current_period_end: FAR_FUTURE, cancel_at_period_end: false, razorpay_subscription_id: null, scheduled_plan: null, scheduled_cycle: null };
}

/** The firm's billing row, created on first use with a trial from the firm's sign-up. */
export async function loadBilling(db: Db, firmId: string): Promise<Row> {
  const { data } = await db.from("ca_billing").select(`${COLS}, ca_firms(is_test)`).eq("ca_firm_id", firmId).maybeSingle();
  if (data) {
    const { ca_firms: firm, ...row } = data as Row & { ca_firms?: { is_test?: boolean } | { is_test?: boolean }[] | null };
    const isTest = Array.isArray(firm) ? Boolean(firm[0]?.is_test) : Boolean(firm?.is_test);
    return isTest ? testFirmBilling(row as Row) : (row as Row);
  }
  if (await isTestFirm(db, firmId)) return testFirmBilling({ plan: "scale", cycle: "monthly", status: "active", trial_ends_at: FAR_FUTURE, current_period_end: FAR_FUTURE, razorpay_subscription_id: null });
  const { data: firm } = await db.from("ca_firms").select("created_at").eq("id", firmId).maybeSingle();
  const start = firm?.created_at ? new Date(String(firm.created_at)) : new Date();
  const row = { ca_firm_id: firmId, trial_ends_at: trialEndFrom(start).toISOString() };
  const { data: made, error } = await db.from("ca_billing").upsert(row, { onConflict: "ca_firm_id", ignoreDuplicates: true }).select(COLS).maybeSingle();
  if (error) console.error(`[billing] could not create billing row: ${error.message}`);
  if (made) return made as Row;
  const { data: again } = await db.from("ca_billing").select(COLS).eq("ca_firm_id", firmId).maybeSingle();
  return (again as Row) ?? { plan: "starter", cycle: "monthly", status: "trialing", trial_ends_at: row.trial_ends_at, current_period_end: null, razorpay_subscription_id: null };
}

function allPlans() {
  const out: { plan: PlanKey; cycle: Cycle }[] = [];
  for (const plan of Object.keys(PLANS) as PlanKey[]) for (const cycle of ["monthly", "annual"] as Cycle[]) out.push({ plan, cycle });
  return out;
}


interface RzpPlan {
  id: string;
  period: string;
  interval: number;
  item: { name: string; amount: number; currency: string };
  notes?: Record<string, string> | null;
}

/**
 * The Razorpay plan id for a plan and cycle: an env override, else the one
 * remembered for this key, else an existing matching plan in the Razorpay
 * account, else a new one created now.
 */
async function planIdFor(db: Db, plan: PlanKey, cycle: Cycle): Promise<string> {
  const override = env(planEnvKey(plan, cycle));
  if (override) return override;
  const keyId = env("RAZORPAY_KEY_ID") ?? "";
  const amount = planAmountPaise(plan, cycle, gstPercent());
  const { data: known } = await db
    .from("ca_billing_plans")
    .select("razorpay_plan_id")
    .eq("key_id", keyId)
    .eq("plan", plan)
    .eq("cycle", cycle)
    .eq("amount_paise", amount)
    .maybeSingle();
  if (known?.razorpay_plan_id) return String(known.razorpay_plan_id);
  const period = cycle === "annual" ? "yearly" : "monthly";
  const name = `FynHelp ${PLANS[plan].name} (${cycle === "annual" ? "yearly" : "monthly"})`;
  const list = await rzp<{ items?: RzpPlan[] }>("GET", "/plans?count=100");
  const found = (list.items ?? []).find(
    (p) => p.period === period && p.interval === 1 && p.item?.amount === amount && p.item?.currency === "INR" && p.notes?.fynhelp_plan === plan,
  );
  const made =
    found ??
    (await rzp<RzpPlan>("POST", "/plans", {
      period,
      interval: 1,
      item: { name, amount, currency: "INR", description: `${PLANS[plan].clientsIncluded} active clients included, unlimited users, GST extra` },
      notes: { fynhelp_plan: plan, cycle },
    }));
  await db
    .from("ca_billing_plans")
    .upsert({ key_id: keyId, plan, cycle, amount_paise: amount, razorpay_plan_id: made.id }, { onConflict: "key_id,plan,cycle,amount_paise" });
  return made.id;
}

export async function billingView(db: Db, ctx: FirmContext): Promise<BillingView> {
  const row = await loadBilling(db, ctx.firmId);
  const { usageFor } = await import("./billing/usage.server");
  const [usage, usageCharges, lifecycleEmails] = await Promise.all([
    usageFor(db, ctx.firmId),
    import("./billing/arrears.server").then((m) => m.recentUsageCharges(db, ctx.firmId)),
    import("./lifecycle/optout.server").then((m) => m.getLifecycleEmails(db, ctx.firmId)),
  ]);
  const planShown: PlanKey = row.status === "trialing" ? "professional" : row.plan;
  const available = env("RAZORPAY_KEY_ID") && env("RAZORPAY_KEY_SECRET") ? allPlans() : [];
  return {
    plan: row.plan,
    cycle: row.cycle,
    status: row.status,
    trial_ends_at: row.trial_ends_at,
    current_period_end: row.current_period_end,
    access: accessFor(row),
    paymentsReady: available.length === 6,
    available,
    hasSubscription: !!row.razorpay_subscription_id,
    cancelAtPeriodEnd: !!row.cancel_at_period_end,
    scheduled: row.scheduled_plan && row.scheduled_cycle ? { plan: row.scheduled_plan, cycle: row.scheduled_cycle } : null,
    billingName: row.billing_name ?? null,
    billingGstin: row.billing_gstin ?? null,
    refundUntil: row.status === "active" && !row.cancel_at_period_end ? (refundWindowEnd(row)?.toISOString() ?? null) : null,
    usage: { month: usage.month, activeClients: usage.activeClients, documents: usage.documents },
    bill: monthlyBill(planShown, row.cycle, usage, gstPercent()),
    warning: row.status === "trialing" ? null : documentWarning(row.plan, usage),
    activated: !!row.activated_at,
    usageCharges,
    lifecycleEmails,
  };
}

/** Which of our plans a Razorpay plan id is: env overrides first, then the plans FynHelp created. */
async function planFromPlanId(db: Db, planId: string | null | undefined): Promise<{ plan: PlanKey; cycle: Cycle } | null> {
  if (!planId) return null;
  for (const { plan, cycle } of allPlans()) if (env(planEnvKey(plan, cycle)) === planId) return { plan, cycle };
  const { data } = await db.from("ca_billing_plans").select("plan, cycle").eq("razorpay_plan_id", planId).limit(1).maybeSingle();
  return data ? { plan: data.plan as PlanKey, cycle: data.cycle as Cycle } : null;
}

/** Throws when the trial or plan has ended. Call before any new work. */
export async function assertCanWork(db: Db, firmId: string): Promise<void> {
  const a = accessFor(await loadBilling(db, firmId));
  if (!a.canWork) throw new PracticeError("billing_paused", a.reason ?? "New work is paused for this firm.");
}

/** Whether background jobs (Gmail, WhatsApp, follow-ups) should run for this firm. */
export async function firmCanWork(db: Db, firmId: string): Promise<boolean> {
  return accessFor(await loadBilling(db, firmId)).canWork;
}

/**
 * Adding a client is always allowed while the firm can work: plans count
 * active clients (worked on this month), not client entities.
 */
export async function assertClientRoom(db: Db, firmId: string): Promise<void> {
  await assertCanWork(db, firmId);
}

/** Throws before new work the firm's trial or plan limits do not cover. */
export async function assertWorkRoom(db: Db, firmId: string, work: { businessId: string | null; newDocument: boolean }): Promise<void> {
  const row = await loadBilling(db, firmId);
  const a = accessFor(row);
  if (!a.canWork) throw new PracticeError("billing_paused", a.reason ?? "New work is paused for this firm.");
  const { assertUsageRoom } = await import("./billing/usage.server");
  await assertUsageRoom(db, firmId, row, work, a);
}

/** The trial clock starts at the first document upload. */
export async function startTrialClock(db: Db, firmId: string, now: Date = new Date()): Promise<void> {
  const row = await loadBilling(db, firmId);
  if (row.status !== "trialing" || row.trial_started_at) return;
  await db
    .from("ca_billing")
    // A bonus earned before the first upload (a referral reward) is added to the 14 days, not lost.
    .update({ trial_started_at: now.toISOString(), trial_ends_at: new Date(now.getTime() + (TRIAL_DAYS + (row.trial_bonus_days ?? 0)) * 86_400_000).toISOString() })
    .eq("ca_firm_id", firmId)
    .is("trial_started_at", null);
}

/** One reconciliation run and one MIS on the firm's own data: recorded as a milestone; the trial stays 14 days. */
export async function checkTrialActivation(db: Db, firmId: string): Promise<boolean> {
  const row = await loadBilling(db, firmId);
  if (row.status !== "trialing" || row.activated_at || !row.trial_started_at) return false;
  const [recon, mis] = await Promise.all([
    db.from("ca_agent_runs").select("id", { count: "exact", head: true }).eq("ca_firm_id", firmId).eq("agent", "recon").eq("status", "succeeded"),
    db.from("ca_agent_runs").select("id", { count: "exact", head: true }).eq("ca_firm_id", firmId).eq("agent", "narrate").eq("status", "succeeded"),
  ]);
  if (!(recon.count ?? 0) || !(mis.count ?? 0)) return false;
  const { data } = await db
    .from("ca_billing")
    .update({ activated_at: new Date().toISOString() })
    .eq("ca_firm_id", firmId)
    .is("activated_at", null)
    .select("ca_firm_id")
    .maybeSingle();
  return !!data;
}

/* ── Razorpay ───────────────────────────────────────────────── */

function auth(): string {
  const id = env("RAZORPAY_KEY_ID");
  const secret = env("RAZORPAY_KEY_SECRET");
  if (!id || !secret) throw new PracticeError("payments_not_ready", "Online payments are being set up. Email support@fynhelp.com and we will activate your plan.");
  return "Basic " + btoa(`${id}:${secret}`);
}

async function rzp<T>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown,
  failMessage = "Razorpay could not start the payment. Try again in a minute, or email support@fynhelp.com.",
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: auth(), "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { description?: string } } & T;
  if (!res.ok) {
    console.error(`[billing] razorpay ${method} ${path} ${res.status}: ${json.error?.description ?? ""}`);
    throw new PracticeError("razorpay_error", failMessage);
  }
  return json;
}

interface RzpSubscription {
  id: string;
  status: string;
  plan_id: string;
  customer_id?: string | null;
  current_end?: number | null;
  notes?: Record<string, string> | null;
}

/**
 * The Razorpay plan for a plan, cycle and money coupon, made by FynHelp the first time it is needed and remembered.
 * It costs the discounted price with GST, and carries the coupon code in its name so it is recognisable in Razorpay.
 */
export async function discountedPlanId(db: Db, plan: PlanKey, cycle: Cycle, coupon: Pick<CouponRow, "code" | "kind" | "value">): Promise<string> {
  const amount = couponAmountPaise(plan, cycle, gstPercent(), coupon);
  if (!amount) throw new PracticeError("bad_coupon", "That code takes the price below ₹1 for this plan. Use it as a free-trial code instead.");
  const keyId = env("RAZORPAY_KEY_ID") ?? "";
  const { data: known } = await db.from("ca_billing_plans").select("razorpay_plan_id").eq("key_id", keyId).eq("plan", plan).eq("cycle", cycle).eq("amount_paise", amount).maybeSingle();
  if (known?.razorpay_plan_id) return String(known.razorpay_plan_id);
  const period = cycle === "annual" ? "yearly" : "monthly";
  const made = await rzp<RzpPlan>("POST", "/plans", {
    period,
    interval: 1,
    item: { name: `FynHelp ${PLANS[plan].name} (${period}) ${coupon.code}`.slice(0, 100), amount, currency: "INR", description: `${PLANS[plan].clientsIncluded} active clients included, unlimited users, GST extra. Code ${coupon.code}.` },
    notes: { fynhelp_plan: plan, cycle, coupon: coupon.code },
  });
  await db.from("ca_billing_plans").upsert({ key_id: keyId, plan, cycle, amount_paise: amount, razorpay_plan_id: made.id }, { onConflict: "key_id,plan,cycle,amount_paise" });
  return made.id;
}

/** Which Razorpay plan (and offer, for older codes) a checkout uses. */
export async function checkoutPlan(db: Db, plan: PlanKey, cycle: Cycle, coupon: CouponRow | null): Promise<{ planId: string; offerId: string | null }> {
  if (coupon && coupon.kind !== "trial_days") {
    if (coupon.razorpay_offer_id) return { planId: await planIdFor(db, plan, cycle), offerId: coupon.razorpay_offer_id };
    return { planId: await discountedPlanId(db, plan, cycle, coupon), offerId: null };
  }
  return { planId: await planIdFor(db, plan, cycle), offerId: null };
}

/**
 * Codes that give a discount on the first payment only: once the first payment is in, the subscription is moved back to the
 * normal plan from the next period. Tried again every hour until Razorpay accepts it (UPI mandates can take a day to activate).
 */
export async function settleCouponReverts(db: Db, firmId?: string): Promise<{ moved: number; waiting: number }> {
  let q = db.from("ca_billing").select("ca_firm_id, plan, cycle, status, razorpay_subscription_id").eq("coupon_revert_pending", true).not("razorpay_subscription_id", "is", null).limit(50);
  if (firmId) q = q.eq("ca_firm_id", firmId);
  const { data } = await q;
  let moved = 0;
  let waiting = 0;
  for (const r of data ?? []) {
    try {
      const planId = await planIdFor(db, r.plan as PlanKey, r.cycle as Cycle);
      await rzp("PATCH", `/subscriptions/${encodeURIComponent(String(r.razorpay_subscription_id))}`, { plan_id: planId, schedule_change_at: "cycle_end", customer_notify: 0 }, "Razorpay could not move the plan back yet.");
      await db.from("ca_billing").update({ coupon_revert_pending: false, updated_at: new Date().toISOString() }).eq("ca_firm_id", r.ca_firm_id);
      await db.from("ca_billing_events").insert({ id: `coupon_revert:${r.razorpay_subscription_id}`, event: "app.coupon_revert_scheduled", ca_firm_id: r.ca_firm_id, payload: { plan: r.plan, cycle: r.cycle } }).then(() => undefined);
      moved++;
    } catch (e) {
      waiting++;
      console.error(`[billing] coupon revert for ${r.ca_firm_id} waits: ${(e as Error).message}`);
    }
  }
  return { moved, waiting };
}

/**
 * Creates a Razorpay subscription for the chosen plan and returns what
 * Razorpay Checkout needs. The plan only changes once the payment is verified.
 */
export async function startCheckout(
  db: Db,
  ctx: FirmContext,
  plan: PlanKey,
  cycle: Cycle,
  details: { billingName?: string | null; gstin?: string | null; coupon?: string | null } = {},
) {
  await assertNotTest(db, ctx.firmId);
  if (!canSignOff(ctx)) throw new PracticeError("forbidden", "Only a partner can choose the firm's plan.");
  auth(); // says "payments are being set up" when the keys are missing
  const row = await loadBilling(db, ctx.firmId);
  if (row.razorpay_subscription_id && ["pending", "active", "past_due"].includes(row.status))
    throw new PracticeError("has_plan", "This firm already has a plan. Use Change plan below to switch it.");
  const gstin = details.gstin?.trim().toUpperCase() || null;
  if (gstin && !validGstin(gstin)) throw new PracticeError("bad_gstin", "That GSTIN does not look right. It has 15 characters, like 29ABCDE1234F1Z5. Leave it blank if the firm is not registered.");
  const billingName = details.billingName?.trim().slice(0, 120) || row.billing_name || ctx.firmName;
  const coupon = details.coupon?.trim() ? await checkCoupon(db, ctx.firmId, details.coupon, plan, cycle) : null;
  if (coupon?.kind === "trial_days") throw new PracticeError("trial_code", "That code adds free trial days. Apply it on its own, before choosing a plan.");
  const { planId, offerId } = await checkoutPlan(db, plan, cycle, coupon);
  // A Razorpay customer carries the GSTIN and name onto every invoice Razorpay sends.
  let customerId: string | undefined;
  if (ctx.firmEmail) {
    const customer = await rzp<{ id: string }>("POST", "/customers", {
      name: billingName,
      email: ctx.firmEmail,
      fail_existing: 0,
      ...(gstin ? { gstin } : {}),
      notes: { firm_id: ctx.firmId },
    }).catch(() => null);
    customerId = customer?.id;
  }
  const sub = await rzp<RzpSubscription & { short_url?: string }>("POST", "/subscriptions", {
    plan_id: planId,
    // Razorpay needs a number of billing cycles: ten years either way.
    total_count: cycle === "annual" ? 10 : 120,
    customer_notify: 1,
    ...(customerId ? { customer_id: customerId } : {}),
    ...(offerId ? { offer_id: offerId } : {}),
    notes: { firm_id: ctx.firmId, plan, cycle, billing_name: billingName, ...(gstin ? { gstin } : {}), ...(coupon ? { coupon: coupon.code } : {}) },
  });
  await db
    .from("ca_billing")
    .update({
      razorpay_subscription_id: sub.id,
      pending_plan: plan,
      pending_cycle: cycle,
      billing_name: billingName,
      billing_gstin: gstin,
      coupon_code: coupon?.code ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("ca_firm_id", ctx.firmId);
  return {
    keyId: env("RAZORPAY_KEY_ID")!,
    subscriptionId: sub.id,
    firmName: ctx.firmName,
    planName: `${PLANS[plan].name}, ${cycle === "annual" ? "yearly" : "monthly"}`,
  };
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Signature Checkout returns for a subscription payment: HMAC(payment_id|subscription_id, key secret). */
export async function checkoutSignatureValid(paymentId: string, subscriptionId: string, signature: string, secret: string) {
  return sameText(await hmacHex(secret, `${paymentId}|${subscriptionId}`), signature.toLowerCase());
}

/** Signature on webhook deliveries: HMAC(raw body, webhook secret). */
export async function webhookSignatureValid(rawBody: string, signature: string | null, secret: string) {
  if (!signature) return false;
  return sameText(await hmacHex(secret, rawBody), signature.toLowerCase());
}

async function applySubscription(db: Db, firmId: string, sub: RzpSubscription) {
  const status = statusFromRazorpay(sub.status);
  if (!status) return;
  const { data: row } = await db
    .from("ca_billing")
    .select("pending_plan, pending_cycle, plan, cycle, scheduled_plan, scheduled_cycle, current_period_end")
    .eq("ca_firm_id", firmId)
    .maybeSingle();
  const notes = sub.notes ?? {};
  // The plan id is the truth after a switch; the checkout notes never change.
  const fromId = await planFromPlanId(db, sub.plan_id);
  const plan = fromId?.plan || (notes.plan as PlanKey) || row?.pending_plan || row?.plan || "starter";
  const cycle = fromId?.cycle || (notes.cycle as Cycle) || row?.pending_cycle || row?.cycle || "monthly";
  const switched = row?.scheduled_plan === plan && row?.scheduled_cycle === cycle;
  await db
    .from("ca_billing")
    .update({
      status,
      plan,
      cycle,
      razorpay_subscription_id: sub.id,
      ...(sub.customer_id ? { razorpay_customer_id: sub.customer_id } : {}),
      // A cancelled subscription may come back without an end date: keep the one we had.
      current_period_end: sub.current_end ? new Date(sub.current_end * 1000).toISOString() : (row?.current_period_end ?? null),
      ...(switched ? { scheduled_plan: null, scheduled_cycle: null } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("ca_firm_id", firmId);
}

/** Called by the app right after Checkout succeeds, so the plan shows at once. */
export async function confirmCheckout(
  db: Db,
  ctx: FirmContext,
  p: { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string },
) {
  if (!canSignOff(ctx)) throw new PracticeError("forbidden", "Only a partner can choose the firm's plan.");
  const secret = env("RAZORPAY_KEY_SECRET");
  if (!secret) throw new PracticeError("payments_not_ready", "Online payments are being set up.");
  const row = await loadBilling(db, ctx.firmId);
  if (row.razorpay_subscription_id !== p.razorpay_subscription_id)
    throw new PracticeError("mismatch", "This payment is not for this firm's plan. Email support@fynhelp.com.");
  if (!(await checkoutSignatureValid(p.razorpay_payment_id, p.razorpay_subscription_id, p.razorpay_signature, secret)))
    throw new PracticeError("bad_signature", "The payment could not be verified. If money was taken, email support@fynhelp.com and we will sort it out.");
  const sub = await rzp<RzpSubscription>("GET", `/subscriptions/${encodeURIComponent(p.razorpay_subscription_id)}`);
  await applySubscription(db, ctx.firmId, { ...sub, status: statusFromRazorpay(sub.status) ? sub.status : "authenticated" });
  // A fresh plan starts clean; the first payment opens the 7-day annual refund window once.
  const fresh = await loadBilling(db, ctx.firmId);
  await db
    .from("ca_billing")
    .update({
      cancel_at_period_end: false,
      cancel_requested_at: null,
      scheduled_plan: null,
      scheduled_cycle: null,
      renewal_reminded_for: null,
      ...(fresh.first_payment_id
        ? {}
        : { first_payment_id: p.razorpay_payment_id, first_paid_at: new Date().toISOString(), first_paid_cycle: fresh.cycle }),
    })
    .eq("ca_firm_id", ctx.firmId);
  const { data: withCode } = await db.from("ca_billing").select("coupon_code").eq("ca_firm_id", ctx.firmId).maybeSingle();
  if (withCode?.coupon_code)
    await db.from("ca_coupon_redemptions").insert({ code: withCode.coupon_code, ca_firm_id: ctx.firmId, subscription_id: p.razorpay_subscription_id, plan: fresh.plan, cycle: fresh.cycle });
  if (withCode?.coupon_code) {
    // A first-payment code that FynHelp applied itself: the plan goes back to the normal price after this period.
    const { data: used } = await db.from("ca_coupons").select("kind, razorpay_offer_id, duration").eq("code", withCode.coupon_code).maybeSingle();
    if (used && isAutoCoupon(used as CouponRow) && used.duration !== "forever") {
      await db.from("ca_billing").update({ coupon_revert_pending: true }).eq("ca_firm_id", ctx.firmId);
      await settleCouponReverts(db, ctx.firmId).catch(() => undefined);
    }
  }
  await logActivity(db, ctx.firmId, null, "system", `Plan started: ${PLANS[fresh.plan].name}, ${fresh.cycle === "annual" ? "yearly" : "monthly"} (payment ${p.razorpay_payment_id}).`);
  return billingView(db, ctx);
}

/** Webhook: keeps the plan in step with Razorpay (renewals, failures, cancellations). */
export async function handleRazorpayWebhook(
  db: Db,
  eventId: string,
  payload: {
    event?: string;
    payload?: {
      subscription?: { entity?: RzpSubscription };
      invoice?: { entity?: { id?: string; notes?: Record<string, string> | null } };
      payment?: { entity?: { id?: string; order_id?: string | null } };
      order?: { entity?: { id?: string; notes?: Record<string, string> | null } };
    };
  },
) {
  const sub = payload.payload?.subscription?.entity;
  const invoice = payload.payload?.invoice?.entity;
  // A paid credits order: add the credits even if the browser closed before it could confirm.
  const order = payload.payload?.order?.entity;
  const payment = payload.payload?.payment?.entity;
  if (payload.event === "order.paid" && order?.id && order.notes?.kind === "credits" && payment?.id) {
    const { error: seen } = await db.from("ca_billing_events").insert({ id: eventId, event: payload.event, ca_firm_id: order.notes.firm_id ?? null, payload });
    if (seen) return { duplicate: true };
    const done = await (await import("./billing/credits.server")).grantPaidOrder(db, order.id, payment.id);
    return { duplicate: false, firmId: done?.firmId ?? null };
  }
  let firmId: string | null = sub?.notes?.firm_id ?? (invoice?.notes?.kind === "usage" ? (invoice.notes.firm_id ?? null) : null);
  if (!firmId && sub?.id) {
    const { data } = await db.from("ca_billing").select("ca_firm_id").eq("razorpay_subscription_id", sub.id).maybeSingle();
    firmId = (data?.ca_firm_id as string) ?? null;
  }
  const { error: dup } = await db
    .from("ca_billing_events")
    .insert({ id: eventId, event: payload.event ?? "unknown", ca_firm_id: firmId, payload });
  if (dup) return { duplicate: true };
  if (sub && firmId) {
    // Only trust the subscription this firm actually started.
    const { data: row } = await db.from("ca_billing").select("razorpay_subscription_id").eq("ca_firm_id", firmId).maybeSingle();
    if (!row?.razorpay_subscription_id || row.razorpay_subscription_id === sub.id) await applySubscription(db, firmId, sub);
  }
  // Usage extras: a paid usage invoice, or add-ons settled by a subscription payment.
  if (payload.event === "invoice.paid" && invoice?.id && invoice.notes?.kind === "usage")
    await (await import("./billing/arrears.server")).markUsagePaid(db, { invoiceId: invoice.id });
  if (payload.event === "subscription.charged" && firmId)
    await (await import("./billing/arrears.server")).markUsagePaid(db, { firmId, subscriptionCharged: true });
  return { duplicate: false, firmId };
}

/* ── changes after checkout ─────────────────────────────────── */

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "the end of the period";
const planLabel = (plan: PlanKey, cycle: Cycle) => `${PLANS[plan].name}, ${cycle === "annual" ? "yearly" : "monthly"}`;

async function billingMail(ctx: FirmContext, subject: string, lines: string[]) {
  if (!ctx.firmEmail) return;
  const text = [...lines, "", "Questions about billing: billing@fynhelp.com", "Refund and Cancellation Policy: https://fynhelp.com/refund-policy"].join("\n");
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.6;color:#141414">${lines.map((l) => `<p>${esc(l)}</p>`).join("")}<p style="color:#666;font-size:13px">Questions about billing: <a href="mailto:billing@fynhelp.com">billing@fynhelp.com</a> · <a href="https://fynhelp.com/refund-policy">Refund and Cancellation Policy</a></p></div>`;
  await sendEmail({ to: ctx.firmEmail, subject, text, html }).catch((e) => console.error(`[billing] email failed: ${(e as Error).message}`));
}

function requireLivePlan(row: Row) {
  if (!row.razorpay_subscription_id || !["pending", "active", "past_due"].includes(row.status))
    throw new PracticeError("no_plan", "This firm is not on a paid plan.");
}

/**
 * Cancels the firm's plan (Refund and Cancellation Policy, clause 6). Within
 * seven days of a first annual payment the plan stops now and the payment is
 * refunded in full (clause 4.2); otherwise it runs to the end of the period
 * already paid for and does not renew.
 */
export async function cancelSubscription(db: Db, ctx: FirmContext, reason: string) {
  await assertNotTest(db, ctx.firmId);
  if (!canSignOff(ctx)) throw new PracticeError("forbidden", "Only a partner can cancel the firm's plan.");
  const row = await loadBilling(db, ctx.firmId);
  requireLivePlan(row);
  if (row.cancel_at_period_end) throw new PracticeError("already_cancelled", `The plan is already cancelled and ends on ${fmtDate(row.current_period_end)}.`);
  const subId = encodeURIComponent(row.razorpay_subscription_id!);
  const fail = "Razorpay could not cancel the plan just now. Try again in a minute, or email billing@fynhelp.com and we will cancel it for you.";
  const now = new Date().toISOString();
  const note = reason.trim().slice(0, 500);
  const refundable = row.status === "active" && refundWindowEnd(row) !== null;

  if (refundable || row.status === "pending") {
    await rzp("POST", `/subscriptions/${subId}/cancel`, { cancel_at_cycle_end: 0 }, fail);
    let refundId: string | null = null;
    if (refundable) {
      const refund = await rzp<{ id: string }>(
        "POST",
        `/payments/${encodeURIComponent(row.first_payment_id!)}/refund`,
        { speed: "normal", notes: { firm_id: ctx.firmId, reason: "Cancelled within 30 days of the first annual payment" } },
        "The plan is cancelled, but Razorpay could not start the refund. We have been told and will refund you in full within 3 business days.",
      ).catch(async (e) => {
        await db.from("ca_billing").update({ status: "cancelled", current_period_end: now, cancel_requested_at: now, updated_at: now }).eq("ca_firm_id", ctx.firmId);
        await sendEmail({ to: "billing@fynhelp.com", subject: `Refund needed: ${ctx.firmName}`, text: `Razorpay refund failed for payment ${row.first_payment_id} (firm ${ctx.firmId}). Refund it by hand.`, html: `<p>Razorpay refund failed for payment ${row.first_payment_id} (firm ${ctx.firmId}). Refund it by hand.</p>` }).catch(() => null);
        throw e;
      });
      refundId = refund.id;
    }
    await db
      .from("ca_billing")
      .update({ status: "cancelled", current_period_end: now, cancel_requested_at: now, cancel_at_period_end: false, refund_used: refundable ? true : row.refund_used ?? false, updated_at: now })
      .eq("ca_firm_id", ctx.firmId);
    await db.from("ca_billing_events").insert({ id: `cancel:${row.razorpay_subscription_id}:${Date.now()}`, event: refundable ? "app.cancelled_refunded" : "app.cancelled", ca_firm_id: ctx.firmId, payload: { by: ctx.userId, reason: note, refund_id: refundId } });
    await logActivity(db, ctx.firmId, null, "system", `Plan cancelled${refundable ? " with a full refund of the first annual payment" : ""}.${note ? ` Reason: ${note}` : ""}`);
    await billingMail(ctx, "Your FynHelp plan is cancelled", [
      `Hello ${ctx.firmName},`,
      refundable
        ? `Your ${planLabel(row.plan, row.cycle)} plan is cancelled and your first annual payment is being refunded in full to the card or account you paid from${refundId ? ` (Razorpay refund ${refundId})` : ""}. Banks usually credit it within 5 to 7 business days. A GST credit note follows separately.`
        : `Your ${planLabel(row.plan, row.cycle)} plan is cancelled. No payment was taken for it.`,
      "Your data stays available to view and export for 30 days.",
    ]);
    return { view: await billingView(db, ctx), refunded: refundable, refundId };
  }

  await rzp("POST", `/subscriptions/${subId}/cancel`, { cancel_at_cycle_end: 1 }, fail);
  await db
    .from("ca_billing")
    .update({ cancel_at_period_end: true, cancel_requested_at: now, scheduled_plan: null, scheduled_cycle: null, updated_at: now })
    .eq("ca_firm_id", ctx.firmId);
  await db.from("ca_billing_events").insert({ id: `cancel:${row.razorpay_subscription_id}:${Date.now()}`, event: "app.cancel_at_period_end", ca_firm_id: ctx.firmId, payload: { by: ctx.userId, reason: note } });
  await logActivity(db, ctx.firmId, null, "system", `Plan cancelled; it runs until ${fmtDate(row.current_period_end)} and will not renew.${note ? ` Reason: ${note}` : ""}`);
  await billingMail(ctx, "Your FynHelp plan will not renew", [
    `Hello ${ctx.firmName},`,
    `Your ${planLabel(row.plan, row.cycle)} plan is cancelled. You keep full access until ${fmtDate(row.current_period_end)}, and you will not be charged again.`,
    "After that, your data stays available to view and export for 30 days.",
  ]);
  return { view: await billingView(db, ctx), refunded: false, refundId: null };
}

/**
 * Switches plan (clause 5): a higher plan at once, with Razorpay charging the
 * pro-rated difference; a lower plan or another cycle from the next renewal.
 */
export async function changePlan(db: Db, ctx: FirmContext, plan: PlanKey, cycle: Cycle) {
  await assertNotTest(db, ctx.firmId);
  if (!canSignOff(ctx)) throw new PracticeError("forbidden", "Only a partner can change the firm's plan.");
  const row = await loadBilling(db, ctx.firmId);
  requireLivePlan(row);
  if (row.cancel_at_period_end) throw new PracticeError("cancelled", `The plan is cancelled and ends on ${fmtDate(row.current_period_end)}. Choose a new plan after that date, or email billing@fynhelp.com to keep the current one.`);
  const timing = changeTiming({ plan: row.plan, cycle: row.cycle }, { plan, cycle });
  if (timing === "same") throw new PracticeError("same_plan", "The firm is already on this plan.");
  const planId = await planIdFor(db, plan, cycle);
  const sub = await rzp<RzpSubscription>(
    "PATCH",
    `/subscriptions/${encodeURIComponent(row.razorpay_subscription_id!)}`,
    { plan_id: planId, schedule_change_at: timing === "now" ? "now" : "cycle_end", customer_notify: 1 },
    "Razorpay could not switch this plan online. This happens with UPI and some bank mandates. Email billing@fynhelp.com and we will switch it for you.",
  );
  const now = new Date().toISOString();
  if (timing === "now") {
    await db.from("ca_billing").update({ scheduled_plan: null, scheduled_cycle: null, updated_at: now }).eq("ca_firm_id", ctx.firmId);
    await applySubscription(db, ctx.firmId, { ...sub, plan_id: sub.plan_id || planId });
  } else {
    await db.from("ca_billing").update({ scheduled_plan: plan, scheduled_cycle: cycle, updated_at: now }).eq("ca_firm_id", ctx.firmId);
  }
  const what =
    timing === "now"
      ? `Your plan is now ${planLabel(plan, cycle)}. Razorpay charges only the pro-rated difference for the rest of the current period.`
      : `Your plan changes to ${planLabel(plan, cycle)} from ${fmtDate(row.current_period_end)}. Until then you stay on ${planLabel(row.plan, row.cycle)}, and nothing is refunded for the switch.`;
  await logActivity(db, ctx.firmId, null, "system", what);
  await billingMail(ctx, "Your FynHelp plan change", [`Hello ${ctx.firmName},`, what]);
  return { view: await billingView(db, ctx), timing };
}

export interface PaymentRow {
  id: string;
  date: string | null;
  amount: number;
  status: string;
  url: string | null;
}

/** Razorpay invoices for the firm's plan, newest first. Empty when there is no plan or Razorpay is unreachable. */
export async function paymentHistory(db: Db, ctx: FirmContext): Promise<PaymentRow[]> {
  if (!canSignOff(ctx)) return [];
  const row = await loadBilling(db, ctx.firmId);
  if (!row.razorpay_subscription_id || !env("RAZORPAY_KEY_ID")) return [];
  const list = await rzp<{ items?: { id: string; status: string; amount: number; amount_paid?: number; paid_at?: number | null; issued_at?: number | null; date?: number | null; short_url?: string | null }[] }>(
    "GET",
    `/invoices?subscription_id=${encodeURIComponent(row.razorpay_subscription_id)}&count=24`,
  ).catch(() => ({ items: [] }));
  return (list.items ?? [])
    .map((i) => {
      const at = i.paid_at || i.issued_at || i.date;
      return { id: i.id, date: at ? new Date(at * 1000).toISOString() : null, amount: (i.amount_paid || i.amount || 0) / 100, status: i.status, url: i.short_url ?? null };
    })
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

/**
 * Annual renewal reminders (clause 4.4): one email at least seven days before
 * each yearly renewal. Runs from the practice heartbeat.
 */
export async function sendRenewalReminders(db: Db, now: Date = new Date()) {
  const soon = new Date(now.getTime() + 8 * 86_400_000).toISOString();
  const { data } = await db
    .from("ca_billing")
    .select("ca_firm_id, plan, cycle, current_period_end, renewal_reminded_for, ca_firms(firm_name, email)")
    .eq("status", "active")
    .eq("cycle", "annual")
    .eq("cancel_at_period_end", false)
    .gt("current_period_end", now.toISOString())
    .lte("current_period_end", soon)
    .limit(200);
  let sent = 0;
  for (const r of (data ?? []) as unknown as { ca_firm_id: string; plan: PlanKey; cycle: Cycle; current_period_end: string; renewal_reminded_for: string | null; ca_firms: { firm_name: string; email: string | null } | null }[]) {
    if (r.renewal_reminded_for && new Date(r.renewal_reminded_for).getTime() === new Date(r.current_period_end).getTime()) continue;
    const firm = r.ca_firms;
    if (firm?.email) {
      const amount = planAmountPaise(r.plan, r.cycle, gstPercent()) / 100;
      await billingMail({ firmId: r.ca_firm_id, firmName: firm.firm_name, firmEmail: firm.email, userId: "", role: "owner" }, "Your FynHelp plan renews soon", [
        `Hello ${firm.firm_name},`,
        `Your ${planLabel(r.plan, r.cycle)} plan renews on ${fmtDate(r.current_period_end)} for ₹${amount.toLocaleString("en-IN")} including GST.`,
        "Nothing to do if you want to continue. To stop the renewal, a partner can cancel in Settings, Billing before that date.",
      ]);
      sent++;
    }
    await db.from("ca_billing").update({ renewal_reminded_for: r.current_period_end }).eq("ca_firm_id", r.ca_firm_id);
  }
  return { sent };
}

/* ── coupons ─────────────────────────────────────────────────── */

export interface CouponRow {
  code: string;
  kind: "percent" | "flat" | "trial_days";
  value: number;
  razorpay_offer_id: string | null;
  plans: string[] | null;
  cycles: string[] | null;
  expires_at: string | null;
  max_redemptions: number | null;
  per_firm_limit: number;
  active: boolean;
  /** Money codes made without a Razorpay offer: the discount applies to "first" payment only or "forever". */
  duration?: "first" | "forever";
}

/** A money code that FynHelp applies itself, through a discounted Razorpay plan, instead of a hand-made Razorpay offer. */
export const isAutoCoupon = (c: Pick<CouponRow, "kind" | "razorpay_offer_id"> | null | undefined): boolean =>
  !!c && c.kind !== "trial_days" && !c.razorpay_offer_id;

/** A code this firm may use now, for this plan and cycle (if given). */
export async function checkCoupon(db: Db, firmId: string, raw: string, plan?: PlanKey, cycle?: Cycle): Promise<CouponRow> {
  const code = raw.trim().toUpperCase();
  const { data } = await db.from("ca_coupons").select("*").eq("code", code).maybeSingle();
  const c = data as CouponRow | null;
  const bad = (m: string) => new PracticeError("bad_coupon", m);
  if (!c || !c.active) throw bad("That code is not valid.");
  if (c.expires_at && new Date(c.expires_at).getTime() < Date.now()) throw bad("That code has expired.");
  if (plan && c.plans?.length && !c.plans.includes(plan)) throw bad(`That code does not apply to ${PLANS[plan].name}.`);
  if (cycle && c.cycles?.length && !c.cycles.includes(cycle)) throw bad(`That code applies only to ${c.cycles.includes("annual") ? "yearly" : "monthly"} billing.`);
  const { count: total } = await db.from("ca_coupon_redemptions").select("id", { count: "exact", head: true }).eq("code", code);
  if (c.max_redemptions && (total ?? 0) >= c.max_redemptions) throw bad("That code has been fully used.");
  const { count: mine } = await db.from("ca_coupon_redemptions").select("id", { count: "exact", head: true }).eq("code", code).eq("ca_firm_id", firmId);
  if ((mine ?? 0) >= c.per_firm_limit) throw bad("Your firm has already used that code.");
  return c;
}

export function describeCoupon(c: CouponRow): string {
  if (c.kind === "trial_days") return `${c.value} more days of free trial`;
  const what = c.kind === "percent" ? `${c.value}% off` : `₹${Number(c.value).toLocaleString("en-IN")} off`;
  // Older codes made with a Razorpay offer say nothing about how long; codes made in the admin panel do.
  return isAutoCoupon(c) ? `${what} ${c.duration === "forever" ? "every payment" : "your first payment"}` : what;
}

export async function previewCoupon(db: Db, ctx: FirmContext, code: string, plan?: PlanKey, cycle?: Cycle) {
  const c = await checkCoupon(db, ctx.firmId, code, plan, cycle);
  return { code: c.code, kind: c.kind, description: describeCoupon(c), plans: c.plans, cycles: c.cycles };
}

/** A trial-days code: adds days to a running or ended trial, no payment. */
export async function redeemTrialCoupon(db: Db, ctx: FirmContext, code: string) {
  await assertNotTest(db, ctx.firmId);
  if (!canSignOff(ctx)) throw new PracticeError("forbidden", "Only a partner can apply a code.");
  // The launch offer is part of the product, so it exists without anyone running SQL: created on first use, never changed after.
  if (code.trim().toUpperCase() === LAUNCH_CODE)
    await db.from("ca_coupons").upsert(
      { code: LAUNCH_CODE, kind: "trial_days", value: LAUNCH_DAYS - TRIAL_DAYS, max_redemptions: 100, per_firm_limit: 1, active: true, note: "Launch offer: 30 days free for the first 100 firms." },
      { onConflict: "code", ignoreDuplicates: true },
    );
  const c = await checkCoupon(db, ctx.firmId, code);
  if (c.kind !== "trial_days") throw new PracticeError("bad_coupon", "That code is a discount. Enter it when you choose a plan.");
  const row = await loadBilling(db, ctx.firmId);
  if (row.status !== "trialing") throw new PracticeError("bad_coupon", "Trial codes apply only during or right after the free trial.");
  if (!row.trial_started_at) {
    // The clock has not started (it starts at the first upload): the days wait and are added to the 14 then.
    await db.from("ca_billing").update({ trial_bonus_days: (row.trial_bonus_days ?? 0) + Number(c.value), updated_at: new Date().toISOString() }).eq("ca_firm_id", ctx.firmId);
    await db.from("ca_coupon_redemptions").insert({ code: c.code, ca_firm_id: ctx.firmId });
    await logActivity(db, ctx.firmId, null, "system", `Code ${c.code} applied: ${c.value} extra free days, added when the trial starts with the first upload.`);
    return billingView(db, ctx);
  }
  const from = Math.max(Date.now(), new Date(row.trial_ends_at).getTime());
  const ends = new Date(from + Number(c.value) * 86_400_000).toISOString();
  await db.from("ca_billing").update({ trial_ends_at: ends, updated_at: new Date().toISOString() }).eq("ca_firm_id", ctx.firmId);
  await db.from("ca_coupon_redemptions").insert({ code: c.code, ca_firm_id: ctx.firmId });
  await logActivity(db, ctx.firmId, null, "system", `Code ${c.code} applied: free trial extended to ${fmtDate(ends)}.`);
  return billingView(db, ctx);
}

/** Razorpay API for the admin panel (refunds, lookups). */
export const razorpayApi = rzp;
/** Razorpay keys are set, so charges can be created. */
export const razorpayReady = () => Boolean(env("RAZORPAY_KEY_ID") && env("RAZORPAY_KEY_SECRET"));
