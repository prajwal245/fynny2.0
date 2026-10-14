/**
 * What the admin panel reads and changes. Every function takes an AdminCtx
 * from requireAdmin, so the caller's network, MFA, session and role were
 * already checked; changes write an audit row.
 */
import { PracticeError } from "../practice/core";
import { PLANS, planAmountPaise, type Cycle, type PlanKey } from "../practice/billing/plans";
import { audit, type AdminCtx } from "./security.server";
import { ASSIGNABLE_ROLES, can, SUPPORT_REFUND_LIMIT, type AdminRole } from "./rbac";
import { ledgerRows, type BillingEvent, type LedgerRow } from "./ledger";

const DAY = 86_400_000;
const IST = 5.5 * 3600_000;
const istDay = (iso: string) => new Date(new Date(iso).getTime() + IST).toISOString().slice(0, 10);
const istHour = (iso: string) => new Date(new Date(iso).getTime() + IST).getUTCHours();
const monthlyValue = (plan: PlanKey, cycle: Cycle) => (cycle === "annual" ? PLANS[plan].annual / 12 : PLANS[plan].monthly);

interface BillingRow {
  ca_firm_id: string;
  plan: PlanKey;
  cycle: Cycle;
  status: string;
  trial_ends_at: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  razorpay_subscription_id: string | null;
  updated_at: string;
  coupon_code?: string | null;
}

/* ── dashboard ───────────────────────────────────────────── */

export async function dashboard(ctx: AdminCtx) {
  const { db } = ctx;
  const now = Date.now();
  const since = new Date(now - 30 * DAY).toISOString();
  const [firms, billing, docs, runs, reports] = await Promise.all([
    db.from("ca_firms").select("id, created_at, is_demo").limit(20000),
    db.from("ca_billing").select("ca_firm_id, plan, cycle, status, trial_ends_at, current_period_end, cancel_at_period_end, updated_at").limit(20000),
    db.from("ca_document_extractions").select("created_at").gte("created_at", since).limit(50000),
    db.from("ca_agent_runs").select("agent, status, started_at").gte("started_at", since).limit(50000),
    db.from("ca_reports_log").select("created_at").gte("created_at", since).limit(20000),
  ]);
  const realFirms = (firms.data ?? []).filter((f) => !f.is_demo);
  const real = new Set(realFirms.map((f) => f.id));
  const rows = ((billing.data ?? []) as BillingRow[]).filter((b) => real.has(b.ca_firm_id));
  const paid = rows.filter((b) => ["active", "past_due", "pending"].includes(b.status));
  const trials = rows.filter((b) => b.status === "trialing" && new Date(b.trial_ends_at).getTime() > now);
  const churned = rows.filter((b) => b.status === "cancelled" && new Date(b.updated_at).getTime() > now - 30 * DAY);
  const mrr = paid.reduce((a, b) => a + monthlyValue(b.plan, b.cycle), 0);
  const byPlan = (Object.keys(PLANS) as PlanKey[]).map((p) => ({
    plan: PLANS[p].name,
    mrr: Math.round(paid.filter((b) => b.plan === p).reduce((a, b) => a + monthlyValue(b.plan, b.cycle), 0)),
    firms: paid.filter((b) => b.plan === p).length,
  }));
  const days: { day: string; documents: number; signups: number; mis: number }[] = [];
  for (let i = 29; i >= 0; i--) days.push({ day: istDay(new Date(now - i * DAY).toISOString()), documents: 0, signups: 0, mis: 0 });
  const at = new Map(days.map((d) => [d.day, d]));
  for (const d of docs.data ?? []) { const x = at.get(istDay(d.created_at)); if (x) x.documents++; }
  for (const f of realFirms) { const x = at.get(istDay(f.created_at)); if (x) x.signups++; }
  for (const r of reports.data ?? []) { const x = at.get(istDay(r.created_at)); if (x) x.mis++; }
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, documents: 0 }));
  for (const d of docs.data ?? []) hours[istHour(d.created_at)].documents++;
  const runRows = runs.data ?? [];
  return {
    kpis: {
      firms: realFirms.length,
      newFirms30: realFirms.filter((f) => new Date(f.created_at).getTime() > now - 30 * DAY).length,
      trials: trials.length,
      paid: paid.length,
      mrr: Math.round(mrr),
      churnRate: paid.length + churned.length ? Math.round((churned.length / (paid.length + churned.length)) * 1000) / 10 : 0,
      documents30: (docs.data ?? []).length,
      mis30: (reports.data ?? []).length,
      runningNow: runRows.filter((r) => r.status === "running").length,
      failed24h: runRows.filter((r) => r.status === "failed" && new Date(r.started_at).getTime() > now - DAY).length,
    },
    days,
    hours,
    byPlan,
  };
}

