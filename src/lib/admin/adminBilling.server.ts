/**
 * What an admin can do about one firm's plan, credits and monthly charges. Every change needs a reason, is checked by
 * the rules in planAdjust.ts, and is written to the audit log (and, for credits, to the firm's own history).
 * A firm paying through Razorpay is switched in Razorpay by the same code the firm's own screen uses; any other firm
 * gets a dated manual plan that ends on its own and is never billed.
 */
import { randomUUID } from "node:crypto";
import { PracticeError } from "../practice/core";
import { logActivity, type FirmContext } from "../practice/db.server";
import { accessFor, PLANS, type Cycle, type PlanKey } from "../practice/billing/plans";
import { monthlyAllowance } from "../practice/billing/credits";
import { audit, type AdminCtx } from "./security.server";
import { canWaiveCharge, cleanReason, creditAdjustProblem, manualPlanEnd, MIN_REASON, planFitsUsage, planRoute, type PlanKind } from "./planAdjust";

async function firmOf(ctx: AdminCtx, firmId: string) {
  const { data } = await ctx.db.from("ca_firms").select("id, firm_name, email, is_test, is_demo").eq("id", firmId).maybeSingle();
  if (!data) throw new PracticeError("not_found", "Firm not found.");
  return data as { id: string; firm_name: string; email: string | null; is_test: boolean | null; is_demo: boolean | null };
}

const needReason = (raw: string) => {
  const r = cleanReason(raw);
  if (r.length < MIN_REASON) throw new PracticeError("reason_required", "Say why, so the team knows later.");
  return r;
};

const refuseTest = (f: { is_test: boolean | null; firm_name: string }, what: string) => {
  if (f.is_test) throw new PracticeError("test_firm", `${f.firm_name} is a test firm: it already has every feature, is never billed and has no credits to ${what}.`);
};

/** Everything the plan, credits and usage panel shows. */
export async function firmBillingView(ctx: AdminCtx, firmId: string) {
  const firm = await firmOf(ctx, firmId);
  const billing = await import("../practice/billing.server");
  const { usageFor } = await import("../practice/billing/usage.server");
  const { recentUsageCharges } = await import("../practice/billing/arrears.server");
  const row = await billing.loadBilling(ctx.db, firmId);
  const [usage, charges, balance, ledger] = await Promise.all([
    usageFor(ctx.db, firmId),
    recentUsageCharges(ctx.db, firmId, 6),
    ctx.db.rpc("ca_credits_balance", { p_firm: firmId }),
    ctx.db.from("ca_credit_ledger").select("delta, reason, note, created_at").eq("ca_firm_id", firmId).order("created_at", { ascending: false }).limit(10),
  ]);
  const access = accessFor(row);
  return {
    isTest: Boolean(firm.is_test),
    isDemo: Boolean(firm.is_demo),
    plan: row.plan,
    cycle: row.cycle,
    status: row.status,
    periodEnd: row.current_period_end,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    scheduled: row.scheduled_plan && row.scheduled_cycle ? { plan: row.scheduled_plan, cycle: row.scheduled_cycle } : null,
    onTrial: access.state === "trial",
    route: planRoute(row) as PlanKind | "blocked",
    usage: { month: usage.month, activeClients: usage.activeClients, documents: usage.documents },
    charges,
    credits: {
      balance: Number(balance.data ?? 0),
      monthly: monthlyAllowance(row),
      recent: (ledger.data ?? []).map((l) => ({ delta: Number(l.delta), reason: String(l.reason), note: (l.note as string | null) ?? null, at: String(l.created_at) })),
    },
  };
}

/**
 * Changes a firm's plan. Firms paying through Razorpay switch there (a higher plan now with the pro-rated difference,
 * a lower one or another cycle at renewal) and are emailed; other firms get a manual plan until `endsOn`.
 */
