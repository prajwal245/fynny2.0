/**
 * Chaser agent — the decision rules, templates and WhatsApp quick-send link.
 *
 * Schedule: a follow-up goes out on each day in `schedule_days` (counted from
 * creation). After `max_follow_ups` unanswered nudges, the next due slot
 * escalates to a person instead of sending a third message. A resolved item,
 * a do-not-disturb client or a same-day repeat never sends anything.
 */

export interface ChaseState {
  status: "open" | "fulfilled" | "resolved" | "cancelled" | string;
  created_at: string; // ISO
  chaser_count: number;
  max_follow_ups: number;
  schedule_days: number[];
  escalated_at: string | null;
  last_chased_at: string | null;
  next_follow_up_at: string | null;
  do_not_disturb: boolean;
  contact_email: string | null;
}

export type ChaseDecision =
  | { action: "skip"; reason: string }
  | { action: "send"; follow_up_number: number; next_follow_up_at: string | null }
  | { action: "escalate" };

const DAY = 86_400_000;

export const DEFAULT_SCHEDULE = [0, 3, 7];

export function isClosed(status: string) {
  return status === "fulfilled" || status === "resolved" || status === "cancelled";
}

/** When the n-th (0-based) follow-up slot falls due. */
export function slotAt(createdAt: string, schedule: number[], n: number): string | null {
  const day = schedule[n];
  if (day === undefined) return null;
  return new Date(Date.parse(createdAt) + day * DAY).toISOString();
}

export function decide(s: ChaseState, now: Date): ChaseDecision {
  if (isClosed(s.status)) return { action: "skip", reason: "resolved" };
  if (s.escalated_at) return { action: "skip", reason: "already escalated" };
  if (s.do_not_disturb) return { action: "skip", reason: "client marked do not disturb" };
  const schedule = s.schedule_days?.length ? s.schedule_days : DEFAULT_SCHEDULE;
  const due = s.next_follow_up_at ?? slotAt(s.created_at, schedule, s.chaser_count);
  if (!due || Date.parse(due) > now.getTime()) return { action: "skip", reason: "not due" };
  // Never two nudges on the same calendar day (cron retries, manual + auto).
  if (s.last_chased_at && s.last_chased_at.slice(0, 10) === now.toISOString().slice(0, 10)) {
    return { action: "skip", reason: "already chased today" };
  }
  if (s.chaser_count >= s.max_follow_ups) return { action: "escalate" };
  if (!s.contact_email) return { action: "skip", reason: "no contact email" };
  const next = slotAt(s.created_at, schedule, s.chaser_count + 1);
  // If the schedule has no further slot, escalate one schedule-gap later.
  const fallback = new Date(now.getTime() + 4 * DAY).toISOString();
  return { action: "send", follow_up_number: s.chaser_count + 1, next_follow_up_at: next && Date.parse(next) > now.getTime() ? next : fallback };
}

/* ── templates ──────────────────────────────────────────── */

export interface TemplateInput {
  contactName: string;
  clientName: string;
  firmName: string;
  item: string; // "Bank statement"
  period: string | null; // "September 2026"
  dueDate: string | null;
  note?: string | null;
}

export interface RenderedEmail {
  template_id: string;
  subject: string;
  text: string;
  html: string;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

const what = (t: TemplateInput) => `${t.item.toLowerCase()}${t.period ? ` for ${t.period}` : ""}`;

export function renderEmail(followUpNumber: number, t: TemplateInput): RenderedEmail {
  const first = followUpNumber <= 1;
  const subject = first
    ? `Gentle reminder – ${t.item}${t.period ? ` for ${t.period}` : ""}`
    : `Following up – ${t.item}${t.period ? ` for ${t.period}` : ""}`;
  const lines = [
    `Dear ${t.contactName || "Sir/Madam"},`,
    "",
    first
      ? `We hope you are well. To complete the accounts of ${t.clientName}, could you please share the ${what(t)}${t.dueDate ? ` by ${t.dueDate}` : ""}?`
      : `This is a gentle follow-up on our earlier request for the ${what(t)} of ${t.clientName}. We would be grateful if you could share it at your earliest convenience.`,
    t.note ? `\nNote: ${t.note}` : "",
    "",
    "You can simply reply to this email with the document attached.",
    "",
    "Thank you in advance.",
    "",
    "Warm regards,",
    t.firmName,
  ].filter((l) => l !== null);
  const text = lines.join("\n").replace(/\n{3,}/g, "\n\n");
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#1a1a1a">${text
    .split("\n\n")
    .map((p) => `<p style="margin:0 0 12px">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("")}</div>`;
  return { template_id: first ? "chase_email_first" : "chase_email_followup", subject, text, html };
}

export function whatsappMessage(t: TemplateInput): string {
  return `Hi ${t.contactName || "there"}, hope you're well. Could you please share the ${what(t)} for ${t.clientName} when you get a chance? Thank you! – ${t.firmName}`;
}

/**
 * Normalises an Indian or international number for wa.me. Returns null for
 * numbers WhatsApp cannot open, so the UI can say so instead of failing.
 */
export function normalisePhone(raw: string | null | undefined): string | null {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10 && /^[6-9]/.test(d)) d = `91${d}`;
  if (d.length < 11 || d.length > 15) return null;
  return d;
}

export function whatsappLink(phone: string | null | undefined, message: string): { url: string | null; error: string | null } {
  const p = normalisePhone(phone);
  if (!p) return { url: null, error: "The phone number is missing or not a valid mobile number. Update the contact to use WhatsApp." };
  return { url: `https://wa.me/${p}?text=${encodeURIComponent(message)}`, error: null };
}
