/**
 * FynHelp Credits, server side: the monthly allowance, spending on a WhatsApp reminder (and giving it back
 * when the message is not sent), top-ups through Razorpay, and optional automatic top-ups.
 * Every balance change goes through the ca_credits_* database functions, which hold a per-firm lock.
 */
import { randomUUID } from "node:crypto";
import type { Db, FirmContext } from "../db.server";
import { canSignOff, logActivity } from "../db.server";
import { PracticeError } from "../core";
import { assertNotTest, isTestFirm } from "../testMode.server";
import { billingMonth } from "./usage.server";
import {
  allowanceGrant,
  CREDITS_PER_REMINDER,
  CREDIT_PACKS,
  CREDIT_VALID_MONTHS,
  creditLevel,
  monthlyAllowance,
  packByKey,
  packPaise,
  type CreditLevel,
  type CreditPack,
} from "./credits";

export interface CreditSettings {
  autoTopup: boolean;
  autoPack: CreditPack["key"];
  autoMaxPerMonth: number;
}
const DEFAULT_SETTINGS: CreditSettings = { autoTopup: false, autoPack: "c500", autoMaxPerMonth: 2 };

const rpcNumber = async (db: Db, fn: string, args: Record<string, unknown>): Promise<number> => {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return Number(data ?? 0);
};

/** Adds this month's allowance (or the trial gift) once. Safe to call as often as you like. */
export async function ensureAllowance(db: Db, firmId: string, now: Date = new Date()): Promise<void> {
  const { loadBilling } = await import("../billing.server");
  const grant = allowanceGrant(await loadBilling(db, firmId), billingMonth(now), now);
  if (!grant) return;
  const { error } = await db.rpc("ca_credits_grant", {
    p_firm: firmId,
    p_kind: grant.kind,
    p_credits: grant.credits,
    p_period: grant.period,
    p_ref: null,
    p_months: CREDIT_VALID_MONTHS,
    p_note: grant.kind === "trial" ? "Free trial credits" : `Monthly allowance ${grant.period}`,
  });
  if (error) console.error(`[credits] allowance: ${error.message}`);
}

export async function getSettings(db: Db, firmId: string): Promise<CreditSettings> {
  const { data } = await db.from("ca_credit_settings").select("auto_topup, auto_pack, auto_max_per_month").eq("ca_firm_id", firmId).maybeSingle();
  if (!data) return DEFAULT_SETTINGS;
  return {
    autoTopup: Boolean(data.auto_topup),
    autoPack: (packByKey(String(data.auto_pack))?.key ?? "c500") as CreditPack["key"],
    autoMaxPerMonth: Number(data.auto_max_per_month) || 2,
  };
}

/* ── spending ─────────────────────────────────────────────── */

export type SpendResult = { ok: true; ref: string | null; free: boolean; balance: number | null } | { ok: false; balance: number };

/**
 * Takes the credits for one reminder. Test firms and firms sending from their own number pay nothing.
 * If the balance is short and the firm has automatic top-up on, one top-up is tried first.
 * Pass the returned ref to refundReminder() if the message turns out not to be sent.
 */
export async function spendForReminder(db: Db, firmId: string, opts: { sharedNumber: boolean; now?: Date }): Promise<SpendResult> {
  if (!opts.sharedNumber || (await isTestFirm(db, firmId))) return { ok: true, ref: null, free: true, balance: null };
  await ensureAllowance(db, firmId, opts.now);
  const ref = `wa:${randomUUID()}`;
  const take = () => rpcNumber(db, "ca_credits_spend", { p_firm: firmId, p_amount: CREDITS_PER_REMINDER, p_ref: ref });
  let left = await take();
  if (left < 0 && (await autoTopUp(db, firmId, opts.now))) left = await take();
  if (left < 0) {
    await notifyLevel(db, firmId, "out", 0, opts.now);
    return { ok: false, balance: await rpcNumber(db, "ca_credits_balance", { p_firm: firmId }) };
  }
  const { loadBilling } = await import("../billing.server");
  const level = creditLevel(left, monthlyAllowance(await loadBilling(db, firmId)));
  if (level === "low") {
    // Below the line: top up automatically if the firm asked for it, otherwise tell them once a month.
    if (await autoTopUp(db, firmId, opts.now)) left = await rpcNumber(db, "ca_credits_balance", { p_firm: firmId });
    else await notifyLevel(db, firmId, "low", left, opts.now);
  } else if (level === "out") await notifyLevel(db, firmId, "out", 0, opts.now);
  return { ok: true, ref, free: false, balance: left };
}

