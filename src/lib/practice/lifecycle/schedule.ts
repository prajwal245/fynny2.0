/**
 * Which lifecycle email a firm is due right now, if any. Pure, so the rules
 * can be tested without a database: the cron job gathers the facts, asks
 * here, sends what comes back and records it so it never goes twice.
 *
 * Trial: nudges to make the first upload, a welcome when the clock starts, a
 * push towards the first reconciliation, a recap of what was done, reminders
 * at 5 and 2 days left (day 10 and 12 of the 14-day trial), and two after it ends.
 * Paid plans: a monthly usage summary (with any extras billed for the month),
 * document allowance warnings, Essential's active-client cap, a check-in when
 * the firm goes quiet, and a month-end reminder for clients with nothing yet.
 */
import { accessFor, type BillingRow, type PlanKey, type Usage } from "../billing/plans";

const DAY = 86_400_000;

export type LifecycleKind =
  | "trial_upload_1"
  | "trial_upload_4"
  | "trial_welcome"
  | "trial_activated"
  | "trial_first_recon"
  | "trial_recap"
  | "trial_ending_5"
  | "trial_ending_2"
  | "trial_ended"
  | "trial_winback"
  | "usage_summary"
  | "docs_100"
  | "docs_80"
  | "essential_cap"
  | "inactive"
  | "month_end_prep";

export interface Due {
  kind: LifecycleKind;
  /** Makes the email once-only: "" for once ever, a month for monthly ones. */
  key: string;
  /** Billing emails go regardless of the firm's email preference. */
  category: "billing" | "lifecycle";
}

export interface FirmFacts {
  firmCreatedAt: string;
  billing: BillingRow & { first_paid_at?: string | null };
  /** Current calendar month in India time, "2026-10", and the day of it. */
  month: string;
  previousMonth: string;
  istDay: number;
  /** This month so far. */
  usage: Usage;
  /** Pooled document allowance for this month on the firm's plan. */
  documentLimit: number | null;
  /** Last upload or reconciliation, any client. */
  lastActivityAt: string | null;
  /** "kind:key" of everything already sent. */
  sent: Set<string>;
  lastSentAt: string | null;
  /** The firm switched lifecycle emails off. */
  optedOut: boolean;
  /** Last month's charge row exists and was billed (extras charged), or recorded with nothing to charge. */
  previousCharge: { status: string } | null;
  /** Clients active last month with nothing yet this month. */
  dormantClients: number;
}

const wasSent = (f: FirmFacts, kind: LifecycleKind, key = "") => f.sent.has(`${kind}:${key}`);

/** Every email the firm is due, most important first. */
export function dueEmails(f: FirmFacts, now: Date = new Date()): Due[] {
  const out: Due[] = [];
  const add = (kind: LifecycleKind, key = "", category: Due["category"] = "lifecycle") => {
    if (!wasSent(f, kind, key)) out.push({ kind, key, category });
  };
  const b = f.billing;
  const a = accessFor(b, now);
  const since = (iso: string | null | undefined) => (iso ? (now.getTime() - new Date(iso).getTime()) / DAY : Infinity);

  if (b.status === "trialing") {
    if (a.trialNotStarted) {
      const d = since(f.firmCreatedAt);
      if (d >= 4 && d < 10) add("trial_upload_4");
      else if (d >= 1 && d < 4) add("trial_upload_1");
      return out;
    }
    if (a.canWork && a.trialDaysLeft != null) {
      const d = since(b.trial_started_at ?? f.firmCreatedAt);
      if (b.activated_at && since(b.activated_at) < 3) add("trial_activated");
      if (d < 1) add("trial_welcome");
      if (a.trialDaysLeft <= 2) add("trial_ending_2");
      else if (a.trialDaysLeft <= 5) add("trial_ending_5");
      if (d >= 5 && d < 9) add("trial_recap");
      if (d >= 2 && d < 5 && !b.activated_at) add("trial_first_recon");
      return out;
    }
    const ended = since(b.trial_ends_at);
    if (ended < 7) add("trial_ended");
    else if (ended >= 14 && ended < 21) add("trial_winback");
    return out;
  }

  // Paid plans (and a cancelled plan still inside its paid period).
  if (!a.canWork) return out;
  const paidBeforeThisMonth = b.first_paid_at ? new Date(b.first_paid_at).getTime() < monthStartMs(f.month) : false;
  if (paidBeforeThisMonth && f.previousCharge && ["billed", "none", "paid"].includes(f.previousCharge.status))
    add("usage_summary", f.previousMonth, f.previousCharge.status === "none" ? "lifecycle" : "billing");
  if (f.documentLimit) {
    if (f.usage.documents >= f.documentLimit) add("docs_100", f.month);
    else if (f.usage.documents >= f.documentLimit * 0.8 && !wasSent(f, "docs_100", f.month)) add("docs_80", f.month);
  }
  if ((b.plan as PlanKey) === "starter" && f.usage.activeClients >= 20) add("essential_cap", f.month);
  const quiet = since(f.lastActivityAt ?? b.first_paid_at ?? f.firmCreatedAt);
  if (quiet >= 14) add("inactive", f.month);
  if (f.istDay >= 24 && f.istDay <= 28 && f.dormantClients > 0) add("month_end_prep", f.month);
  return out;
}

/**
 * The one email to send now. Billing emails always go. Other emails respect
 * the firm's opt-out and go at most once in 20 hours, so a firm never gets a
 * pile of mail on the same day.
 */
export function nextEmail(f: FirmFacts, now: Date = new Date()): Due | null {
  const recent = f.lastSentAt ? now.getTime() - new Date(f.lastSentAt).getTime() < 20 * 3_600_000 : false;
  for (const d of dueEmails(f, now)) {
    if (d.category === "billing") return d;
    if (f.optedOut || recent) continue;
    return d;
  }
  return null;
}

function monthStartMs(month: string): number {
  return new Date(`${month}-01T00:00:00+05:30`).getTime();
}
