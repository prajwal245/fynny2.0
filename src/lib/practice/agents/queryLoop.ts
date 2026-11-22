/**
 * The client query loop: turns open exceptions into grouped, plain questions for the client, and reads the reply as a PROPOSAL.
 *
 * Nothing here sends anything. A draft always needs approval, the channel is only one the client has agreed to, and a reply never
 * changes an exception by itself: it says what it understood and asks a person to confirm. Pure, so every rule is tested.
 */
import type { ChaserTone } from "../chaser/rules";
import { snoozeResume } from "../chaser/rules";
import { KIND_LABEL, type ExceptionKind } from "../exceptionKinds";

/** The kinds a client can answer. Duplicates, own-account transfers and timing differences are the firm's own to settle. */
export const ASKABLE_KINDS: readonly ExceptionKind[] = [
  "unidentified",
  "amount_difference",
  "cash",
  "gst_mismatch",
];
export const MAX_ITEMS_PER_MESSAGE = 8;

export interface QueryItem {
  id: string;
  clientId: string;
  kind: ExceptionKind;
  /** ISO date of the bank line. */
  date: string;
  amount: number;
  direction: "in" | "out";
  narration: string;
  /** For an amount difference: what the books show. */
  bookAmount?: number | null;
}

export interface ClientContact {
  clientId: string;
  clientName: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  /** Only channels the client has agreed to. */
  consent: { email: boolean; whatsapp: boolean };
  doNotDisturb: boolean;
  preferred?: "email" | "whatsapp" | null;
}

export interface QueryGroup {
  clientId: string;
  items: QueryItem[];
}

/** Askable items, grouped per client and split into messages of a sensible length, oldest first. */
export function groupForQuery(
  items: QueryItem[],
  opts: { max?: number } = {},
): QueryGroup[] {
  const max = Math.max(1, opts.max ?? MAX_ITEMS_PER_MESSAGE);
  const byClient = new Map<string, QueryItem[]>();
  for (const it of items) {
    if (!ASKABLE_KINDS.includes(it.kind)) continue;
    const list = byClient.get(it.clientId) ?? [];
    list.push(it);
    byClient.set(it.clientId, list);
  }
  const out: QueryGroup[] = [];
  for (const [clientId, list] of [...byClient.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    list.sort(
      (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
    );
    for (let i = 0; i < list.length; i += max)
      out.push({ clientId, items: list.slice(i, i + max) });
  }
  return out;
}

const inr = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
const dateLabel = (iso: string) => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      });
};
const trim = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

/** The one question each kind of item asks. It never asserts anything the books do not show. */
export function questionFor(it: QueryItem): string {
  switch (it.kind) {
    case "amount_difference":
      return it.bookAmount != null
        ? `Our books show ${inr(it.bookAmount)} and the bank ${inr(it.amount)}. Was that a part payment, a deduction, or a typing difference?`
        : "The amount differs from our books. Was that a part payment, a deduction, or a typing difference?";
    case "cash":
      return "Was this cash for sales, an expense, or a transfer between your accounts?";
    case "gst_mismatch":
      return "The difference looks like GST. Could you share the invoice?";
    default:
      return it.direction === "in"
        ? "Could you tell us who this was from and what it was for?"
        : "Could you tell us who this was paid to and what it was for?";
  }
}

export interface QueryDraft {
  clientId: string;
  itemIds: string[];
  channel: "email" | "whatsapp" | null;
  subject: string;
  body: string;
  /** Set when no message can go: why. */
  whyNot: string | null;
  /** Always true: a person approves every message. */
  needsApproval: true;
  /** The risk-table action this draft would take, which carries the pause window. */
  riskId: "query_send";
}

const GREETING: Record<ChaserTone, (n: string) => string> = {
  gentle: (n) =>
    `Hi ${n}, hope you're well. We're nearly done with your books and have a few small questions.`,
  standard: (n) =>
    `Hi ${n}, while closing your books we have a few items we could not identify.`,
  firm: (n) =>
    `Hi ${n}, we cannot complete your books until the items below are explained.`,
};

function pickChannel(c: ClientContact): {
  channel: "email" | "whatsapp" | null;
  whyNot: string | null;
} {
  if (c.doNotDisturb)
    return {
      channel: null,
      whyNot: "This client has asked not to be messaged.",
    };
  const email = c.consent.email && !!c.email?.includes("@");
  const wa = c.consent.whatsapp && !!c.phone?.replace(/\D/g, "");
  if (c.preferred === "email" && email)
    return { channel: "email", whyNot: null };
  if (c.preferred === "whatsapp" && wa)
    return { channel: "whatsapp", whyNot: null };
  if (email) return { channel: "email", whyNot: null };
  if (wa) return { channel: "whatsapp", whyNot: null };
  return {
    channel: null,
    whyNot:
      "No channel this client has agreed to is available. Ask for consent first.",
  };
}

