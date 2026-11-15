/**
 * Problem reports from a firm: what can be reported, how long each part may be, and how many a firm may send in a day.
 * Pure, so the screen and the server say the same thing and the rules are tested on their own.
 */
export const REPORT_CATEGORIES = [
  { key: "statement", label: "A statement or file was read wrongly", hint: "Wrong lines, amounts, money in/out, dates, or lines missing." },
  { key: "match", label: "A match, exception or balance check looks wrong", hint: "Reconciliation, the Exception Queue or the Review Queue." },
  { key: "report", label: "A report (MIS) looks wrong", hint: "A figure, its source lines, or the sign-off." },
  { key: "chaser", label: "Reminders or messages (WhatsApp, email)", hint: "A reminder did not go, went twice, or said the wrong thing." },
  { key: "tally", label: "Tally", hint: "Connector, reading Tally files, or posting entries." },
  { key: "zoho", label: "Zoho Books", hint: "Connecting, pulling a month, aging reports, or the export." },
  { key: "billing", label: "Plan, credits or usage", hint: "A charge, a limit, or credits that do not add up." },
  { key: "other", label: "Something else", hint: "Anything that did not work the way you expected." },
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number]["key"];
export const CATEGORY_LABEL = Object.fromEntries(REPORT_CATEGORIES.map((c) => [c.key, c.label])) as Record<ReportCategory, string>;

export const REPORT_STATUS = ["new", "looking", "fixed", "wont_fix"] as const;
export type ReportStatus = (typeof REPORT_STATUS)[number];
export const STATUS_LABEL: Record<ReportStatus, string> = { new: "Received", looking: "We are looking at it", fixed: "Fixed", wont_fix: "Closed" };

export const LIMITS = { summary: { min: 5, max: 140 }, text: 4000, perDay: 10 } as const;

export interface ReportInput {
  category: string;
  summary: string;
  whatHappened?: string | null;
  expected?: string | null;
  documentId?: string | null;
  documentName?: string | null;
  page?: string | null;
}

const clean = (s: string | null | undefined, max: number) => String(s ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);

/** The report as it will be stored, or the one thing the person should fix. */
export function checkReport(i: ReportInput): { ok: true; report: Required<Omit<ReportInput, "documentId">> & { documentId: string | null; category: ReportCategory } } | { ok: false; problem: string } {
  if (!REPORT_CATEGORIES.some((c) => c.key === i.category)) return { ok: false, problem: "Choose what the problem is about." };
  const summary = clean(i.summary, LIMITS.summary.max).replace(/\s+/g, " ");
  if (summary.length < LIMITS.summary.min) return { ok: false, problem: "Say in a few words what went wrong." };
  const whatHappened = clean(i.whatHappened, LIMITS.text);
  const expected = clean(i.expected, LIMITS.text);
  if (!whatHappened && !expected && summary.length < 20) return { ok: false, problem: "Add a little more: what you did, and what you saw." };
  return {
    ok: true,
    report: {
      category: i.category as ReportCategory,
      summary,
      whatHappened,
      expected,
      documentId: i.documentId || null,
      documentName: clean(i.documentName, 200),
      page: clean(i.page, 200),
    },
  };
}

/** A firm that has sent this many in the last 24 hours is asked to wait: it keeps the inbox for real problems. */
export const overDailyLimit = (sentToday: number) => sentToday >= LIMITS.perDay;