/** The reminder was not sent: give the credit back. */
export async function refundReminder(db: Db, firmId: string, ref: string | null): Promise<void> {
  if (!ref) return;
  await rpcNumber(db, "ca_credits_refund", { p_firm: firmId, p_ref: ref }).catch((e) => console.error(`[credits] refund: ${(e as Error).message}`));
}

/** One in-app notice per firm per month for "running low", and one for "ran out". */
async function notifyLevel(db: Db, firmId: string, level: Exclude<CreditLevel, "ok">, balance: number, now: Date = new Date()) {
  const month = billingMonth(now);
  const col = level === "low" ? "low_notified_month" : "out_notified_month";
  const { data: row } = await db.from("ca_credit_settings").select(col).eq("ca_firm_id", firmId).maybeSingle();
  if ((row as Record<string, unknown> | null)?.[col] === month) return;
  const { error } = await db.from("ca_credit_settings").upsert({ ca_firm_id: firmId, [col]: month, updated_at: now.toISOString() }, { onConflict: "ca_firm_id" });
  if (error) return;
  await db.from("ca_notifications").insert({
    ca_firm_id: firmId,
    type: level === "low" ? "credits_low" : "credits_out",
    severity: level === "low" ? "warning" : "critical",
    title: level === "low" ? "WhatsApp credits are running low" : "WhatsApp credits have run out",
    message:
      level === "low"
        ? `${balance} credits left (1 credit = 1 WhatsApp reminder). Add credits in Settings, Billing so reminders keep going out. Email reminders are not affected.`
        : "WhatsApp reminders are paused until you add credits in Settings, Billing. Email reminders keep going out.",
    is_read: false,
    metadata: { balance },
  });
}

/* ── top-ups ──────────────────────────────────────────────── */

const onLiveMonthlyPlan = (row: { cycle: string; razorpay_subscription_id: string | null; status: string }) =>
  row.cycle === "monthly" && !!row.razorpay_subscription_id && ["active", "past_due"].includes(row.status);

/**
 * Automatic top-up: adds one pack at once and bills it on the next subscription payment (a Razorpay add-on, like
 * monthly usage charges). Needs a live monthly plan; limited to the firm's chosen number of packs a month.
 * Returns true when credits were added.
 */
export async function autoTopUp(db: Db, firmId: string, now: Date = new Date()): Promise<boolean> {
  const settings = await getSettings(db, firmId);
  if (!settings.autoTopup) return false;
  const billing = await import("../billing.server");
  const row = await billing.loadBilling(db, firmId);
  if (!onLiveMonthlyPlan(row) || !billing.razorpayReady()) return false;
  const pack = packByKey(settings.autoPack) ?? CREDIT_PACKS[0];
  const month = billingMonth(now);
  const { count } = await db.from("ca_credit_lots").select("id", { count: "exact", head: true }).eq("ca_firm_id", firmId).eq("kind", "auto_topup").like("ref", `auto:${month}:%`);
  const n = (count ?? 0) + 1;
  if (n > settings.autoMaxPerMonth) return false;
  const ref = `auto:${month}:${n}:${firmId}`;
  // Claim the slot first: two sends at once cannot both take it (the ref is unique).
  const { data: added } = await db.rpc("ca_credits_grant", { p_firm: firmId, p_kind: "auto_topup", p_credits: pack.credits, p_period: null, p_ref: ref, p_months: CREDIT_VALID_MONTHS, p_note: `Automatic top-up: ${pack.label}` });
  if (!added) return false;
  try {
    await billing.razorpayApi(
      "POST",
      `/subscriptions/${row.razorpay_subscription_id}/addons`,
      { item: { name: `FynHelp credits: ${pack.label}`, amount: packPaise(pack, billing.gstPercent()), currency: "INR", description: `Automatic top-up, ${pack.label}. Includes GST.` }, quantity: 1 },
      "Razorpay could not add the credits charge.",
    );
  } catch (e) {
    // Not billed, so not given: take the credits back out.
    await db.from("ca_credit_lots").update({ remaining: 0, expires_at: now.toISOString() }).eq("ca_firm_id", firmId).eq("ref", ref);
    console.error(`[credits] auto top-up not billed: ${(e as Error).message}`);
    return false;
  }
  await logActivity(db, firmId, null, "system", `Automatic top-up: ${pack.label} added; charged with the next plan payment.`);
  return true;
}

