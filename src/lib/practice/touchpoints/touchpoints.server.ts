/**
 * Finds people who stall on the way to a working, paying firm, opens a follow-up for each (see rules.ts), sends the
 * one automatic email that fits, and closes a follow-up by itself when the person moves on. It remembers whether our
 * nudge came first, so "came back after we reached out" is a number and not a feeling.
 *
 * Runs from the cron tick at most once an hour, 9 am to 8 pm India time. Every email is claimed in the database
 * before it is sent, so it can never go twice.
 */
import type { Db } from "../db.server";
import { sendEmail } from "../email.server";
import { claimJob, istParts, recordJob } from "../jobs.server";
import { trialEndFrom, type BillingRow } from "../billing/plans";
import { lifecycleEmailsOn } from "../lifecycle/optout.server";
import { renderEmail } from "../lifecycle/emails";
import { touchpointEmail } from "./emails";
import { wanted, type SubjectFacts, type TouchKind, type Want } from "./rules";

const appUrl = () => (process.env["PUBLIC_APP_URL"] || process.env["SITE_URL"] || "https://www.fynhelp.com").replace(/\/$/, "");
const subjectOf = (r: { ca_firm_id?: string | null; user_id?: string | null }) => String(r.ca_firm_id ?? r.user_id ?? "");

interface Subject {
  id: string;
  firmId: string | null;
  userId: string | null;
  facts: SubjectFacts;
  /** Lifecycle emails are off for this firm. */
  quiet: boolean;
}

export interface TouchpointRun {
  ran: boolean;
  skipped?: string;
  opened: number;
  resolved: number;
  recovered: number;
  emailed: number;
  errors: number;
}

export async function runTouchpoints(db: Db, now: Date = new Date(), opts: { force?: boolean } = {}): Promise<TouchpointRun> {
  const out: TouchpointRun = { ran: false, opened: 0, resolved: 0, recovered: 0, emailed: 0, errors: 0 };
  const t = istParts(now);
  if (!opts.force) {
    if (!(await claimJob(db, "touchpoints", t.hourKey))) return { ...out, skipped: "already ran this hour" };
  }
  out.ran = true;
  try {
    const subjects = [...(await firmSubjects(db, now)), ...(await signupSubjects(db, now))];
    const { data: openRows } = await db.from("ca_touchpoints").select("id, kind, key, ca_firm_id, user_id, status, email_sent_at, note").eq("status", "open").limit(5000);
    const open = new Map((openRows ?? []).map((r) => [`${r.kind}|${r.key}|${subjectOf(r)}`, r]));
    const seen = new Set<string>();

    for (const s of subjects) {
      for (const w of wanted(s.facts, now)) {
        const id = `${w.kind}|${w.key}|${s.id}`;
        seen.add(id);
        if (open.has(id)) continue;
        const { error } = await db.from("ca_touchpoints").insert(row(s, w));
        // The once-only index says this stall was already followed up (and closed): leave it closed.
        if (!error) out.opened++;
        else if (!/duplicate key/i.test(error.message)) {
          out.errors++;
          console.error(`[touchpoints] ${s.id}: ${error.message}`);
        }
      }
    }
    // Closed by the person moving on.
    for (const [id, r] of open) {
      if (seen.has(id)) continue;
      const reached = Boolean(r.email_sent_at) || Boolean(r.note);
      const { error } = await db.from("ca_touchpoints").update({ status: "auto_resolved", resolved_at: now.toISOString(), recovered: reached }).eq("id", r.id).eq("status", "open");
      if (!error) {
        out.resolved++;
        if (reached) out.recovered++;
      }
    }

    // The automatic emails, 9 am to 8 pm IST only.
    if (t.hour >= 9 && t.hour < 20) out.emailed = await sendEmails(db, subjects, now);
  } catch (e) {
    out.errors++;
    console.error(`[touchpoints] ${(e as Error).message}`);
  }
  if (!opts.force) await recordJob(db, "touchpoints", t.hourKey, { ...out });
  return out;
}

