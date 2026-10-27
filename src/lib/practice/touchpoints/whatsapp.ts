/**
 * WhatsApp for follow-ups: which message goes with which stall, the button taps, and what each tap does.
 * Pure, so the rules are tested without WhatsApp.
 *
 * Only messages about the person's own account go out this way (their set-up, their trial, their plan, their payment),
 * and only to people who agreed to WhatsApp help. A message with no such link (a pure "checking in") is not sent on
 * WhatsApp at all: Meta treats it as Marketing, and it is a person's call to make, so it stays a manual follow-up.
 */
import { firstName, type SubjectFacts, type TouchKind } from "./rules";

export type TouchTemplateKey = "setup" | "trial" | "plan";

/** The three templates to create in WhatsApp Manager (Utility). `{{1}}` name, `{{2}}` firm, `{{3}}` the one thing that happened. */
export const TOUCH_TEMPLATES: Record<TouchTemplateKey, { name: string; body: string; example: [string, string, string] }> = {
  setup: {
    name: "fh_setup_help",
    body: "Hello {{1}}, this is the FynHelp team. You started setting up {{2}}. {{3}} If you would like a hand, tap a button below and a person will help.",
    example: ["Asha", "Rao & Co", "The next step is to add your first client, which takes about 2 minutes."],
  },
  trial: {
    name: "fh_trial_update",
    body: "Hello {{1}}, a note from FynHelp about the trial for {{2}}: it {{3}}. Nothing you have done is lost. Would you like help choosing a plan or finishing a client?",
    example: ["Asha", "Rao & Co", "ends in 2 days"],
  },
  plan: {
    name: "fh_plan_help",
    body: "Hello {{1}}, this is FynHelp about the plan for {{2}}. The payment {{3}}. Nothing is lost, and we can help you finish. Tap a button below.",
    example: ["Asha", "Rao & Co", "was not completed"],
  },
};

/** The buttons on all three: one fixed link, and three quick replies that reach a person. */
export const TOUCH_BUTTONS = { url: { text: "Open FynHelp", url: "https://fynhelp.com/app" }, replies: ["Call me", "Not now", "Stop messages"] as const };

export const templateNameFor = (key: TouchTemplateKey, env: Partial<Record<TouchTemplateKey, string | undefined>> = {}) => env[key] || TOUCH_TEMPLATES[key].name;

/** Which template a stall uses, and how long after the follow-up opens it goes (the email, where there is one, goes first). */
export const WA_PLAN: Record<TouchKind, { template: TouchTemplateKey; delayHours: number } | null> = {
  signup_unfinished: { template: "setup", delayHours: 3 },
  no_client: { template: "setup", delayHours: 0 },
  no_upload: { template: "setup", delayHours: 0 },
  trial_stalled: { template: "trial", delayHours: 0 },
  trial_ending_unpaid: { template: "trial", delayHours: 0 },
  trial_ended_unpaid: { template: "trial", delayHours: 0 },
  checkout_abandoned: { template: "plan", delayHours: 4 },
  payment_failed: { template: "plan", delayHours: 0 },
  // A check-in with nothing of theirs in it: a person decides, WhatsApp does not.
  paid_quiet: null,
};

const days = (n: unknown) => `${Number(n) || 0} day${Number(n) === 1 ? "" : "s"}`;

/** The three fields of the message, from the follow-up's own facts. Always plain, never an invented number. */
export function touchParams(kind: TouchKind, f: Pick<SubjectFacts, "name" | "firmName">, detail: Record<string, unknown> = {}): [string, string, string] | null {
  const who = firstName(f.name);
  const firm = (f.firmName || "your firm").slice(0, 60);
  switch (kind) {
    case "signup_unfinished":
      return [who, "your FynHelp account", "The next step is to set up your firm, which takes about 2 minutes."];
    case "no_client":
      return [who, firm, "The next step is to add your first client, which takes about 2 minutes."];
    case "no_upload":
      return [who, firm, "The next step is one bank statement, which FynHelp reads for you."];
    case "trial_stalled":
      return [who, firm, `has been quiet for ${days(detail["quietDays"])}`];
    case "trial_ending_unpaid":
      return [who, firm, `ends in ${days(detail["trialDaysLeft"])}`];
    case "trial_ended_unpaid":
      return [who, firm, "has ended"];
    case "checkout_abandoned":
      return [who, firm, "was not completed"];
    case "payment_failed":
      return [who, firm, "did not go through"];
    case "paid_quiet":
      return null;
  }
}

