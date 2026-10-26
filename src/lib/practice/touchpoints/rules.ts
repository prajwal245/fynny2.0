/**
 * Who has stalled, and what a person at FynHelp should say. Pure, so the rules are tested without a database:
 * the runner gathers facts, asks here what is needed, opens those follow-ups, and closes the ones that no longer apply.
 *
 * Two kinds of people: a sign-up with no firm yet, and a firm. Nothing here guesses: each rule is a plain fact
 * (no client added, no upload, plan chosen but not paid) with the time that makes it a stall rather than a pause.
 */
import { accessFor, type BillingRow } from "../billing/plans";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export type TouchKind =
  | "signup_unfinished"
  | "no_client"
  | "no_upload"
  | "trial_stalled"
  | "checkout_abandoned"
  | "trial_ending_unpaid"
  | "trial_ended_unpaid"
  | "payment_failed"
  | "paid_quiet";

export const KIND_LABEL: Record<TouchKind, string> = {
  signup_unfinished: "Sign-up not finished",
  no_client: "No client added",
  no_upload: "No first upload",
  trial_stalled: "Trial gone quiet",
  checkout_abandoned: "Plan chosen, not paid",
  trial_ending_unpaid: "Trial ending",
  trial_ended_unpaid: "Trial ended, not paid",
  payment_failed: "Payment failing",
  paid_quiet: "Paying but quiet",
};

/** The steps of the journey, in order, for the funnel on the admin page. */
export const FUNNEL_STEPS = ["Signed up", "Firm created", "First client", "First upload", "First reconciliation", "Paying"] as const;

export interface SubjectFacts {
  /** A sign-up with no firm yet, or a firm. */
  type: "signup" | "firm";
  createdAt: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  firmName: string | null;
  whatsappOk: boolean;
  clients: number;
  documents: number;
  lastActivityAt: string | null;
  billing?: BillingRow & {
    pending_plan?: string | null;
    razorpay_subscription_id?: string | null;
    updated_at?: string | null;
    first_paid_at?: string | null;
  };
}

export interface Want {
  kind: TouchKind;
  key: string;
  headline: string;
  hot: boolean;
  /** Not before this moment. */
  dueAt: Date;
  /** An automatic email goes with it, once. */
  email: "signup_unfinished" | "checkout_abandoned" | null;
  detail: Record<string, unknown>;
}

const since = (iso: string | null | undefined, now: Date) => (iso ? now.getTime() - new Date(iso).getTime() : Infinity);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
export const firstName = (n: string | null | undefined) => (n ?? "").trim().split(/\s+/)[0] || "there";

export function wanted(f: SubjectFacts, now: Date = new Date()): Want[] {
  const out: Want[] = [];
  const age = since(f.createdAt, now);
  const who = f.firmName ? f.firmName : f.name ?? f.email ?? "A new sign-up";

  if (f.type === "signup") {
    if (age >= 30 * MIN && age < 7 * DAY)
      out.push({
        kind: "signup_unfinished",
        key: "",
        headline: `${who} created an account ${ago(age)} ago but has not set up a firm.`,
        hot: false,
        dueAt: new Date(new Date(f.createdAt).getTime() + 30 * MIN),
        email: age >= HOUR ? "signup_unfinished" : null,
        detail: { signedUp: f.createdAt },
      });
    return out;
  }

  const b = f.billing;
  const days = Math.floor(age / DAY);
  const paid = !!b && ["active", "past_due", "halted"].includes(b.status) && !!b.first_paid_at;
  const quiet = since(f.lastActivityAt ?? b?.first_paid_at ?? f.createdAt, now);
  const a = b ? accessFor(b, now) : null;

  if (f.clients === 0 && age >= DAY && age < 30 * DAY && !paid)
    out.push({ kind: "no_client", key: "", headline: `${who} signed up ${plural(days, "day")} ago and has not added a client.`, hot: false, dueAt: new Date(new Date(f.createdAt).getTime() + DAY), email: null, detail: { days } });

  if (f.clients > 0 && f.documents === 0 && age >= 2 * DAY && age < 30 * DAY && !paid)
    out.push({ kind: "no_upload", key: "", headline: `${who} added ${plural(f.clients, "client")} but has not uploaded a document.`, hot: false, dueAt: new Date(new Date(f.createdAt).getTime() + 2 * DAY), email: null, detail: { clients: f.clients } });

  if (b?.status === "trialing" && b.trial_started_at && a?.canWork && !a.trialNotStarted) {
    const gap = since(f.lastActivityAt ?? b.trial_started_at, now);
    if (gap >= 4 * DAY)
      out.push({ kind: "trial_stalled", key: "", headline: `${who} started the trial but nothing has happened for ${plural(Math.floor(gap / DAY), "day")}. ${a.trialDaysLeft} left.`, hot: false, dueAt: now, email: null, detail: { quietDays: Math.floor(gap / DAY), trialDaysLeft: a.trialDaysLeft } });
    if ((a.trialDaysLeft ?? 99) <= 3)
      out.push({ kind: "trial_ending_unpaid", key: "", headline: `${who}'s trial ends in ${plural(a.trialDaysLeft ?? 0, "day")} and they have not chosen a plan.`, hot: true, dueAt: now, email: null, detail: { trialDaysLeft: a.trialDaysLeft, clients: f.clients, documents: f.documents } });
  }
  if (b?.status === "trialing" && a && !a.canWork) {
    const ended = since(b.trial_ends_at, now);
    if (ended >= 0 && ended < 7 * DAY)
      out.push({ kind: "trial_ended_unpaid", key: "", headline: `${who}'s trial ended ${ago(ended)} ago without a plan.`, hot: true, dueAt: now, email: null, detail: { clients: f.clients, documents: f.documents } });
  }

  // They pressed "Choose plan", got as far as Razorpay, and stopped.
  if (b?.pending_plan && b.razorpay_subscription_id && (b.status === "trialing" || b.status === "pending")) {
    const idle = since(b.updated_at, now);
    if (idle >= 45 * MIN && idle < 14 * DAY)
      out.push({ kind: "checkout_abandoned", key: String(b.pending_plan), headline: `${who} chose the ${b.pending_plan} plan ${ago(idle)} ago but did not finish paying.`, hot: true, dueAt: new Date(new Date(b.updated_at!).getTime() + 45 * MIN), email: idle >= HOUR ? "checkout_abandoned" : null, detail: { plan: b.pending_plan, cycle: b.cycle } });
  }

  if (b && (b.status === "past_due" || b.status === "halted"))
    out.push({ kind: "payment_failed", key: b.status, headline: `${who}'s plan payment ${b.status === "halted" ? "failed several times and the plan is paused" : "failed and is being retried"}.`, hot: true, dueAt: now, email: null, detail: { status: b.status, plan: b.plan } });

  if (b && b.status === "active" && b.first_paid_at && quiet >= 10 * DAY)
    out.push({ kind: "paid_quiet", key: now.toISOString().slice(0, 7), headline: `${who} pays for FynHelp but has done nothing for ${plural(Math.floor(quiet / DAY), "day")}.`, hot: false, dueAt: now, email: null, detail: { quietDays: Math.floor(quiet / DAY), plan: b.plan } });

  return out;
}