/** Newest activity across all firms, for the live feed. */
export async function activity(ctx: AdminCtx, after?: string | null) {
  let q = ctx.db
    .from("ca_activity_log")
    .select("id, ca_firm_id, action_type, description, created_at")
    .order("created_at", { ascending: false })
    .limit(40);
  if (after) q = q.gt("created_at", after);
  const { data } = await q;
  const rows = (data ?? []) as { id: string; ca_firm_id: string; action_type: string; description: string; created_at: string }[];
  const names = await firmNames(ctx, rows.map((r) => r.ca_firm_id));
  return rows.map((r) => ({ id: r.id, firm: names.get(r.ca_firm_id) ?? "—", firmId: r.ca_firm_id, kind: r.action_type, text: r.description, at: r.created_at }));
}

async function firmNames(ctx: AdminCtx, ids: string[]) {
  const uniq = [...new Set(ids.filter(Boolean))];
  const out = new Map<string, string>();
  for (let i = 0; i < uniq.length; i += 300) {
    const { data } = await ctx.db.from("ca_firms").select("id, firm_name").in("id", uniq.slice(i, i + 300));
    for (const f of data ?? []) out.set(f.id, f.firm_name);
  }
  return out;
}

/* ── firms (the customers) ───────────────────────────────── */

export type FirmFilter = { q?: string; status?: "active" | "suspended" | "flagged" | ""; plan?: "trial" | "paid" | "paused" | "cancelled" | ""; page?: number };

function planState(b: BillingRow | undefined, now = Date.now()): "trial" | "paid" | "paused" | "cancelled" {
  if (!b) return "trial";
  if (["active", "past_due", "pending"].includes(b.status)) return "paid";
  if (b.status === "cancelled") return b.current_period_end && new Date(b.current_period_end).getTime() > now ? "paid" : "cancelled";
  if (b.status === "halted") return "paused";
  return new Date(b.trial_ends_at).getTime() > now ? "trial" : "paused";
}

export async function listFirms(ctx: AdminCtx, f: FirmFilter) {
  let q = ctx.db
    .from("ca_firms")
    .select("id, firm_name, email, city, created_at, admin_status, user_id, is_demo")
    .order("created_at", { ascending: false })
    .limit(2000);
  if (f.q?.trim()) {
    const t = f.q.trim().replace(/[%,()]/g, " ");
    q = q.or(`firm_name.ilike.%${t}%,email.ilike.%${t}%,city.ilike.%${t}%`);
  }
  if (f.status) q = q.eq("admin_status", f.status);
  const { data, error } = await q;
  if (error) throw new PracticeError("db_error", error.message);
  const firms = (data ?? []).filter((x) => !x.is_demo);
  const ids = firms.map((x) => x.id);
  const billing = new Map<string, BillingRow>();
  const clients = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 300) {
    const part = ids.slice(i, i + 300);
    const [{ data: b }, { data: c }] = await Promise.all([
      ctx.db.from("ca_billing").select("ca_firm_id, plan, cycle, status, trial_ends_at, current_period_end, cancel_at_period_end, razorpay_subscription_id, updated_at").in("ca_firm_id", part),
      ctx.db.from("ca_clients").select("ca_firm_id").in("ca_firm_id", part).neq("client_status", "archived").limit(50000),
    ]);
    for (const r of (b ?? []) as BillingRow[]) billing.set(r.ca_firm_id, r);
    for (const r of c ?? []) clients.set(r.ca_firm_id, (clients.get(r.ca_firm_id) ?? 0) + 1);
  }
  const owners = firms.map((x) => x.user_id).filter(Boolean);
  const { data: logins } = owners.length ? await ctx.db.rpc("admin_user_logins", { ids: owners }) : { data: [] };
  const login = new Map(((logins ?? []) as { user_id: string; provider: string; last_sign_in_at: string | null }[]).map((l) => [l.user_id, l]));
  let rows = firms.map((x) => {
    const b = billing.get(x.id);
    const l = login.get(x.user_id);
    return {
      id: x.id,
      name: x.firm_name,
      email: x.email,
      city: x.city,
      createdAt: x.created_at,
      status: (x.admin_status ?? "active") as "active" | "suspended" | "flagged",
      plan: b ? `${PLANS[b.plan]?.name ?? b.plan}${b.cycle === "annual" ? " yearly" : ""}` : "Starter trial",
      planState: planState(b),
      trialEnds: b?.status === "trialing" ? b.trial_ends_at : null,
      clients: clients.get(x.id) ?? 0,
      source: l?.provider ?? "email",
      lastSignIn: l?.last_sign_in_at ?? null,
    };
  });
  if (f.plan) rows = rows.filter((r) => r.planState === f.plan);
  const page = Math.max(0, f.page ?? 0);
  return { total: rows.length, rows: rows.slice(page * 50, page * 50 + 50) };
}

