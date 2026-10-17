/**
 * Sends the lifecycle emails (see schedule.ts for the rules, emails.ts for
 * the copy). Runs from the cron tick at most once an hour, between 9 am and
 * 8 pm India time. Each firm gets at most one email per run; every send is
 * recorded in ca_lifecycle_emails first, so it can never go twice.
 * Without RESEND_API_KEY nothing is sent (and nothing recorded).
 */
import type { Db } from "../db.server";
import { sendEmail } from "../email.server";
import { claimJob, istParts, recordJob } from "../jobs.server";
import { previousMonth } from "../billing/arrears";
import { accessFor, cheapestPlan, documentAllowance, type BillingRow, type Cycle, type PlanKey } from "../billing/plans";
import { monthRange, usageFor } from "../billing/usage.server";
import { lifecycleEmail, renderEmail, type EmailContext } from "./emails";
import { lifecycleEmailsOn, optOutUrl } from "./optout.server";
import { nextEmail, type Due, type FirmFacts } from "./schedule";

const BUDGET_MS = 25_000;

interface FirmRow extends BillingRow {
  ca_firm_id: string;
  current_period_end: string | null;
  first_paid_at: string | null;
  ca_firms: { firm_name: string; email: string | null; created_at: string; notification_prefs: unknown; is_demo: boolean | null } | null;
}

export interface LifecycleResult {
  ran: boolean;
  skipped?: string;
  checked: number;
  sent: { firmId: string; kind: string }[];
  errors: number;
}

const appUrl = () => (process.env["PUBLIC_APP_URL"] || process.env["SITE_URL"] || "https://www.fynhelp.com").replace(/\/$/, "");

export async function runLifecycle(db: Db, now: Date = new Date(), opts: { force?: boolean; firmIds?: string[] } = {}): Promise<LifecycleResult> {
  const out: LifecycleResult = { ran: false, checked: 0, sent: [], errors: 0 };
  if (!process.env["RESEND_API_KEY"]) return { ...out, skipped: "email not configured" };
  const t = istParts(now);
  if (!opts.force) {
    if (t.hour < 9 || t.hour >= 20) return { ...out, skipped: "outside 9 am to 8 pm IST" };
    if (!(await claimJob(db, "lifecycle", t.hourKey))) return { ...out, skipped: "already ran this hour" };
  }
  out.ran = true;
  const started = Date.now();

  let q = db
    .from("ca_billing")
    .select("ca_firm_id, plan, cycle, status, trial_ends_at, trial_started_at, activated_at, current_period_end, first_paid_at, ca_firms!inner(firm_name, email, created_at, notification_prefs, is_demo)")
    .limit(500);
  if (opts.firmIds?.length) q = q.in("ca_firm_id", opts.firmIds);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const firms = ((data ?? []) as unknown as FirmRow[]).filter((f) => f.ca_firms?.email && !f.ca_firms.is_demo);
  if (!firms.length) return out;
  const ids = firms.map((f) => f.ca_firm_id);

  const prevMonth = previousMonth(t.month);
  const [{ data: ledger }, { data: charges }] = await Promise.all([
    db.from("ca_lifecycle_emails").select("ca_firm_id, kind, key, sent_at").in("ca_firm_id", ids).limit(20000),
    db.from("ca_usage_charges").select("*").eq("month", prevMonth).in("ca_firm_id", ids),
  ]);
  const sentBy = new Map<string, { set: Set<string>; last: string | null }>();
  for (const r of ledger ?? []) {
    const e = sentBy.get(String(r.ca_firm_id)) ?? { set: new Set<string>(), last: null };
    e.set.add(`${r.kind}:${r.key}`);
    if (!e.last || String(r.sent_at) > e.last) e.last = String(r.sent_at);
    sentBy.set(String(r.ca_firm_id), e);
  }
  const chargeBy = new Map((charges ?? []).map((c) => [String(c.ca_firm_id), c as Record<string, unknown>]));

  for (const f of firms) {
    if (Date.now() - started > BUDGET_MS) break;
    out.checked++;
    try {
      const facts = await gatherFacts(db, f, t, prevMonth, sentBy.get(f.ca_firm_id), chargeBy.get(f.ca_firm_id) ?? null);
      const due = nextEmail(facts.facts, now);
      if (!due) continue;
      const ok = await send(db, f, due, facts, prevMonth, chargeBy.get(f.ca_firm_id) ?? null);
      if (ok) out.sent.push({ firmId: f.ca_firm_id, kind: due.kind });
    } catch (e) {
      out.errors++;
      console.error(`[lifecycle] ${f.ca_firm_id}: ${(e as Error).message}`);
    }
  }
  if (!opts.force) await recordJob(db, "lifecycle", t.hourKey, { checked: out.checked, sent: out.sent.length, errors: out.errors });
  return out;
}

