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
  | {
      action: "send";
      follow_up_number: number;
      next_follow_up_at: string | null;
    }
  | { action: "escalate" };

const DAY = 86_400_000;

/**
 * Day 0 request, day 3 nudge, day 7 firm reminder, day 10 the partner is told.
 * The slot after the last send is where the chase escalates (see decide).
 */
export const DEFAULT_SCHEDULE = [0, 3, 7, 10];
export const DEFAULT_MAX_FOLLOW_UPS = 3;

export type ChaserTone = "gentle" | "standard" | "firm";
export const TONES: ChaserTone[] = ["gentle", "standard", "firm"];
export const parseTone = (v: unknown): ChaserTone =>
  TONES.includes(v as ChaserTone) ? (v as ChaserTone) : "standard";

export function isClosed(status: string) {
  return (
    status === "fulfilled" || status === "resolved" || status === "cancelled"
  );
}

/** When the n-th (0-based) follow-up slot falls due. */
export function slotAt(
  createdAt: string,
  schedule: number[],
  n: number,
): string | null {
  const day = schedule[n];
  if (day === undefined) return null;
  return new Date(Date.parse(createdAt) + day * DAY).toISOString();
}

export function decide(s: ChaseState, now: Date): ChaseDecision {
  if (isClosed(s.status)) return { action: "skip", reason: "resolved" };
  if (s.escalated_at) return { action: "skip", reason: "already escalated" };
  if (s.do_not_disturb)
    return { action: "skip", reason: "client marked do not disturb" };
  const schedule = s.schedule_days?.length ? s.schedule_days : DEFAULT_SCHEDULE;
  const due =
    s.next_follow_up_at ?? slotAt(s.created_at, schedule, s.chaser_count);
  if (!due || Date.parse(due) > now.getTime())
    return { action: "skip", reason: "not due" };
  // Never two nudges on the same calendar day (cron retries, manual + auto).
  if (
    s.last_chased_at &&
    s.last_chased_at.slice(0, 10) === now.toISOString().slice(0, 10)
  ) {
    return { action: "skip", reason: "already chased today" };
  }
  if (s.chaser_count >= s.max_follow_ups) return { action: "escalate" };
  if (!s.contact_email) return { action: "skip", reason: "no contact email" };
  const next = slotAt(s.created_at, schedule, s.chaser_count + 1);
  // If the schedule has no further slot, escalate one schedule-gap later.
  const fallback = new Date(now.getTime() + 4 * DAY).toISOString();
  return {
    action: "send",
    follow_up_number: s.chaser_count + 1,
    next_follow_up_at:
      next && Date.parse(next) > now.getTime() ? next : fallback,
  };
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

const esc = (s: string) =>
  s.replace(
    /[&<>"]/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
  );

const what = (t: TemplateInput) =>
  `${t.item.toLowerCase()}${t.period ? ` for ${t.period}` : ""}`;

export interface GroupItem {
  item: string;
  period: string | null;
  dueDate: string | null;
}

const wrapHtml = (text: string) =>
  `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#1a1a1a">${text
    .split("\n\n")
    .map((p) => `<p style="margin:0 0 12px">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("")}</div>`;

const REPLY_LINE = "You can simply reply to this email with the document attached.";

/** Which of the three messages a follow-up number maps to. */
const stepOf = (n: number): "first" | "nudge" | "final" => (n <= 1 ? "first" : n === 2 ? "nudge" : "final");

export function renderEmail(
  followUpNumber: number,
  t: TemplateInput,
  tone: ChaserTone = "standard",
): RenderedEmail {
  const step = stepOf(followUpNumber);
  const subjectTail = `${t.item}${t.period ? ` for ${t.period}` : ""}`;
  const subject =
    step === "first"
      ? `Gentle reminder – ${subjectTail}`
      : step === "nudge" || tone === "gentle"
        ? `Following up – ${subjectTail}`
        : `Final reminder – ${subjectTail}`;
  const due = t.dueDate ? ` by ${t.dueDate}` : "";
  let body: string;
  let template_id = "chase_email_followup";
  if (step === "first") {
    template_id = "chase_email_first";
    body = `We hope you are well. To complete the accounts of ${t.clientName}, could you please share the ${what(t)}${due}?`;
  } else if (step === "nudge") {
    body =
      tone === "firm"
        ? `We have not yet received the ${what(t)} of ${t.clientName}, which we asked for earlier. Please share it${t.dueDate ? ` by ${t.dueDate}` : " at the earliest"} so that we can keep your work on schedule.`
        : `This is a gentle follow-up on our earlier request for the ${what(t)} of ${t.clientName}. We would be grateful if you could share it at your earliest convenience.`;
  } else if (tone === "gentle") {
    body = `Just a quick note to check on the ${what(t)} of ${t.clientName}, which we are still waiting for. Whenever you get a moment, please share it with us.`;
  } else {
    template_id = "chase_email_final";
    body = `This is our last automatic reminder for the ${what(t)} of ${t.clientName}. Without it we cannot complete your work${t.dueDate ? ` before ${t.dueDate}` : " on time"}, and any delay or penalty that follows would be beyond our control. Please share it today, or tell us when we can expect it.`;
  }
  const text = [
    `Dear ${t.contactName || "Sir/Madam"},`,
    "",
    body,
    t.note ? `\nNote: ${t.note}` : "",
    "",
    REPLY_LINE,
    "",
    "Thank you in advance.",
    "",
    "Warm regards,",
    t.firmName,
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
  return { template_id, subject, text, html: wrapHtml(text) };
}

/**
 * One email per client for everything still missing, instead of one per item.
 * A single item reads exactly like renderEmail; several are listed.
 */
export function renderGroupedEmail(
  followUpNumber: number,
  base: Omit<TemplateInput, "item" | "period" | "dueDate">,
  items: GroupItem[],
  tone: ChaserTone = "standard",
): RenderedEmail {
  if (items.length <= 1) {
    const only = items[0] ?? { item: "Documents", period: null, dueDate: null };
    return renderEmail(followUpNumber, { ...base, ...only }, tone);
  }
  const step = stepOf(followUpNumber);
  const list = items
    .map((i) => `• ${i.item}${i.period ? ` – ${i.period}` : ""}${i.dueDate ? ` (by ${i.dueDate})` : ""}`)
    .join("\n");
  const subject =
    step === "first"
      ? `${items.length} documents needed for ${base.clientName}`
      : step === "nudge" || tone === "gentle"
        ? `Following up – ${items.length} documents for ${base.clientName}`
        : `Final reminder – ${items.length} documents for ${base.clientName}`;
  const lead =
    step === "first"
      ? `We hope you are well. To complete the accounts of ${base.clientName}, could you please share the following?`
      : step === "nudge"
        ? tone === "firm"
          ? `We have not yet received the items below for ${base.clientName}. Please share them at the earliest so that we can keep your work on schedule.`
          : `This is a gentle follow-up on our earlier request. We are still waiting for the following for ${base.clientName}:`
        : tone === "gentle"
          ? `Just a quick note on the items below for ${base.clientName}, which we are still waiting for:`
          : `This is our last automatic reminder. Without the items below we cannot complete the work of ${base.clientName} on time, and any delay or penalty that follows would be beyond our control.`;
  const text = [
    `Dear ${base.contactName || "Sir/Madam"},`,
    "",
    lead,
    list,
    base.note ? `\nNote: ${base.note}` : "",
    "",
    REPLY_LINE,
    "",
    "Thank you in advance.",
    "",
    "Warm regards,",
    base.firmName,
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
  return {
    template_id: step === "first" ? "chase_email_first" : step === "nudge" || tone === "gentle" ? "chase_email_followup" : "chase_email_final",
    subject,
    text,
    html: wrapHtml(text),
  };
}

/* ── send window: 9:30 to 18:30 IST, Monday to Saturday ── */

const IST_MIN = 330;
const OPEN = 9 * 60 + 30;
const CLOSE = 18 * 60 + 30;

export function inSendWindow(now: Date): boolean {
  const ist = new Date(now.getTime() + IST_MIN * 60_000);
  if (ist.getUTCDay() === 0) return false;
  const m = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return m >= OPEN && m < CLOSE;
}

/** The next moment an email may go out (now, when already inside the window). */
export function nextSendWindow(now: Date): Date {
  if (inSendWindow(now)) return now;
  const ist = new Date(now.getTime() + IST_MIN * 60_000);
  const m = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const dayStart = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  let day = dayStart;
  if (!(ist.getUTCDay() !== 0 && m < OPEN)) day += DAY;
  while (new Date(day).getUTCDay() === 0) day += DAY;
  return new Date(day + OPEN * 60_000 - IST_MIN * 60_000);
}

/**
 * The client promised the document by a date: stop nudging until the day
 * after, at 10:00 IST. Null when the date is invalid, in the past, or over 60 days away.
 */
export function snoozeResume(promised: string, now: Date): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(promised)) return null;
  const t = Date.parse(`${promised}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  const resume = t + DAY + 4 * 3_600_000 + 30 * 60_000; // next day 10:00 IST = 04:30Z
  if (resume <= now.getTime() || resume - now.getTime() > 60 * DAY) return null;
  return new Date(resume).toISOString();
}