export function draftQuery(
  group: QueryGroup,
  contact: ClientContact,
  firm: { name: string },
  tone: ChaserTone = "standard",
): QueryDraft {
  const { channel, whyNot } = pickChannel(contact);
  const name = contact.contactName?.trim() || "there";
  const lines = group.items.map(
    (it, i) =>
      `${i + 1}. ${dateLabel(it.date)}, ${it.direction === "in" ? "received" : "paid"} ${inr(it.amount)} (${trim(it.narration, 60)}). ${questionFor(it)}`,
  );
  const closing =
    channel === "whatsapp"
      ? "Please reply here, or send the documents on the same chat."
      : "You can simply reply to this email, with any document attached.";
  const body = [
    GREETING[tone](name),
    "",
    ...lines,
    "",
    closing,
    `Thank you, ${firm.name}`,
  ].join("\n");
  const n = group.items.length;
  return {
    clientId: group.clientId,
    itemIds: group.items.map((i) => i.id),
    channel,
    subject: `${n} question${n === 1 ? "" : "s"} about ${contact.clientName}'s books`,
    body,
    whyNot,
    needsApproval: true,
    riskId: "query_send",
  };
}

/* ── reading a reply: a proposal, never a decision ── */

export interface ReplyProposal {
  kind: "stop" | "promise" | "answer" | "unclear";
  /** For a promise: the day the client said, as a date in India. */
  promisedDate: string | null;
  /** What the client wrote, to attach to the item once a person confirms. */
  text: string;
  confidence: number;
  /** Always true. */
  requiresConfirmation: true;
}

const IST = 5.5 * 3_600_000;
const istDate = (now: Date, plusDays = 0) =>
  new Date(now.getTime() + IST + plusDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

/** A day the client named: "tomorrow", "in 3 days", "by 25 Nov", "on 25/11". Null when none is clear. */
export function promisedDay(text: string, now: Date): string | null {
  const t = text.toLowerCase();
  if (/\bday after tomorrow\b/.test(t)) return istDate(now, 2);
  if (/\btomorrow\b|\bkal\b/.test(t)) return istDate(now, 1);
  if (/\btoday\b/.test(t)) return istDate(now, 0);
  const inDays = /\b(?:in|within)\s+(\d{1,2})\s+days?\b/.exec(t);
  if (inDays) return istDate(now, Number(inDays[1]));
  const year = Number(istDate(now).slice(0, 4));
  const named = new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS.join("|")})[a-z]*\\b`,
  ).exec(t);
  const numeric = /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/.exec(t);
  let m: number | null = null;
  let d: number | null = null;
  let y = year;
  if (named) {
    d = Number(named[1]);
    m = MONTHS.indexOf(named[2]!) + 1;
  } else if (numeric) {
    d = Number(numeric[1]);
    m = Number(numeric[2]);
    if (numeric[3])
      y =
        Number(numeric[3]) < 100
          ? 2000 + Number(numeric[3])
          : Number(numeric[3]);
  }
  if (d === null || m === null || d < 1 || d > 31 || m < 1 || m > 12)
    return null;
  let iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  // A date that has already passed this year means next year.
  if (iso < istDate(now) && !numeric?.[3]) iso = `${y + 1}-${iso.slice(5)}`;
  const parsed = Date.parse(`${iso}T00:00:00Z`);
  return Number.isNaN(parsed) ||
    new Date(parsed).toISOString().slice(0, 10) !== iso
    ? null
    : iso;
}

export function interpretReply(text: string, now: Date): ReplyProposal {
  const raw = text.trim();
  const base = {
    text: raw.slice(0, 1000),
    requiresConfirmation: true as const,
  };
  if (!raw)
    return { ...base, kind: "unclear", promisedDate: null, confidence: 0 };
  if (
    /^\s*(stop|unsubscribe)\b|\bdo not (message|contact|call)\b|\bdon'?t (message|contact)\b/i.test(
      raw,
    )
  )
    return { ...base, kind: "stop", promisedDate: null, confidence: 0.95 };
  const day = promisedDay(raw, now);
  const promises =
    /\b(will|shall|'ll|going to|can)\s+(send|share|give|upload|get|provide)\b|\bsending\b|\bby\b|\bon\b/i.test(
      raw,
    );
  if (day && promises)
    return { ...base, kind: "promise", promisedDate: day, confidence: 0.8 };
  if (day)
    return { ...base, kind: "promise", promisedDate: day, confidence: 0.6 };
  // A real answer says something: a few words at least, and not only a pleasantry.
  if (
    raw.replace(/[^a-z0-9]/gi, "").length >= 12 &&
    !/^(ok|okay|thanks|thank you|noted|sure|yes|no)\W*$/i.test(raw)
  )
    return { ...base, kind: "answer", promisedDate: null, confidence: 0.55 };
  return { ...base, kind: "unclear", promisedDate: null, confidence: 0.2 };
}

/** When the chase should resume if a person confirms the promise: the day after, at 10:00 IST. Null if the date is unusable. */
export const resumeAfterPromise = (
  p: ReplyProposal,
  now: Date,
): string | null =>
  p.kind === "promise" && p.promisedDate
    ? snoozeResume(p.promisedDate, now)
    : null;

/** The plain label of what an item is, for the screen that lists the drafts. */
export const itemLabel = (it: QueryItem): string =>
  `${KIND_LABEL[it.kind]}: ${inr(it.amount)} on ${dateLabel(it.date)}`;