export async function firmDetail(ctx: AdminCtx, firmId: string) {
  const { db } = ctx;
  const [{ data: firm }, { data: billing }, { data: members }, { count: clients }, { count: docs }, { data: reports }, { data: log }] = await Promise.all([
    db.from("ca_firms").select("id, firm_name, email, phone, city, state, created_at, admin_status, admin_note, icai_membership_number, verification_status, user_id").eq("id", firmId).maybeSingle(),
    db.from("ca_billing").select("*").eq("ca_firm_id", firmId).maybeSingle(),
    db.from("ca_firm_members").select("invited_email, role, status, created_at").eq("ca_firm_id", firmId).limit(100),
    db.from("ca_clients").select("id", { count: "exact", head: true }).eq("ca_firm_id", firmId),
    db.from("ca_document_extractions").select("id", { count: "exact", head: true }).eq("ca_firm_id", firmId),
    db.from("ca_reports_log").select("id, report_name, period, status, created_at").eq("ca_firm_id", firmId).order("created_at", { ascending: false }).limit(10),
    db.from("ca_activity_log").select("description, action_type, created_at").eq("ca_firm_id", firmId).order("created_at", { ascending: false }).limit(25),
  ]);
  if (!firm) throw new PracticeError("not_found", "Firm not found.");
  const showBilling = can(ctx.roles, "billing.view");
  return {
    firm,
    billing: billing ? (showBilling ? billing : { plan: billing.plan, cycle: billing.cycle, status: billing.status, trial_ends_at: billing.trial_ends_at }) : null,
    members: members ?? [],
    clients: clients ?? 0,
    documents: docs ?? 0,
    reports: reports ?? [],
    activity: log ?? [],
  };
}

export async function setFirmStatus(ctx: AdminCtx, firmId: string, status: "active" | "suspended" | "flagged", note: string) {
  if (status !== "active" && !note.trim()) throw new PracticeError("note_required", "Say why, so the team knows later.");
  const { data, error } = await ctx.db.from("ca_firms").update({ admin_status: status, admin_note: note.trim() || null }).eq("id", firmId).select("firm_name").maybeSingle();
  if (error || !data) throw new PracticeError("not_found", "Firm not found.");
  await audit(ctx, `firm_${status}`, "ca_firm", firmId, { note: note.trim(), firm: data.firm_name });
  return { ok: true };
}

export async function extendTrial(ctx: AdminCtx, firmId: string, days: number) {
  if (!Number.isInteger(days) || days < 1 || days > 60) throw new PracticeError("bad_days", "Between 1 and 60 days.");
  const { data: b } = await ctx.db.from("ca_billing").select("status, trial_ends_at").eq("ca_firm_id", firmId).maybeSingle();
  if (!b) throw new PracticeError("not_found", "This firm has no billing record yet.");
  if (b.status !== "trialing") throw new PracticeError("not_trial", "Only a firm on the free trial can be given more days.");
  const ends = new Date(Math.max(Date.now(), new Date(b.trial_ends_at).getTime()) + days * DAY).toISOString();
  await ctx.db.from("ca_billing").update({ trial_ends_at: ends, updated_at: new Date().toISOString() }).eq("ca_firm_id", firmId);
  await audit(ctx, "trial_extended", "ca_firm", firmId, { days, ends });
  return { trialEnds: ends };
}