async function lastActivity(db: Db, firmId: string): Promise<string | null> {
  const [doc, run] = await Promise.all([
    db.from("ca_document_extractions").select("created_at").eq("ca_firm_id", firmId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("ca_agent_runs").select("started_at").eq("ca_firm_id", firmId).eq("agent", "recon").order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const a = (doc.data?.created_at as string | undefined) ?? null;
  const b = (run.data?.started_at as string | undefined) ?? null;
  return a && b ? (a > b ? a : b) : (a ?? b);
}

async function gatherFacts(
  db: Db,
  f: FirmRow,
  t: ReturnType<typeof istParts>,
  prevMonth: string,
  sent: { set: Set<string>; last: string | null } | undefined,
  charge: Record<string, unknown> | null,
) {
  const paid = f.status !== "trialing";
  const usage = f.trial_started_at || paid ? await usageFor(db, f.ca_firm_id, t.month) : { month: t.month, activeClients: 0, documents: 0, activeIds: new Set<string>() };
  let dormant: string[] = [];
  if (paid && t.day >= 24 && t.day <= 28) {
    const last = await usageFor(db, f.ca_firm_id, prevMonth);
    const ids = [...last.activeIds].filter((id) => !usage.activeIds.has(id));
    if (ids.length) {
      const { data } = await db.from("ca_clients").select("client_name").eq("ca_firm_id", f.ca_firm_id).in("business_id", ids).neq("client_status", "archived").limit(50);
      dormant = (data ?? []).map((r) => String(r.client_name));
    }
  }
  const facts: FirmFacts = {
    firmCreatedAt: f.ca_firms!.created_at,
    billing: f,
    month: t.month,
    previousMonth: prevMonth,
    istDay: t.day,
    usage,
    documentLimit: paid ? documentAllowance(f.plan, usage.activeClients) : null,
    lastActivityAt: paid ? await lastActivity(db, f.ca_firm_id) : null,
    sent: sent?.set ?? new Set(),
    lastSentAt: sent?.last ?? null,
    optedOut: !lifecycleEmailsOn(f.ca_firms!.notification_prefs),
    previousCharge: charge ? { status: String(charge.status) } : null,
    dormantClients: dormant.length,
  };
  return { facts, usage, dormant };
}

async function totals(db: Db, firmId: string) {
  const [clients, documents, matched, reports] = await Promise.all([
    db.from("ca_clients").select("id", { count: "exact", head: true }).eq("ca_firm_id", firmId).neq("client_status", "archived"),
    db.from("ca_document_extractions").select("id", { count: "exact", head: true }).eq("ca_firm_id", firmId),
    db.from("ca_recon_matches").select("id", { count: "exact", head: true }).eq("ca_firm_id", firmId).neq("status", "reversed"),
    db.from("ca_agent_runs").select("id", { count: "exact", head: true }).eq("ca_firm_id", firmId).eq("agent", "narrate").eq("status", "succeeded"),
  ]);
  return { clients: clients.count ?? 0, documents: documents.count ?? 0, matchedLines: matched.count ?? 0, reports: reports.count ?? 0 };
}

async function reportsIn(db: Db, firmId: string, month: string) {
  const { start, end } = monthRange(month);
  const { count } = await db
    .from("ca_agent_runs")
    .select("id", { count: "exact", head: true })
    .eq("ca_firm_id", firmId)
    .eq("agent", "narrate")
    .eq("status", "succeeded")
    .gte("started_at", start)
    .lt("started_at", end);
  return count ?? 0;
}

async function send(
  db: Db,
  f: FirmRow,
  due: Due,
  g: Awaited<ReturnType<typeof gatherFacts>>,
  prevMonth: string,
  charge: Record<string, unknown> | null,
): Promise<boolean> {
  const firm = f.ca_firms!;
  const tot = await totals(db, f.ca_firm_id);
  const a = accessFor(f);
  const ctx: EmailContext = {
    firmName: firm.firm_name,
    plan: f.plan as PlanKey,
    cycle: f.cycle as Cycle,
    trialDaysLeft: a.trialDaysLeft,
    trialEndsAt: f.trial_ends_at,
    totals: tot,
    usage: { activeClients: g.usage.activeClients, documents: g.usage.documents },
    documentLimit: g.facts.documentLimit,
    recommended: cheapestPlan(Math.max(g.usage.activeClients, tot.clients, 1)),
    dormantClientNames: g.dormant,
  };
  if (due.kind === "usage_summary" && charge) {
    const subtotal = Number(charge.subtotal);
    ctx.previous = {
      month: prevMonth,
      activeClients: Number(charge.active_clients),
      documents: Number(charge.documents),
      reports: await reportsIn(db, f.ca_firm_id, prevMonth),
      arrears:
        subtotal > 0
          ? {
              extraClients: Number(charge.extra_clients),
              extraClientsAmount: Number(charge.extra_clients_amount),
              overageBlocks: Number(charge.overage_blocks),
              overageAmount: Number(charge.overage_amount),
              subtotal,
              gst: Number(charge.gst),
              total: Number(charge.total),
              paise: Math.round(Number(charge.total) * 100),
            }
          : null,
      method: charge.method as "none" | "addon" | "invoice",
      payUrl: (charge.pay_url as string | null) ?? null,
      nextPaymentDate: f.current_period_end,
    };
  }
  const parts = lifecycleEmail(due.kind, ctx);
  const unsubscribeUrl = optOutUrl(appUrl(), f.ca_firm_id);
  const { html, text } = renderEmail(parts, { appUrl: appUrl(), firmName: firm.firm_name, unsubscribeUrl, category: due.category });

  // Record first: a second run racing this one hits the primary key and stops.
  const { error: claimErr } = await db.from("ca_lifecycle_emails").insert({ ca_firm_id: f.ca_firm_id, kind: due.kind, key: due.key });
  if (claimErr) return false;
  const res = await sendEmail({
    to: firm.email!,
    subject: parts.subject,
    html,
    text,
    replyTo: "support@fynhelp.com",
    headers:
      due.category === "lifecycle" && unsubscribeUrl
        ? { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
        : undefined,
  });
  if (!res.sent) {
    await db.from("ca_lifecycle_emails").delete().eq("ca_firm_id", f.ca_firm_id).eq("kind", due.kind).eq("key", due.key);
    throw new Error(res.error ?? "email not sent");
  }
  await db.from("ca_lifecycle_emails").update({ provider_id: res.provider_id }).eq("ca_firm_id", f.ca_firm_id).eq("kind", due.kind).eq("key", due.key);
  return true;
}