/** A Razorpay order for a pack. The credits are added only after the payment is verified. */
export async function createTopUpOrder(db: Db, ctx: FirmContext, packKey: string) {
  await assertNotTest(db, ctx.firmId);
  if (!canSignOff(ctx)) throw new PracticeError("forbidden", "Only a partner can buy credits.");
  const pack = packByKey(packKey);
  if (!pack) throw new PracticeError("invalid", "Pick one of the credit packs.");
  const billing = await import("../billing.server");
  if (!billing.razorpayReady()) throw new PracticeError("payments_not_ready", "Online payments are being set up. Email support@fynhelp.com and we will add the credits.");
  const amount = packPaise(pack, billing.gstPercent());
  const order = await billing.razorpayApi<{ id: string }>(
    "POST",
    "/orders",
    { amount, currency: "INR", receipt: `cr_${Date.now().toString(36)}`, notes: { kind: "credits", firm_id: ctx.firmId, pack: pack.key, credits: String(pack.credits) } },
    "Razorpay could not start the payment. Try again in a minute, or email support@fynhelp.com.",
  );
  const { error } = await db.from("ca_credit_orders").insert({ order_id: order.id, ca_firm_id: ctx.firmId, pack: pack.key, credits: pack.credits, amount_paise: amount });
  if (error) throw new PracticeError("db_error", "Could not save the order. Try again.");
  return { keyId: process.env["RAZORPAY_KEY_ID"]!, orderId: order.id, amount, firmName: ctx.firmName, packLabel: pack.label };
}

/** Adds the credits for a paid order, once. Used by the app after Checkout and by the Razorpay webhook. */
export async function grantPaidOrder(db: Db, orderId: string, paymentId: string): Promise<{ firmId: string; credits: number } | null> {
  const { data: order } = await db.from("ca_credit_orders").select("order_id, ca_firm_id, credits").eq("order_id", orderId).maybeSingle();
  if (!order) return null;
  const firmId = String(order.ca_firm_id);
  const { error } = await db.rpc("ca_credits_grant", { p_firm: firmId, p_kind: "topup", p_credits: Number(order.credits), p_period: null, p_ref: paymentId, p_months: CREDIT_VALID_MONTHS, p_note: "Top-up" });
  if (error) throw new Error(`credits grant: ${error.message}`);
  await db.from("ca_credit_orders").update({ status: "paid", payment_id: paymentId, paid_at: new Date().toISOString() }).eq("order_id", orderId).eq("status", "created");
  return { firmId, credits: Number(order.credits) };
}