/* ── operations: the agents' work across firms ───────────── */

export async function listRuns(ctx: AdminCtx, f: { status?: string; agent?: string }) {
  let q = ctx.db
    .from("ca_agent_runs")
    .select("id, ca_firm_id, agent, trigger, status, subject_label, subject_id, summary, error, started_at, finished_at, attempt")
    .order("started_at", { ascending: false })
    .limit(150);
  if (f.status === "stuck") q = q.eq("status", "running").lt("started_at", new Date(Date.now() - 10 * 60_000).toISOString());
  else if (f.status) q = q.eq("status", f.status);
  if (f.agent) q = q.eq("agent", f.agent);
  const { data } = await q;
  const rows = data ?? [];
  const names = await firmNames(ctx, rows.map((r) => r.ca_firm_id));
  return rows.map((r) => ({
    ...r,
    firm: names.get(r.ca_firm_id) ?? "—",
    stuck: r.status === "running" && Date.now() - new Date(r.started_at).getTime() > 10 * 60_000,
    retryable: r.agent === "extract" && !!r.subject_id && (r.status === "failed" || r.status === "running"),
  }));
}

/** Reads a document again: the one kind of stuck or failed work an admin can push through. */
export async function retryRun(ctx: AdminCtx, runId: string) {
  const { data: run } = await ctx.db.from("ca_agent_runs").select("id, agent, subject_id, ca_firm_id, status").eq("id", runId).maybeSingle();
  if (!run || run.agent !== "extract" || !run.subject_id) throw new PracticeError("not_retryable", "Only document reads can be retried from here.");
  await ctx.db.from("ca_document_extractions").update({ extract_status: "queued", extract_attempts: 0, extract_next_attempt_at: null, error_message: null }).eq("id", run.subject_id).eq("ca_firm_id", run.ca_firm_id);
  if (run.status === "running") await ctx.db.from("ca_agent_runs").update({ status: "failed", error: "Stopped by an admin and queued again", finished_at: new Date().toISOString() }).eq("id", run.id);
  await audit(ctx, "run_retried", "ca_agent_run", run.id, { document: run.subject_id });
  const { processExtraction } = await import("../practice/documents.server");
  const r = await processExtraction(ctx.db, run.subject_id, { trigger: "retry" }).catch((e) => ({ status: "failed", error: (e as Error).message }));
  return { status: r.status, error: (r as { error?: string }).error ?? null };
}

/* ── billing: subscriptions, ledger, refunds ─────────────── */

export async function subscriptions(ctx: AdminCtx) {
  const { data } = await ctx.db
    .from("ca_billing")
    .select("ca_firm_id, plan, cycle, status, trial_ends_at, current_period_end, cancel_at_period_end, razorpay_subscription_id, updated_at, coupon_code")
    .order("updated_at", { ascending: false })
    .limit(1000);
  const rows = (data ?? []) as BillingRow[];
  const names = await firmNames(ctx, rows.map((r) => r.ca_firm_id));
  return rows.map((r) => ({
    firmId: r.ca_firm_id,
    firm: names.get(r.ca_firm_id) ?? "—",
    plan: PLANS[r.plan]?.name ?? r.plan,
    cycle: r.cycle,
    status: r.cancel_at_period_end ? "cancelling" : r.status,
    state: planState(r),
    mrr: ["active", "past_due", "pending"].includes(r.status) ? Math.round(monthlyValue(r.plan, r.cycle)) : 0,
    renews: r.current_period_end,
    trialEnds: r.status === "trialing" ? r.trial_ends_at : null,
    subscriptionId: r.razorpay_subscription_id,
    coupon: r.coupon_code ?? null,
  }));
}


/** Money that moved, from Razorpay's webhooks and the refunds FynHelp started. Prices include 18% GST. */
export async function ledger(ctx: AdminCtx, days = 90): Promise<LedgerRow[]> {
  const { data, error } = await ctx.db
    .from("ca_billing_events")
    .select("id, event, ca_firm_id, payload, received_at")
    .gte("received_at", new Date(Date.now() - days * DAY).toISOString())
    .order("received_at", { ascending: false })
    .limit(5000);
  if (error) throw new PracticeError("db_error", error.message);
  const rows = (data ?? []) as BillingEvent[];
  const names = await firmNames(ctx, rows.map((r) => r.ca_firm_id ?? ""));
  return ledgerRows(rows, names);
}