export async function setFirmPlan(
  ctx: AdminCtx,
  firmId: string,
  plan: PlanKey,
  cycle: Cycle,
  endsOn: string | null,
  reasonRaw: string,
  opts: { mode?: "auto" | "manual"; endRazorpay?: boolean } = {},
) {
  const reason = needReason(reasonRaw);
  const firm = await firmOf(ctx, firmId);
  if (firm.is_demo) throw new PracticeError("demo_firm", "A demo firm has no plan to change.");
  refuseTest(firm, "change");
  const billing = await import("../practice/billing.server");
  const { usageFor } = await import("../practice/billing/usage.server");
  const row = await billing.loadBilling(ctx.db, firmId);
  const route = planRoute(row);
  const manual = opts.mode === "manual";
  // A cancelling firm can only be given a manual plan (its Razorpay subscription is already ending).
  if (route === "blocked" && !manual)
    throw new PracticeError("cancelled", "This firm has cancelled and its plan is ending. Assign a plan manually, or let it end and give one after that day.");
  // A firm still paying through Razorpay would be billed twice, so assigning by hand ends that subscription, and only on an explicit yes.
  const endsSubscription = manual && route === "razorpay";
  if (endsSubscription && !opts.endRazorpay)
    throw new PracticeError("confirm_end_razorpay", "This firm pays through Razorpay. Assigning a plan by hand cancels that subscription now (no refund is issued), so confirm that first.");
  const usage = await usageFor(ctx.db, firmId);
  const misfit = planFitsUsage(plan, usage.activeClients);
  if (misfit) throw new PracticeError("plan_too_small", misfit);
  const before = { plan: row.plan, cycle: row.cycle, status: row.status };

  if (route === "razorpay" && !manual) {
    const asFirm: FirmContext = { firmId, firmName: firm.firm_name, firmEmail: firm.email, userId: ctx.userId, role: "owner" };
    const r = await billing.changePlan(ctx.db, asFirm, plan, cycle);
    await audit(ctx, "firm_plan_changed", "ca_firm", firmId, { route, reason, before, to: { plan, cycle }, timing: r.timing });
    return { route, timing: r.timing, endsAt: null as string | null };
  }

  const end = manualPlanEnd(endsOn ?? "");
  if (!end.ok) throw new PracticeError("bad_end_date", end.problem);
  const now = new Date().toISOString();
  if (endsSubscription) {
    // Everything is checked above; only now is Razorpay touched. If it refuses, nothing has changed.
    await billing.razorpayApi(
      "POST",
      `/subscriptions/${encodeURIComponent(row.razorpay_subscription_id!)}/cancel`,
      { cancel_at_cycle_end: 0 },
      "Razorpay could not cancel the subscription, so nothing was changed. Try again in a minute.",
    );
  }
  const { error } = await ctx.db
    .from("ca_billing")
    .update({ plan, cycle, status: "cancelled", current_period_end: end.endsAt, cancel_at_period_end: false, scheduled_plan: null, scheduled_cycle: null, updated_at: now })
    .eq("ca_firm_id", firmId);
  if (error)
    throw new PracticeError(
      "db_error",
      endsSubscription
        ? `The Razorpay subscription was cancelled, but the new plan could not be saved (${error.message}). Give the plan again now, or the firm is left without one.`
        : `Could not save the plan: ${error.message}`,
    );
  await ctx.db.from("ca_billing_events").insert({ id: `manual:${firmId}:${Date.now()}`, event: "admin.manual_plan", ca_firm_id: firmId, payload: { by: ctx.userId, reason, before, to: { plan, cycle }, endsAt: end.endsAt, endedRazorpay: endsSubscription } });
  await logActivity(ctx.db, firmId, null, "system", `FynHelp gave this firm the ${PLANS[plan].name} plan until ${end.endsAt.slice(0, 10)}.`);
  await audit(ctx, "firm_plan_changed", "ca_firm", firmId, { route: "manual", reason, before, to: { plan, cycle }, endsAt: end.endsAt, endedRazorpay: endsSubscription });
  return { route: "manual" as const, timing: "now" as const, endsAt: end.endsAt };
}

/**
 * Adds bonus credits (valid 12 months like any others) or takes credits back. A firm cannot be taken below zero, and
 * the firm sees a plain line in its own credit history.
 */
export async function adjustFirmCredits(ctx: AdminCtx, firmId: string, delta: number, reasonRaw: string) {
  const reason = needReason(reasonRaw);
  const firm = await firmOf(ctx, firmId);
  refuseTest(firm, "adjust");
  const { data: bal } = await ctx.db.rpc("ca_credits_balance", { p_firm: firmId });
  const balance = Number(bal ?? 0);
  const problem = creditAdjustProblem(delta, reason, balance);
  if (problem) throw new PracticeError("bad_credits", problem);
  const ref = `admin:${randomUUID()}`;
  if (delta > 0) {
    const { data, error } = await ctx.db.rpc("ca_credits_grant", { p_firm: firmId, p_kind: "bonus", p_credits: delta, p_period: null, p_ref: ref, p_months: 12, p_note: `Added by FynHelp: ${reason}` });
    if (error || !data) throw new PracticeError("db_error", "Could not add the credits. Nothing was changed.");
  } else {
    const { data, error } = await ctx.db.rpc("ca_credits_spend", { p_firm: firmId, p_amount: -delta, p_ref: ref });
    if (error) throw new PracticeError("db_error", "Could not take the credits back. Nothing was changed.");
    if (Number(data) < 0) throw new PracticeError("bad_credits", "The firm no longer has that many credits. Nothing was changed.");
    // The spend function labels its rows as reminders; say what this really was.
    await ctx.db.from("ca_credit_ledger").update({ note: `Taken back by FynHelp: ${reason}` }).eq("ca_firm_id", firmId).eq("reason", "spend").eq("ref", ref);
  }
  const { data: after } = await ctx.db.rpc("ca_credits_balance", { p_firm: firmId });
  await logActivity(ctx.db, firmId, null, "system", `FynHelp ${delta > 0 ? "added" : "took back"} ${Math.abs(delta).toLocaleString("en-IN")} WhatsApp credits.`);
  await audit(ctx, "firm_credits_adjusted", "ca_firm", firmId, { delta, reason, before: balance, after: Number(after ?? 0) });
  return { balance: Number(after ?? 0) };
}

/** Waives a month's usage charge that failed to go out, so the firm is not chased for it later. */
export async function waiveUsageCharge(ctx: AdminCtx, firmId: string, month: string, reasonRaw: string) {
  const reason = needReason(reasonRaw);
  if (!/^\d{4}-\d{2}$/.test(month)) throw new PracticeError("bad_month", "Pick a month.");
  const firm = await firmOf(ctx, firmId);
  const { data: c } = await ctx.db.from("ca_usage_charges").select("status, total").eq("ca_firm_id", firmId).eq("month", month).maybeSingle();
  if (!c) throw new PracticeError("not_found", "There is no charge for that month.");
  if (!canWaiveCharge(String(c.status)))
    throw new PracticeError("not_waivable", "Only a charge that failed to go out can be waived. One already raised in Razorpay is settled there (refund or cancel it from the Razorpay dashboard).");
  const { data: done } = await ctx.db.from("ca_usage_charges").update({ status: "waived", error: null, updated_at: new Date().toISOString() }).eq("ca_firm_id", firmId).eq("month", month).eq("status", "failed").select("month");
  if (!done?.length) throw new PracticeError("not_waivable", "That charge changed while you were looking. Reload and check it.");
  await audit(ctx, "usage_charge_waived", "ca_firm", firmId, { firm: firm.firm_name, month, total: Number(c.total), reason });
  return { month };
}