export async function confirmTopUp(db: Db, ctx: FirmContext, p: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) {
  const billing = await import("../billing.server");
  const secret = process.env["RAZORPAY_KEY_SECRET"];
  if (!secret) throw new PracticeError("payments_not_ready", "Online payments are being set up.");
  const { data: order } = await db.from("ca_credit_orders").select("ca_firm_id").eq("order_id", p.razorpay_order_id).maybeSingle();
  if (!order || order.ca_firm_id !== ctx.firmId) throw new PracticeError("mismatch", "This payment is not for this firm. Email support@fynhelp.com.");
  if (!(await billing.checkoutSignatureValid(p.razorpay_order_id, p.razorpay_payment_id, p.razorpay_signature, secret)))
    throw new PracticeError("bad_signature", "The payment could not be verified. If money was taken, email support@fynhelp.com and we will add the credits.");
  const done = await grantPaidOrder(db, p.razorpay_order_id, p.razorpay_payment_id);
  if (done) await logActivity(db, ctx.firmId, null, "system", `${done.credits} WhatsApp credits added (payment ${p.razorpay_payment_id}).`);
  return creditsView(db, ctx);
}

export async function saveSettings(db: Db, ctx: FirmContext, s: { autoTopup: boolean; autoPack: string; autoMaxPerMonth: number }) {
  await assertNotTest(db, ctx.firmId);
  if (!canSignOff(ctx)) throw new PracticeError("forbidden", "Only a partner can change credit settings.");
  const pack = packByKey(s.autoPack);
  if (!pack) throw new PracticeError("invalid", "Pick one of the credit packs.");
  if (s.autoTopup && !onLiveMonthlyPlan(await (await import("../billing.server")).loadBilling(db, ctx.firmId)))
    throw new PracticeError("needs_monthly", "Automatic top-up works on a monthly plan, because it is charged with your plan payment. On a yearly plan, add credits yourself when you need them.");
  const { error } = await db.from("ca_credit_settings").upsert(
    { ca_firm_id: ctx.firmId, auto_topup: s.autoTopup, auto_pack: pack.key, auto_max_per_month: Math.min(10, Math.max(1, Math.round(s.autoMaxPerMonth))), updated_at: new Date().toISOString() },
    { onConflict: "ca_firm_id" },
  );
  if (error) throw new PracticeError("db_error", "Could not save. Try again.");
  return creditsView(db, ctx);
}

/* ── what the screens show ───────────────────────────────── */

export async function creditsView(db: Db, ctx: FirmContext) {
  const test = await isTestFirm(db, ctx.firmId);
  const billing = await import("../billing.server");
  const row = await billing.loadBilling(db, ctx.firmId);
  const monthly = monthlyAllowance(row);
  if (!test) await ensureAllowance(db, ctx.firmId);
  const [lots, ledger, settings] = await Promise.all([
    db.from("ca_credit_lots").select("kind, credits, remaining, expires_at").eq("ca_firm_id", ctx.firmId).gt("remaining", 0).gt("expires_at", new Date().toISOString()).order("expires_at").limit(50),
    db.from("ca_credit_ledger").select("delta, reason, note, created_at").eq("ca_firm_id", ctx.firmId).order("created_at", { ascending: false }).limit(12),
    getSettings(db, ctx.firmId),
  ]);
  const live = lots.data ?? [];
  const balance = live.reduce((s, l) => s + Number(l.remaining), 0);
  const gst = billing.gstPercent();
  return {
    /** Test accounts send through a sandbox: nothing is charged. */
    unmetered: test,
    balance,
    monthly,
    level: creditLevel(balance, monthly),
    nextExpiry: live[0] ? { credits: Number(live[0].remaining), expiresAt: String(live[0].expires_at) } : null,
    packs: CREDIT_PACKS.map((p) => ({ ...p, totalWithGst: Math.round(packPaise(p, gst)) / 100 })),
    gstPercent: gst,
    paymentsReady: billing.razorpayReady(),
    settings,
    autoAvailable: onLiveMonthlyPlan(row),
    recent: (ledger.data ?? []).map((l) => ({ delta: Number(l.delta), reason: String(l.reason), note: (l.note as string | null) ?? null, at: String(l.created_at) })),
  };
}
export type CreditsView = Awaited<ReturnType<typeof creditsView>>;