const row = (s: Subject, w: Want) => ({
  kind: w.kind,
  key: w.key,
  user_id: s.userId,
  ca_firm_id: s.firmId,
  email: s.facts.email,
  name: s.facts.name,
  phone: s.facts.phone,
  whatsapp_ok: s.facts.whatsappOk,
  headline: w.headline,
  detail: { ...w.detail, firmName: s.facts.firmName, clients: s.facts.clients, documents: s.facts.documents },
  hot: w.hot,
  due_at: w.dueAt.toISOString(),
});

/** At most one automatic email per person per 20 hours, counting lifecycle emails. Each is claimed before it is sent. */
async function sendEmails(db: Db, subjects: Subject[], now: Date): Promise<number> {
  const { data: pending } = await db
    .from("ca_touchpoints")
    .select("id, kind, key, ca_firm_id, user_id, email, name, detail")
    .eq("status", "open")
    .is("email_sent_at", null)
    .in("kind", ["signup_unfinished", "checkout_abandoned"])
    .lte("due_at", now.toISOString())
    .limit(100);
  if (!pending?.length) return 0;
  const bySubject = new Map(subjects.map((s) => [s.id, s]));
  const firmIds = pending.map((p) => p.ca_firm_id).filter(Boolean) as string[];
  const recent = new Map<string, string>();
  if (firmIds.length) {
    const { data } = await db.from("ca_lifecycle_emails").select("ca_firm_id, sent_at").in("ca_firm_id", firmIds).order("sent_at", { ascending: false }).limit(2000);
    for (const r of data ?? []) if (!recent.has(String(r.ca_firm_id))) recent.set(String(r.ca_firm_id), String(r.sent_at));
  }
  let sent = 0;
  for (const p of pending) {
    const s = bySubject.get(subjectOf(p));
    // Gone from the facts, or emails are off, or they were mailed in the last 20 hours: not now.
    if (!s || !p.email || s.quiet) continue;
    const last = p.ca_firm_id ? recent.get(String(p.ca_firm_id)) : null;
    if (last && now.getTime() - new Date(last).getTime() < 20 * 3_600_000) continue;
    const claimed = await db.from("ca_touchpoints").update({ email_sent_at: now.toISOString() }).eq("id", p.id).is("email_sent_at", null).select("id");
    if (!claimed.data?.length) continue;
    const parts = touchpointEmail(p.kind as "signup_unfinished" | "checkout_abandoned", { plan: p.key });
    const { html, text } = renderEmail(parts, { appUrl: appUrl(), firmName: (p.name as string | null) || "there", unsubscribeUrl: null, category: "billing" });
    const res = await sendEmail({ to: String(p.email), subject: parts.subject, html, text, replyTo: "support@fynhelp.com" });
    if (!res.sent && !res.simulated) {
      await db.from("ca_touchpoints").update({ email_sent_at: null }).eq("id", p.id);
      continue;
    }
    sent++;
  }
  return sent;
}

/* ── who to look at ───────────────────────────────────────── */

type FirmRow = {
  id: string;
  user_id: string | null;
  firm_name: string;
  ca_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
  notification_prefs: unknown;
  is_demo: boolean | null;
  is_test: boolean | null;
};