export async function ledgerCsv(ctx: AdminCtx, days = 90) {
  const rows = await ledger(ctx, days);
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"` : s;
  };
  const head = ["Date (UTC)", "Firm", "Event", "Payment ID", "Refund ID", "Method", "Amount incl. GST (INR)", "GST 18% (INR)", "Net of GST (INR)"];
  const lines = rows.map((r) => [r.at, r.firm, r.event, r.paymentId, r.refundId, r.method, r.amount.toFixed(2), r.gst.toFixed(2), r.net.toFixed(2)].map(esc).join(","));
  await audit(ctx, "ledger_exported", "billing", null, { days, rows: rows.length });
  return [head.join(","), ...lines].join("\n");
}

/** Full or part refund of a Razorpay payment. Support Agents are capped at ₹5,000. */
export async function refundPayment(ctx: AdminCtx, paymentId: string, amountRupees: number | null, reason: string) {
  if (!/^pay_[A-Za-z0-9]+$/.test(paymentId)) throw new PracticeError("bad_payment", "That is not a Razorpay payment ID (pay_…).");
  if (!reason.trim()) throw new PracticeError("reason_required", "Say why this is refunded.");
  const { razorpayApi } = await import("../practice/billing.server");
  const pay = await razorpayApi<{ id: string; amount: number; amount_refunded: number; status: string; notes?: Record<string, string> }>(
    "GET",
    `/payments/${paymentId}`,
    undefined,
    "Razorpay could not find that payment.",
  );
  const left = (pay.amount - (pay.amount_refunded ?? 0)) / 100;
  const amount = amountRupees ?? left;
  if (!(amount > 0) || amount > left) throw new PracticeError("bad_amount", `You can refund up to ₹${left.toLocaleString("en-IN")} on this payment.`);
  if (!can(ctx.roles, "billing.refund.unlimited") && amount > SUPPORT_REFUND_LIMIT)
    throw new PracticeError("over_limit", `Support can refund up to ₹${SUPPORT_REFUND_LIMIT.toLocaleString("en-IN")}. Ask Finance for more.`);
  const refund = await razorpayApi<{ id: string; amount: number }>(
    "POST",
    `/payments/${paymentId}/refund`,
    { amount: Math.round(amount * 100), speed: "normal", notes: { reason: reason.trim().slice(0, 200), by_admin: ctx.userId } },
    "Razorpay could not start the refund. Try again, or refund from the Razorpay Dashboard.",
  );
  const { data: b } = await ctx.db.from("ca_billing").select("ca_firm_id").or(`first_payment_id.eq.${paymentId}`).maybeSingle();
  const { error: logErr } = await ctx.db.from("ca_billing_events").insert({
    id: `admin_refund:${refund.id}`,
    event: "admin.refund",
    ca_firm_id: b?.ca_firm_id ?? pay.notes?.firm_id ?? null,
    payload: { refund_id: refund.id, payment_id: paymentId, amount: refund.amount ?? Math.round(amount * 100), reason: reason.trim(), by: ctx.userId },
  });
  if (logErr) console.error(`[admin] refund ${refund.id} not added to the ledger: ${logErr.message}`);
  await audit(ctx, "refund_issued", "payment", paymentId, { refund: refund.id, amount, reason: reason.trim() });
  return { refundId: refund.id, amount };
}

/* ── coupons ─────────────────────────────────────────────── */

export interface CouponInput {
  code: string;
  kind: "percent" | "flat" | "trial_days";
  value: number;
  razorpayOfferId?: string | null;
  plans?: PlanKey[] | null;
  cycles?: Cycle[] | null;
  expiresAt?: string | null;
  maxRedemptions?: number | null;
  perFirmLimit?: number;
  note?: string | null;
}

