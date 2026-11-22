/**
 * The pre-sign-off reviewer. Read-only: it lists what a partner should look at before signing, with the reason, and changes nothing.
 * "ready" means nothing needs checking, not that the books are right. The partner still decides, and can sign off with a note.
 */
import type { CloseFacts } from "../close/steps";

export type FindingSeverity = "check" | "note";
export type FindingWhere =
  "documents" | "recon" | "exceptions" | "review" | "close" | "mis" | "gst";
export interface Finding {
  id: string;
  severity: FindingSeverity;
  where: FindingWhere;
  title: string;
  detail: string;
}

export interface ReviewInput {
  facts: CloseFacts;
  /** The reconciliation's own post-match self-check, when it ran. */
  reconProofOk: boolean | null;
  reviewRowsOpen: number;
  /** Days on which the cash balance went below zero. */
  negativeCashDays: number;
  /** Heads that differ between last year's audit and the opening balances. Null when not checked. */
  openingDifferences: number | null;
  current: { receipts: number; expenses: number } | null;
  prior: { receipts: number; expenses: number } | null;
  ledgerMapConfirmed: boolean | null;
  missingGstInputs: number;
}

/** A month-on-month swing is worth a look when it is large in share and in rupees. */
export const SWING_SHARE = 0.5;
export const SWING_MIN_INR = 100_000;

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export function reviewBeforeSignOff(i: ReviewInput): {
  findings: Finding[];
  mustCheck: number;
  ready: boolean;
  summary: string;
} {
  const f: Finding[] = [];
  const s = i.facts.statements;
  const add = (
    id: string,
    severity: FindingSeverity,
    where: FindingWhere,
    title: string,
    detail: string,
  ) => f.push({ id, severity, where, title, detail });

  if (s.expected > 0 && s.received < s.expected)
    add(
      "statements_missing",
      "check",
      "documents",
      "A statement has not arrived",
      `${s.received} of ${plural(s.expected, "expected statement")} received.`,
    );
  if (s.received === 0)
    add(
      "no_statements",
      "check",
      "documents",
      "No bank statement for the month",
      "The MIS has nothing to be built from.",
    );
  if (s.held > 0)
    add(
      "statements_held",
      "check",
      "documents",
      "A statement was held",
      `${plural(s.held, "statement")} failed its tie-out and is not used until a partner accepts it with a reason.`,
    );
  if (s.failed > 0)
    add(
      "statements_failed",
      "check",
      "documents",
      "A statement could not be read",
      `${plural(s.failed, "statement")} failed.`,
    );
  if (!i.facts.recon.runDone)
    add(
      "recon_not_run",
      "check",
      "recon",
      "Reconciliation has not run",
      "Upload the books, or confirm the month is bank-only.",
    );
  if (i.reconProofOk === false)
    add(
      "recon_proof_failed",
      "check",
      "recon",
      "The reconciliation's self-check failed",
      "A line may have been used twice or a match does not net to zero.",
    );
  const unexplained = Math.max(
    0,
    i.facts.exceptions.open - i.facts.exceptions.explained,
  );
  if (unexplained > 0)
    add(
      "exceptions_open",
      "check",
      "exceptions",
      `${plural(unexplained, "exception")} not explained`,
      "They are left out of the MIS figures.",
    );
  if (i.reviewRowsOpen > 0)
    add(
      "review_rows",
      "check",
      "review",
      `${plural(i.reviewRowsOpen, "row")} waiting in the Review Queue`,
      "None of them is a transaction until a person confirms it.",
    );
  if (i.negativeCashDays > 0)
    add(
      "negative_cash",
      "check",
      "close",
      `Cash went below zero on ${plural(i.negativeCashDays, "day")}`,
      "A cash balance cannot be negative; an entry is missing or misdated.",
    );
  if (i.openingDifferences && i.openingDifferences > 0)
    add(
      "opening_differences",
      "note",
      "close",
      "Opening balances differ from last year's audit",
      `${plural(i.openingDifferences, "head")} differ.`,
    );
  if (i.current && i.prior) {
    for (const [label, cur, pri] of [
      ["Receipts", i.current.receipts, i.prior.receipts],
      ["Expenses", i.current.expenses, i.prior.expenses],
    ] as const) {
      if (
        pri > 0 &&
        Math.abs(cur - pri) >= SWING_MIN_INR &&
        Math.abs(cur - pri) / pri >= SWING_SHARE
      ) {
        add(
          `swing_${label.toLowerCase()}`,
          "note",
          "mis",
          `${label} moved sharply`,
          `${inr(pri)} last month, ${inr(cur)} this month.`,
        );
      }
    }
  }
  if (i.ledgerMapConfirmed === false)
    add(
      "ledger_map",
      "note",
      "close",
      "The ledger map is not confirmed",
      "GST, ageing and opening checks read through it.",
    );
  if (i.missingGstInputs > 0)
    add(
      "gst_inputs",
      "note",
      "gst",
      `${plural(i.missingGstInputs, "GST file")} still missing`,
      "Some GST checks cannot run yet.",
    );
  if (!i.facts.report.exists)
    add(
      "no_report",
      "note",
      "mis",
      "No MIS has been drafted",
      "Generate it before signing off.",
    );

  const mustCheck = f.filter((x) => x.severity === "check").length;
  const summary =
    mustCheck === 0
      ? f.length
        ? `Nothing blocks sign-off. ${plural(f.length, "note")} to read.`
        : "Nothing to check."
      : `${plural(mustCheck, "thing")} to check before signing off.`;
  return {
    findings: f.sort((a, b) =>
      a.severity === b.severity ? 0 : a.severity === "check" ? -1 : 1,
    ),
    mustCheck,
    ready: mustCheck === 0,
    summary,
  };
}