function ago(ms: number): string {
  if (ms < HOUR) return plural(Math.max(1, Math.round(ms / MIN)), "minute");
  if (ms < DAY) return plural(Math.round(ms / HOUR), "hour");
  return plural(Math.round(ms / DAY), "day");
}

/**
 * What to say first, for WhatsApp or a call. Warm, short, and about them: no pitch, one easy offer of help.
 * `me` is the person at FynHelp; without a name it speaks as the team.
 */
export function scriptFor(kind: TouchKind, f: Pick<SubjectFacts, "name" | "firmName" | "clients" | "documents">, me?: string): string {
  const hi = `Hi ${firstName(f.name)}, it's ${me?.trim() || "the team"} at FynHelp.`;
  const firm = f.firmName ?? "your firm";
  switch (kind) {
    case "signup_unfinished":
      return `${hi} I saw you started creating your FynHelp account. It takes about 2 minutes to finish. Want me to walk you through it, or is there something you wanted to check first?`;
    case "no_client":
      return `${hi} I saw ${firm} is set up. Shall I help you add your first client? It takes about 2 minutes, and I can do it with you on a quick call if that is easier.`;
    case "no_upload":
      return `${hi} You have added your client on FynHelp. The next step is one bank statement: FynHelp reads it and shows only what needs your decision. Do you have one handy? I can help you through the first upload.`;
    case "trial_stalled":
      return `${hi} I noticed ${firm}'s FynHelp trial has been quiet for a few days. Did something get in the way? I am happy to help you finish one client's month end, in about 15 minutes.`;
    case "checkout_abandoned":
      return `${hi} I saw you were choosing a plan for ${firm} and did not get to finish. Was there a question about the plan, the price or the payment? I can help right now.`;
    case "trial_ending_unpaid":
      return `${hi} ${firm}'s FynHelp trial ends in a few days. You have done real work in it${f.documents ? ` (${plural(f.documents, "document")} so far)` : ""}. Would it help to go through which plan fits you? Nothing you have done is lost either way.`;
    case "trial_ended_unpaid":
      return `${hi} ${firm}'s FynHelp trial has ended. Your data is safe and readable for 30 days. If it was not the right fit, I would value hearing why. If you would like to continue, I can help you choose a plan.`;
    case "payment_failed":
      return `${hi} The payment for ${firm}'s FynHelp plan did not go through. It is usually a card limit or an expired UPI mandate. I can send you a fresh payment link, or you can update it in Settings, Billing.`;
    case "paid_quiet":
      return `${hi} I noticed ${firm} has not used FynHelp for a while. Is everything working for you? If a client or a report is giving trouble, I would be glad to help.`;
  }
}
