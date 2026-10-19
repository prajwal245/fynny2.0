/**
 * WhatsApp follow-ups from FynHelp's own number. Pure rules: the approved
 * templates, how a chase becomes one, who may be messaged, and how a reply is
 * read. The wording here must match what is submitted to Meta word for word
 * (docs/WHATSAPP_TEMPLATES.md); a template can only be sent as approved.
 */
import type { PlanKey } from "../billing/plans";
import { normalisePhone } from "../chaser/rules";

export interface WaTemplate {
  /** Name registered with Meta. */
  name: string;
  /** Meta category. Reminders for something the client already owes are Utility. */
  category: "UTILITY";
  language: "en";
  /** {{1}} contact, {{2}} firm, {{3}} what we need, {{4}} which client or business. */
  body: string;
}

export const WA_TEMPLATES: Record<"first" | "reminder" | "final", WaTemplate> = {
  first: {
    name: "fh_doc_request",
    category: "UTILITY",
    language: "en",
    body: "Hi {{1}}, {{2}} needs the {{3}} for {{4}}. Please reply to this chat with a photo or PDF. Reply STOP to opt out.",
  },
  reminder: {
    name: "fh_doc_reminder",
    category: "UTILITY",
    language: "en",
    body: "Hi {{1}}, a gentle reminder from {{2}}: we still need the {{3}} for {{4}}. Reply here with a photo or PDF. Reply STOP to opt out.",
  },
  final: {
    name: "fh_doc_final",
    category: "UTILITY",
    language: "en",
    body: "Hi {{1}}, final reminder from {{2}}: the {{3}} for {{4}} is still pending. Please send it today or contact {{2}} directly. Reply STOP to opt out.",
  },
};

/** Round 1 asks, the middle rounds remind, the last round says it is the last. */
export function templateFor(followUpNumber: number, maxFollowUps: number): WaTemplate {
  if (followUpNumber <= 1) return WA_TEMPLATES.first;
  if (followUpNumber >= Math.max(2, maxFollowUps)) return WA_TEMPLATES.final;
  return WA_TEMPLATES.reminder;
}

/** Meta rejects variables with line breaks, tabs, runs of spaces, or too much text. */
export function cleanParam(s: string, max = 60): string {
  const t = String(s ?? "").replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
  return (t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t) || "-";
}

export interface WaChaseInput {
  contactName: string;
  firmName: string;
  /** As it reads in a sentence, e.g. "bank statement for September 2026" (see whatText in chaser/rules). */
  item: string;
  clientName: string;
}

export function paramsFor(c: WaChaseInput): string[] {
  const first = c.contactName.trim().split(/\s+/)[0] || "there";
  return [cleanParam(first, 30), cleanParam(c.firmName, 40), cleanParam(c.item, 60), cleanParam(c.clientName, 50)];
}

/** The text a person would see, for the log and the approval screen. */
export function renderBody(t: WaTemplate, params: string[]): string {
  return t.body.replace(/\{\{(\d)\}\}/g, (_, i) => params[Number(i) - 1] ?? "");
}

/** The Graph API payload for a template message. */
export function templatePayload(to: string, t: WaTemplate, params: string[]) {
  return {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: t.name,
      language: { code: t.language },
      components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }],
    },
  };
}

/* ── who may be messaged ───────────────────────────────── */

export const last10 = (p: string | null | undefined) => String(p ?? "").replace(/\D/g, "").slice(-10);

export type Blocked = "no_number" | "opted_out" | "do_not_disturb" | "daily_limit" | "monthly_limit" | "already_sent_today";

const BLOCK_TEXT: Record<Blocked, string> = {
  no_number: "The phone number is missing or not a valid mobile number.",
  opted_out: "This person replied STOP and asked not to be messaged on WhatsApp.",
  do_not_disturb: "This client is marked do not disturb.",
  daily_limit: "Today's WhatsApp limit for the firm is reached. It resumes tomorrow.",
  monthly_limit: "This month's included WhatsApp messages are used up.",
  already_sent_today: "A WhatsApp message for this chase has already gone today.",
};
export const blockText = (b: Blocked) => BLOCK_TEXT[b];

/** First reason a message must not go, or null when it may. */
export function whyBlocked(i: {
  phone: string | null | undefined;
  optedOut: boolean;
  doNotDisturb: boolean;
  sentToday: number;
  dailyLimit: number;
  sentThisMonth: number;
  monthlyAllowance: number;
  alreadyToday: boolean;
}): Blocked | null {
  if (!normalisePhone(i.phone)) return "no_number";
  if (i.optedOut) return "opted_out";
  if (i.doNotDisturb) return "do_not_disturb";
  if (i.alreadyToday) return "already_sent_today";
  if (i.sentToday >= i.dailyLimit) return "daily_limit";
  if (i.sentThisMonth >= i.monthlyAllowance) return "monthly_limit";
  return null;
}

/**
 * Included messages a month, by plan. Essential has no WhatsApp. These numbers
 * are placeholders until pricing for per-message charges is set; past the
 * allowance messages are held, not charged.
 */
export const WA_MONTHLY_ALLOWANCE: Record<PlanKey, number> = { starter: 0, professional: 500, scale: 2000 };

/* ── replies ───────────────────────────────────────────── */

const STOP = new Set(["stop", "unsubscribe", "opt out", "optout", "cancel", "do not message", "dont message", "don't message"]);

/** A reply that means "stop messaging me". Whole-message matches only, so "please don't stop the filing" is not one. */
export function isStopReply(text: string | null | undefined): boolean {
  const t = String(text ?? "").toLowerCase().replace(/[^a-z' ]+/g, " ").replace(/\s+/g, " ").trim();
  return STOP.has(t);
}

/** Meta's delivery states in the order they can only move forward. */
const RANK: Record<string, number> = { draft: 0, sending: 1, sent: 2, delivered: 3, read: 4 };
export function nextStatus(current: string, incoming: string): string {
  if (incoming === "failed") return current === "read" || current === "delivered" ? current : "failed";
  return (RANK[incoming] ?? -1) > (RANK[current] ?? -1) ? incoming : current;
}

/**
 * Which firm a reply belongs to when everyone writes to one number: the firm
 * we messaged this person for most recently (inside `windowDays`), else the
 * only firm that has them as a client, else nobody.
 */
export function pickFirm(
  recentOutbound: { firmId: string; at: string }[],
  clientOfFirms: string[],
  now = Date.now(),
  windowDays = 30,
): string | null {
  const fresh = recentOutbound.filter((m) => now - Date.parse(m.at) <= windowDays * 86_400_000).sort((a, b) => b.at.localeCompare(a.at));
  if (fresh.length) return fresh[0].firmId;
  const firms = [...new Set(clientOfFirms)];
  return firms.length === 1 ? firms[0] : null;
}