export async function listCoupons(ctx: AdminCtx) {
  const [{ data: coupons }, { data: red }] = await Promise.all([
    ctx.db.from("ca_coupons").select("*").order("created_at", { ascending: false }),
    ctx.db.from("ca_coupon_redemptions").select("code, plan, cycle, subscription_id, at").limit(20000),
  ]);
  return (coupons ?? []).map((c) => {
    const uses = (red ?? []).filter((r) => r.code === c.code);
    const paid = uses.filter((u) => u.subscription_id && u.plan && u.cycle);
    // Revenue each code brought in: first-period list price of the plans it started.
    const revenue = paid.reduce((a, u) => a + planAmountPaise(u.plan as PlanKey, u.cycle as Cycle) / 100, 0);
    const discount = paid.reduce((a, u) => {
      const price = planAmountPaise(u.plan as PlanKey, u.cycle as Cycle) / 100;
      return a + (c.kind === "percent" ? (price * Number(c.value)) / 100 : c.kind === "flat" ? Math.min(price, Number(c.value)) : 0);
    }, 0);
    return {
      ...c,
      uses: uses.length,
      paidUses: paid.length,
      revenue: Math.round(revenue),
      discount: Math.round(discount),
      roi: discount > 0 ? Math.round(((revenue - discount) / discount) * 10) / 10 : null,
      lastUsed: uses.map((u) => u.at).sort().pop() ?? null,
    };
  });
}

export async function createCoupon(ctx: AdminCtx, c: CouponInput) {
  const code = c.code.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) throw new PracticeError("bad_code", "Codes are 3 to 32 letters, digits, - or _.");
  if (c.kind === "percent" && (c.value <= 0 || c.value > 100)) throw new PracticeError("bad_value", "A percentage is between 1 and 100.");
  if (c.kind === "trial_days" && (!Number.isInteger(c.value) || c.value > 90)) throw new PracticeError("bad_value", "Trial codes add 1 to 90 whole days.");
  if (c.kind !== "trial_days" && !c.razorpayOfferId?.trim())
    throw new PracticeError("offer_required", "Money discounts are applied by Razorpay. Create the Offer in Razorpay (Subscriptions → Offers) and paste its offer_… ID here.");
  const { error } = await ctx.db.from("ca_coupons").insert({
    code,
    kind: c.kind,
    value: c.value,
    razorpay_offer_id: c.kind === "trial_days" ? null : c.razorpayOfferId!.trim(),
    plans: c.plans?.length ? c.plans : null,
    cycles: c.cycles?.length ? c.cycles : null,
    expires_at: c.expiresAt || null,
    max_redemptions: c.maxRedemptions || null,
    per_firm_limit: c.perFirmLimit && c.perFirmLimit > 0 ? c.perFirmLimit : 1,
    note: c.note?.trim() || null,
    created_by: ctx.userId,
  });
  if (error) throw new PracticeError("db_error", /duplicate/i.test(error.message) ? "That code already exists." : error.message);
  await audit(ctx, "coupon_created", "coupon", code, { ...c, code });
  return { code };
}

export async function setCouponActive(ctx: AdminCtx, code: string, active: boolean) {
  await ctx.db.from("ca_coupons").update({ active }).eq("code", code);
  await audit(ctx, active ? "coupon_enabled" : "coupon_disabled", "coupon", code, {});
  return { ok: true };
}

/* ── admin team ──────────────────────────────────────────── */

export async function team(ctx: AdminCtx) {
  const { data, error } = await ctx.db.rpc("admin_team");
  if (error) throw new PracticeError("db_error", error.message);
  const people = (data ?? []) as { user_id: string; email: string; roles: string[]; mfa_enabled: boolean; last_sign_in_at: string | null; banned_until: string | null }[];
  const { data: sessions } = await ctx.db
    .from("admin_sessions")
    .select("user_id, ip, created_at, last_seen_at, revoked_at")
    .in("user_id", people.map((p) => p.user_id).length ? people.map((p) => p.user_id) : ["00000000-0000-0000-0000-000000000000"])
    .order("created_at", { ascending: false })
    .limit(2000);
  return people.map((p) => {
    const mine = (sessions ?? []).filter((s) => s.user_id === p.user_id);
    const last = mine[0];
    return {
      userId: p.user_id,
      email: p.email,
      roles: p.roles,
      mfa: p.mfa_enabled,
      lastLoginAt: last?.created_at ?? p.last_sign_in_at,
      lastLoginIp: last?.ip ?? null,
      activeSessions: mine.filter((s) => !s.revoked_at && Date.now() - new Date(s.last_seen_at).getTime() < 15 * 60_000).length,
      deactivated: !!(p.banned_until && new Date(p.banned_until).getTime() > Date.now()),
      you: p.user_id === ctx.userId,
    };
  });
}

