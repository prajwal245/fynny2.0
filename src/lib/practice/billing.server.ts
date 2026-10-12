/**
 * Billing: the 14-day trial, the gate on new work, and Razorpay Subscriptions.
 *
 * Razorpay needs these environment variables (all server-side):
 *   RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET      API keys (Dashboard → Account & Settings → API keys)
 *   RAZORPAY_WEBHOOK_SECRET                   the secret typed when adding the webhook
 *   RAZORPAY_PLAN_{STARTER|PROFESSIONAL|SCALE}_{MONTHLY|ANNUAL}
 *                                             plan ids (plan_...) created in Subscriptions → Plans
 * Without them the trial still runs and pauses work at the end; the Billing
 * screen says payments are being set up.
 */
import type { Db, FirmContext } from "./db.server";
import { canSignOff } from "./db.server";
import { PracticeError } from "./core";
import {
  accessFor,
  PLANS,
  planEnvKey,
  statusFromRazorpay,
  trialEndFrom,
  type Access,
  type BillingRow,
  type Cycle,
  type PlanKey,
} from "./billing/plans";

// RAZORPAY_API_BASE exists only so tests can point at a stand-in Razorpay.
const API = process.env["RAZORPAY_API_BASE"] || "https://api.razorpay.com/v1";
const env = (k: string) => process.env[k] || undefined;

export interface BillingView extends BillingRow {
  access: Access;
  /** Razorpay keys and all six plan ids are set. */
  paymentsReady: boolean;
  /** Plans a partner can pick right now (their plan id is configured). */
  available: { plan: PlanKey; cycle: Cycle }[];
  hasSubscription: boolean;
}

const COLS = "plan, cycle, status, trial_ends_at, current_period_end, razorpay_subscription_id";

type Row = BillingRow & { razorpay_subscription_id: string | null };

/** The firm's billing row, created on first use with a trial from the firm's sign-up. */
export async function loadBilling(db: Db, firmId: string): Promise<Row> {
  const { data } = await db.from("ca_billing").select(COLS).eq("ca_firm_id", firmId).maybeSingle();
  if (data) return data as Row;
  const { data: firm } = await db.from("ca_firms").select("created_at").eq("id", firmId).maybeSingle();
  const start = firm?.created_at ? new Date(String(firm.created_at)) : new Date();
  const row = { ca_firm_id: firmId, trial_ends_at: trialEndFrom(start).toISOString() };
  const { data: made, error } = await db.from("ca_billing").upsert(row, { onConflict: "ca_firm_id", ignoreDuplicates: true }).select(COLS).maybeSingle();
  if (error) console.error(`[billing] could not create billing row: ${error.message}`);
  if (made) return made as Row;
  const { data: again } = await db.from("ca_billing").select(COLS).eq("ca_firm_id", firmId).maybeSingle();
  return (again as Row) ?? { plan: "starter", cycle: "monthly", status: "trialing", trial_ends_at: row.trial_ends_at, current_period_end: null, razorpay_subscription_id: null };
}

function configuredPlans() {
  const out: { plan: PlanKey; cycle: Cycle }[] = [];
  for (const plan of Object.keys(PLANS) as PlanKey[])
    for (const cycle of ["monthly", "annual"] as Cycle[]) if (env(planEnvKey(plan, cycle))) out.push({ plan, cycle });
  return out;
}

export async function billingView(db: Db, ctx: FirmContext): Promise<BillingView> {
  const row = await loadBilling(db, ctx.firmId);
  const available = env("RAZORPAY_KEY_ID") && env("RAZORPAY_KEY_SECRET") ? configuredPlans() : [];
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
  };
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