async function firmSubjects(db: Db, now: Date): Promise<Subject[]> {
  const since = new Date(now.getTime() - 60 * 86_400_000).toISOString();
  const [{ data: bills }, { data: recent }] = await Promise.all([
    db.from("ca_billing").select("*, ca_firms!inner(id, user_id, firm_name, ca_name, email, phone, created_at, notification_prefs, is_demo, is_test)").limit(1500),
    db.from("ca_firms").select("id, user_id, firm_name, ca_name, email, phone, created_at, notification_prefs, is_demo, is_test").gte("created_at", since).limit(1500),
  ]);
  const byFirm = new Map<string, { firm: FirmRow; billing: BillingRow & Record<string, unknown> }>();
  for (const b of (bills ?? []) as unknown as (BillingRow & Record<string, unknown> & { ca_firm_id: string; ca_firms: FirmRow })[]) {
    if (new Date(b.ca_firms.created_at) < new Date(since) && !["active", "past_due", "halted", "pending"].includes(b.status) && !(b.status === "trialing")) continue;
    byFirm.set(b.ca_firm_id, { firm: b.ca_firms, billing: b });
  }
  // A firm that never opened the app has no billing row yet: its trial has not started.
  for (const f of (recent ?? []) as FirmRow[])
    if (!byFirm.has(f.id))
      byFirm.set(f.id, { firm: f, billing: { plan: "starter", cycle: "monthly", status: "trialing", trial_ends_at: trialEndFrom(new Date(f.created_at)).toISOString(), trial_started_at: null } as never });
  const list = [...byFirm.values()].filter((x) => !x.firm.is_demo && !x.firm.is_test);
  if (!list.length) return [];
  const ids = list.map((x) => x.firm.id);
  const [clients, docs, runs] = await Promise.all([
    db.from("ca_clients").select("ca_firm_id").in("ca_firm_id", ids).neq("client_status", "archived").limit(50000),
    db.from("ca_document_extractions").select("ca_firm_id, created_at").in("ca_firm_id", ids).order("created_at", { ascending: false }).limit(50000),
    db.from("ca_agent_runs").select("ca_firm_id, started_at").in("ca_firm_id", ids).eq("agent", "recon").order("started_at", { ascending: false }).limit(20000),
  ]);
  const clientN = new Map<string, number>();
  for (const r of clients.data ?? []) clientN.set(String(r.ca_firm_id), (clientN.get(String(r.ca_firm_id)) ?? 0) + 1);
  const docN = new Map<string, number>();
  const last = new Map<string, string>();
  const bump = (id: string, at: string) => {
    if (!last.has(id) || at > last.get(id)!) last.set(id, at);
  };
  for (const r of docs.data ?? []) {
    docN.set(String(r.ca_firm_id), (docN.get(String(r.ca_firm_id)) ?? 0) + 1);
    bump(String(r.ca_firm_id), String(r.created_at));
  }
  for (const r of runs.data ?? []) bump(String(r.ca_firm_id), String(r.started_at));
  return list.map(({ firm, billing }) => ({
    id: firm.id,
    firmId: firm.id,
    userId: firm.user_id,
    quiet: !lifecycleEmailsOn(firm.notification_prefs),
    facts: {
      type: "firm" as const,
      createdAt: firm.created_at,
      name: firm.ca_name,
      email: firm.email,
      phone: firm.phone,
      firmName: firm.firm_name,
      whatsappOk: Boolean(((firm.notification_prefs ?? {}) as Record<string, unknown>)["touch_whatsapp_ok"]),
      clients: clientN.get(firm.id) ?? 0,
      documents: docN.get(firm.id) ?? 0,
      lastActivityAt: last.get(firm.id) ?? null,
      billing: billing as never,
    },
  }));
}

/** People who created an account in the last 7 days and have no firm and no team seat. */
async function signupSubjects(db: Db, now: Date): Promise<Subject[]> {
  const since = now.getTime() - 7 * 86_400_000;
  const users: { id: string; email?: string; created_at: string; user_metadata?: Record<string, unknown> }[] = [];
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users.length) break;
    users.push(...(data.users as never[]));
    if (data.users.length < 1000) break;
  }
  const fresh = users.filter((u) => new Date(u.created_at).getTime() >= since);
  if (!fresh.length) return [];
  const ids = fresh.map((u) => u.id);
  const [owners, members] = await Promise.all([
    db.from("ca_firms").select("user_id").in("user_id", ids),
    db.from("ca_firm_members").select("user_id").in("user_id", ids).neq("status", "revoked"),
  ]);
  const has = new Set([...(owners.data ?? []), ...(members.data ?? [])].map((r) => String(r.user_id)));
  return fresh
    .filter((u) => !has.has(u.id) && u.email && !/@fynhelp\.com$/i.test(u.email))
    .map((u) => ({
      id: u.id,
      firmId: null,
      userId: u.id,
      quiet: false,
      facts: {
        type: "signup" as const,
        createdAt: u.created_at,
        name: (u.user_metadata?.["full_name"] as string | undefined) ?? null,
        email: u.email ?? null,
        phone: (u.user_metadata?.["phone"] as string | undefined) ?? null,
        firmName: null,
        whatsappOk: u.user_metadata?.["whatsapp_ok"] === true,
        clients: 0,
        documents: 0,
        lastActivityAt: null,
      },
    }));
}

export type { TouchKind };