async function superAdmins(ctx: AdminCtx) {
  const { data } = await ctx.db.from("user_roles").select("user_id").in("role", ["super_admin", "admin"]);
  return new Set((data ?? []).map((r) => r.user_id));
}

export async function setRole(ctx: AdminCtx, userId: string, role: AdminRole) {
  if (!ASSIGNABLE_ROLES.includes(role)) throw new PracticeError("bad_role", "Pick one of the four roles.");
  if (userId === ctx.userId) throw new PracticeError("self", "Ask another Super Admin to change your own role.");
  const supers = await superAdmins(ctx);
  if (supers.has(userId) && role !== "super_admin" && supers.size <= 1) throw new PracticeError("last_super", "Keep at least one Super Admin.");
  await ctx.db.from("user_roles").delete().eq("user_id", userId).in("role", ["super_admin", "admin", "ops_admin", "support_agent", "finance_manager", "analyst"]);
  const { error } = await ctx.db.from("user_roles").insert({ user_id: userId, role });
  if (error) throw new PracticeError("db_error", error.message);
  await ctx.db.rpc("admin_revoke_sessions", { target: userId });
  await audit(ctx, "admin_role_set", "user", userId, { role });
  return { ok: true };
}

export async function inviteAdmin(ctx: AdminCtx, email: string, role: AdminRole) {
  if (!ASSIGNABLE_ROLES.includes(role)) throw new PracticeError("bad_role", "Pick one of the four roles.");
  const addr = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) throw new PracticeError("bad_email", "Enter a work email.");
  const site = process.env["SITE_URL"] || process.env["PUBLIC_SITE_URL"] || "https://fynhelp.com";
  let userId: string | null = null;
  const invited = await ctx.db.auth.admin.inviteUserByEmail(addr, { redirectTo: `${site}/reset-password` });
  if (invited.data?.user) userId = invited.data.user.id;
  else {
    // Already has an account: find it and give it the role.
    const { data: list } = await ctx.db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    userId = list?.users.find((u) => u.email?.toLowerCase() === addr)?.id ?? null;
  }
  if (!userId) throw new PracticeError("invite_failed", invited.error?.message ?? "The invite could not be sent.");
  await ctx.db.from("user_roles").delete().eq("user_id", userId).in("role", ["super_admin", "admin", "ops_admin", "support_agent", "finance_manager", "analyst"]);
  const { error } = await ctx.db.from("user_roles").insert({ user_id: userId, role });
  if (error) throw new PracticeError("db_error", error.message);
  await audit(ctx, "admin_invited", "user", userId, { email: addr, role });
  return { userId };
}

export async function revokeSessions(ctx: AdminCtx, userId: string) {
  const { data } = await ctx.db.rpc("admin_revoke_sessions", { target: userId });
  await audit(ctx, "admin_sessions_revoked", "user", userId, { sessions: data });
  return { revoked: Number(data ?? 0) };
}

export async function deactivateAdmin(ctx: AdminCtx, userId: string) {
  if (userId === ctx.userId) throw new PracticeError("self", "You cannot deactivate yourself.");
  const supers = await superAdmins(ctx);
  if (supers.has(userId) && supers.size <= 1) throw new PracticeError("last_super", "Keep at least one Super Admin.");
  await ctx.db.from("user_roles").delete().eq("user_id", userId).in("role", ["super_admin", "admin", "ops_admin", "support_agent", "finance_manager", "analyst"]);
  await ctx.db.rpc("admin_revoke_sessions", { target: userId });
  await audit(ctx, "admin_deactivated", "user", userId, {});
  return { ok: true };
}

/* ── audit trail ─────────────────────────────────────────── */

export async function auditLog(ctx: AdminCtx) {
  const { data } = await ctx.db
    .from("admin_audit_logs")
    .select("id, admin_user_id, action, target_type, target_id, details, ip_address, created_at")
    .order("created_at", { ascending: false })
    .limit(300);
  const { data: people } = await ctx.db.rpc("admin_team");
  const email = new Map(((people ?? []) as { user_id: string; email: string }[]).map((p) => [p.user_id, p.email]));
  return (data ?? []).map((r) => ({ ...r, admin: email.get(r.admin_user_id) ?? r.admin_user_id }));
}