/* ── taps ── */

export type TouchAction = "call" | "later" | "stop";
export const TOUCH_ACTIONS: TouchAction[] = ["call", "later", "stop"];
export const touchPayload = (id: string, a: TouchAction) => `tp:${id}:${a}`;
const RE = /^tp:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):(call|later|stop)$/i;
export function parseTouchPayload(p: string | null | undefined): { id: string; action: TouchAction } | null {
  const m = RE.exec(p ?? "");
  return m ? { id: m[1].toLowerCase(), action: m[2].toLowerCase() as TouchAction } : null;
}

/** What a tap does and what is said back. Said inside the window the tap just opened, so it costs nothing. */
export const TOUCH_ACTION_RULES: Record<TouchAction, { note: string; reply: string }> = {
  call: {
    note: "Asked for a call (tapped Call me on WhatsApp).",
    reply: "Thank you. A person from FynHelp will call you on this number during working hours, 9:30 am to 6:30 pm, Monday to Saturday.",
  },
  later: { note: "Said not now (tapped Not now on WhatsApp). Paused for 3 days.", reply: "No problem. We will leave you be for a few days. You can write here any time." },
  stop: { note: "Asked us to stop messaging on WhatsApp.", reply: "Understood. We will not message you on WhatsApp again. You can still reach us at support@fynhelp.com." },
};

/** The last 10 digits: the key for opt-outs and for matching a reply to its follow-up. */
export const phoneKey = (raw: string | null | undefined): string | null => {
  const d = String(raw ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : null;
};

/** The sending rules, apart from the database lookups. */
export function mayMessage(i: { consent: boolean; phone: string | null; optedOut: boolean; sentToThisNumberRecently: boolean; hour: number }): { ok: boolean; why?: string } {
  if (!i.consent) return { ok: false, why: "no WhatsApp consent" };
  if (!phoneKey(i.phone)) return { ok: false, why: "no valid number" };
  if (i.optedOut) return { ok: false, why: "asked us to stop" };
  if (i.sentToThisNumberRecently) return { ok: false, why: "messaged in the last 3 days" };
  if (i.hour < 9 || i.hour >= 20) return { ok: false, why: "outside 9 am to 8 pm IST" };
  return { ok: true };
}

/* ── reading our templates back from Meta ── */

import type { MetaTemplate } from "../whatsappFlow";

type Btn = { type: string; url?: string; text?: string };

/** The quick-reply components for a template, one per quick-reply button in the order they were created. Null if it is not ours. */
export function touchButtonComponents(buttons: Btn[], id: string): Record<string, unknown>[] | null {
  const qrs = buttons.map((b, i) => ({ b, i })).filter((x) => x.b.type === "QUICK_REPLY");
  if (qrs.length !== TOUCH_ACTIONS.length) return null;
  // The link button, if there is one, is fixed: a variable in it is not ours to fill.
  if (buttons.some((b) => b.type === "URL" && /\{\{\d+\}\}/.test(b.url ?? ""))) return null;
  if (buttons.some((b) => b.type !== "QUICK_REPLY" && b.type !== "URL")) return null;
  return qrs.map((x, n) => ({ type: "button", sub_type: "quick_reply", index: String(x.i), parameters: [{ type: "payload", payload: touchPayload(id, TOUCH_ACTIONS[n]) }] }));
}

/** Approved, not Marketing, and with exactly the buttons we can fill. */
export function touchTemplateUsable(t: MetaTemplate | undefined): { ok: boolean; why?: string } {
  if (!t) return { ok: false, why: "does not exist in WhatsApp Manager" };
  if (t.status.toUpperCase() !== "APPROVED") return { ok: false, why: `is ${t.status.toLowerCase().replace("_", " ")}` };
  if ((t.category ?? "").toUpperCase() === "MARKETING") return { ok: false, why: "was classed as Marketing" };
  const bar = (t.components ?? []).find((c) => c.type === "BUTTONS");
  if (!bar?.buttons || !touchButtonComponents(bar.buttons, "00000000-0000-0000-0000-000000000000")) return { ok: false, why: "does not have the three quick-reply buttons" };
  return { ok: true };
}