export function whatsappMessage(t: TemplateInput): string {
  return `Hi ${t.contactName || "there"}, hope you're well. Could you please share the ${what(t)} for ${t.clientName} when you get a chance? Thank you! – ${t.firmName}`;
}

export const DEFAULT_COUNTRY_CODE = "91";

/** Country calling codes for the Settings picker (the firm's home country). */
export const COUNTRY_CODES: { code: string; label: string }[] = [
  { code: "91", label: "India (+91)" },
  { code: "971", label: "United Arab Emirates (+971)" },
  { code: "966", label: "Saudi Arabia (+966)" },
  { code: "974", label: "Qatar (+974)" },
  { code: "965", label: "Kuwait (+965)" },
  { code: "968", label: "Oman (+968)" },
  { code: "973", label: "Bahrain (+973)" },
  { code: "65", label: "Singapore (+65)" },
  { code: "60", label: "Malaysia (+60)" },
  { code: "977", label: "Nepal (+977)" },
  { code: "94", label: "Sri Lanka (+94)" },
  { code: "880", label: "Bangladesh (+880)" },
  { code: "44", label: "United Kingdom (+44)" },
  { code: "1", label: "United States / Canada (+1)" },
  { code: "61", label: "Australia (+61)" },
  { code: "64", label: "New Zealand (+64)" },
];

