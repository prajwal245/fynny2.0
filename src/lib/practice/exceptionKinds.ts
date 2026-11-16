/**
 * The seven kinds of exception a CA recognises, and the handling statuses a team moves one through.
 *
 * Pure and isomorphic. The kind is worked out from what the reconciliation already knows about the line (its reason code, side,
 * narration, the nearest candidate); it is never an AI guess, and it never changes the line. It tells the person what sort of
 * question this is, so the queue can be sorted and chased by kind.
 */
export const EXCEPTION_KINDS = ["unidentified", "amount_difference", "timing_difference", "duplicate", "gst_mismatch", "cash", "own_account"] as const;
export type ExceptionKind = (typeof EXCEPTION_KINDS)[number];

export const KIND_LABEL: Record<ExceptionKind, string> = {
  unidentified: "Unidentified receipt or payment",
  amount_difference: "Amount difference",
  timing_difference: "Timing difference",
  duplicate: "Possible duplicate",
  gst_mismatch: "GST mismatch",
  cash: "Cash deposit or withdrawal",
  own_account: "Own-account or related-party transfer",
};

/** What to do about each kind, in one line. */
export const KIND_ACTION: Record<ExceptionKind, string> = {
  unidentified: "Find the ledger entry or ask the client what this was for.",
  amount_difference: "Check the invoice against the bank amount: part payment, a deduction or a typing difference.",
  timing_difference: "Usually a cheque or entry that clears in another period. Accept it as timing once you have checked.",
  duplicate: "Check that the same transaction was not entered twice. Nothing is deleted for you.",
  gst_mismatch: "The gap looks like GST. Check the tax on the invoice before matching.",
  cash: "Classify the cash movement: deposit of sales, withdrawal for expenses, or a transfer.",
  own_account: "Money moved between the client's own accounts or a related party. Find the other leg.",
};

export interface KindInput {
  reasonCode?: string | null;
  side: "bank" | "books";
  narration: string;
  category?: string | null;
  amount: number;
  /** The amount of the nearest suggested entry, when there is one. */
  candidateAmount?: number | null;
  /** Days between this line and the nearest suggested entry, when known. */
  dateGapDays?: number | null;
}

const OWN_ACCOUNT = /\b(self|own\s*a\/?c|own\s*account|sweep|fd\s*(booking|closure|maturity)|inter\s*-?\s*account|contra|a\/c\s*to\s*a\/c|trf\s*to\s*own)\b/i;
const CASH = /\b(cash\s*(deposit|dep|withdrawal|wdl|wd|dep\.)|cdm|atm\s*(wdl|withdrawal|cash)|by\s*cash|to\s*cash|self\s*cash|cash\s*at\s*branch)\b/i;
const CHEQUE = /\b(chq|cheque|check|clg|clearing)\b/i;
const GST_RATES = [5, 12, 18, 28];

/** True when the gap between two amounts is what GST at a standard rate would explain, whichever amount includes the tax. */
export function gapLooksLikeGst(a: number, b: number): boolean {
  const lo = Math.min(Math.abs(a), Math.abs(b));
  const hi = Math.max(Math.abs(a), Math.abs(b));
  const gap = hi - lo;
  if (!lo || gap < 1) return false;
  return GST_RATES.some((r) => {
    const rate = r / 100;
    const onSmaller = lo * rate;
    const withinHigher = hi - hi / (1 + rate);
    const tol = Math.max(1, lo * 0.01);
    return Math.abs(gap - onSmaller) <= tol || Math.abs(gap - withinHigher) <= tol;
  });
}

/** The kind of an exception and the plain reason it was given that kind. */
export function kindOf(i: KindInput): { kind: ExceptionKind; why: string } {
  const text = i.narration ?? "";
  if ((i.category ?? "") === "transfer" || OWN_ACCOUNT.test(text))
    return { kind: "own_account", why: "The narration reads like a transfer between accounts, and no matching other leg was found." };
  if ((i.category ?? "") === "cash" || CASH.test(text)) return { kind: "cash", why: "The narration shows a cash deposit or withdrawal, which needs a classification." };
  const code = i.reasonCode ?? "";
  if (code === "duplicate_suspect") return { kind: "duplicate", why: "The same amount, date and party appear more than once." };
  if (code === "amount_mismatch" || code === "partial_payment_suspect") {
    if (i.candidateAmount != null && gapLooksLikeGst(i.amount, i.candidateAmount))
      return { kind: "gst_mismatch", why: "The difference between the two amounts is what GST at a standard rate would explain." };
    return { kind: "amount_difference", why: code === "partial_payment_suspect" ? "The amount looks like part of a larger entry." : "The nearest entry is for a different amount." };
  }
  if (code === "date_gap") return { kind: "timing_difference", why: "The amount and party agree but the dates are far apart." };
  if (i.side === "books" && CHEQUE.test(text) && (code === "no_candidate" || code === ""))
    return { kind: "timing_difference", why: "A cheque in the books that has not cleared the bank yet." };
  if (code === "missing_counterparty") return { kind: "unidentified", why: "The line has no party name, so it cannot be linked to a ledger entry." };
  if (code === "reference_mismatch") return { kind: "unidentified", why: "The reference on the line does not match any entry." };
  return { kind: "unidentified", why: i.side === "bank" ? "No book entry matches this bank line." : "No bank line matches this book entry." };
}

/* ── handling status ── */

export const WORK_STATUSES = ["open", "query_sent", "answered", "resolved", "accepted_timing"] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];

export const WORK_LABEL: Record<WorkStatus, string> = {
  open: "Open",
  query_sent: "Query sent",
  answered: "Answered",
  resolved: "Resolved",
  accepted_timing: "Accepted as timing",
};

/** Resolved and accepted-as-timing are finished; the other three still need work. */
export const isExplained = (s: WorkStatus | string | null | undefined) => s === "resolved" || s === "accepted_timing";

/** The statuses a person may move an exception to from where it is. "Resolved" is reached by resolving it, not from this menu. */
export function nextStatuses(from: WorkStatus): WorkStatus[] {
  switch (from) {
    case "open":
      return ["query_sent", "accepted_timing"];
    case "query_sent":
      return ["answered", "open", "accepted_timing"];
    case "answered":
      return ["open", "accepted_timing"];
    case "accepted_timing":
      return ["open"];
    case "resolved":
      return [];
  }
}

export const REVIEW_STATES = ["none", "with_senior", "returned"] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

/** Who is looking at an exception, for the tabs. */
export function belongsTo(e: { ownerId: string | null }, me: string, tab: "mine" | "unassigned" | "all"): boolean {
  if (tab === "all") return true;
  if (tab === "mine") return e.ownerId === me;
  return !e.ownerId;
}