/** Throws when adding one more client would pass the plan's limit. */
export async function assertClientRoom(db: Db, firmId: string): Promise<void> {
  const row = await loadBilling(db, firmId);
  const a = accessFor(row);
  if (!a.canWork) throw new PracticeError("billing_paused", a.reason ?? "New work is paused for this firm.");
  if (a.maxClients == null) return;
  const { count } = await db.from("ca_clients").select("id", { count: "exact", head: true }).eq("ca_firm_id", firmId);
  if ((count ?? 0) >= a.maxClients)
    throw new PracticeError(
      "client_limit",
      a.state === "trial"
        ? `The free trial covers up to ${a.maxClients} clients. Choose a plan in Settings, Billing to add more.`
        : `Your plan covers up to ${a.maxClients} clients. Move to Professional in Settings, Billing to add more.`,
    );
}

/* ── Razorpay ───────────────────────────────────────────────── */

function auth(): string {
  const id = env("RAZORPAY_KEY_ID");
  const secret = env("RAZORPAY_KEY_SECRET");
  if (!id || !secret) throw new PracticeError("payments_not_ready", "Online payments are being set up. Email support@fynhelp.com and we will activate your plan.");
  return "Basic " + btoa(`${id}:${secret}`);
}

async function rzp<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: auth(), "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { description?: string } } & T;
  if (!res.ok) {
    console.error(`[billing] razorpay ${method} ${path} ${res.status}: ${json.error?.description ?? ""}`);
    throw new PracticeError("razorpay_error", "Razorpay could not start the payment. Try again in a minute, or email support@fynhelp.com.");
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
 * Creates a Razorpay subscription for the chosen plan and returns what
 * Razorpay Checkout needs. The plan only changes once the payment is verified.
 */
export async function startCheckout(db: Db, ctx: FirmContext, plan: PlanKey, cycle: Cycle) {
  if (!canSignOff(ctx)) throw new PracticeError("forbidden", "Only a partner can choose the firm's plan.");
  const planId = env(planEnvKey(plan, cycle));
  if (!planId) throw new PracticeError("payments_not_ready", "This plan cannot be bought online yet. Email support@fynhelp.com and we will activate it.");
  const row = await loadBilling(db, ctx.firmId);
  if (row.razorpay_subscription_id && ["pending", "active", "past_due"].includes(row.status))
    throw new PracticeError("has_plan", "This firm already has a plan. To change it, email support@fynhelp.com and we will switch it for you.");
  const sub = await rzp<RzpSubscription & { short_url?: string }>("POST", "/subscriptions", {
    plan_id: planId,
    // Razorpay needs a number of billing cycles: ten years either way.
    total_count: cycle === "annual" ? 10 : 120,
    customer_notify: 1,
    notes: { firm_id: ctx.firmId, plan, cycle },
  });
  await db
    .from("ca_billing")
    .update({ razorpay_subscription_id: sub.id, pending_plan: plan, pending_cycle: cycle, updated_at: new Date().toISOString() })
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
  const { data: row } = await db.from("ca_billing").select("pending_plan, pending_cycle, plan, cycle").eq("ca_firm_id", firmId).maybeSingle();
  const notes = sub.notes ?? {};
  const plan = (notes.plan as PlanKey) || row?.pending_plan || row?.plan || "starter";
  const cycle = (notes.cycle as Cycle) || row?.pending_cycle || row?.cycle || "monthly";
  await db
    .from("ca_billing")
    .update({
      status,
      plan,
      cycle,
      razorpay_subscription_id: sub.id,
      razorpay_customer_id: sub.customer_id ?? null,
      current_period_end: sub.current_end ? new Date(sub.current_end * 1000).toISOString() : null,
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
  return billingView(db, ctx);
}

/** Webhook: keeps the plan in step with Razorpay (renewals, failures, cancellations). */
export async function handleRazorpayWebhook(
  db: Db,
  eventId: string,
  payload: { event?: string; payload?: { subscription?: { entity?: RzpSubscription } } },
) {
  const sub = payload.payload?.subscription?.entity;
  let firmId: string | null = sub?.notes?.firm_id ?? null;
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
  return { duplicate: false, firmId };
}