export const parseCountryCode = (v: unknown): string => {
  const d = String(v ?? "").replace(/\D/g, "");
  return /^\d{1,3}$/.test(d) ? d : DEFAULT_COUNTRY_CODE;
};

/**
 * Normalises a phone number to the digits WhatsApp wants (country code first, no +).
 * "+" or "00" numbers are taken as international. Otherwise the firm's own country
 * code is added: India also accepts 10-digit mobiles and a leading 0. Null when it
 * cannot be a real number, so the UI can say so instead of failing.
 */
export function normalisePhone(raw: string | null | undefined, defaultCc: string = DEFAULT_COUNTRY_CODE): string | null {
  const s = String(raw ?? "").trim();
  let d = s.replace(/\D/g, "");
  const valid = (x: string) => (x.length >= 8 && x.length <= 15 ? x : null);
  if (s.startsWith("+")) return valid(d);
  if (d.startsWith("00")) return valid(d.slice(2));
  const cc = parseCountryCode(defaultCc);
  if (cc === "91") {
    if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
    if (d.length === 10 && /^[6-9]/.test(d)) d = `91${d}`;
    return d.length < 11 ? null : valid(d);
  }
  d = d.replace(/^0+/, "");
  // Already carries the country code (e.g. 971501234567) vs a local number (501234567).
  if (!(d.startsWith(cc) && d.length >= cc.length + 7)) d = cc + d;
  return valid(d);
}

/** Two numbers are the same person: equal once normalised, or equal in their last 10 digits. */
export function samePhone(a: string | null | undefined, b: string | null | undefined, cc: string = DEFAULT_COUNTRY_CODE): boolean {
  const na = normalisePhone(a, cc);
  const nb = normalisePhone(b, cc);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.length >= 10 && nb.length >= 10 && na.slice(-10) === nb.slice(-10);
}

export function whatsappLink(
  phone: string | null | undefined,
  message: string,
  cc: string = DEFAULT_COUNTRY_CODE,
): { url: string | null; error: string | null } {
  const p = normalisePhone(phone, cc);
  if (!p)
    return {
      url: null,
      error:
        "The phone number is missing or not a valid mobile number. Update the contact to use WhatsApp.",
    };
  return {
    url: `https://wa.me/${p}?text=${encodeURIComponent(message)}`,
    error: null,
  };
}
