/**
 * The month-end close of one client for one month.
 *
 * Every step is either checked by the system from what FynHelp already holds, or confirmed by a person who is named and dated.
 * Nothing here marks GST or TDS as filed: those are manual confirmations until filing itself is integrated and verified.
 * Two states are kept apart, as a CA thinks of them:
 *   - "Bank and Books Closed": statements in and verified, reconciled, and every exception resolved or explained.
 *   - "Fully Closed": that, plus GST, TDS, provisions, the MIS prepared and reviewed, and the partner's sign-off.
 * The state is DERIVED from the steps each time it is read, so a month can never be shown closed while a step is open.
 * Pure: the caller gathers the facts.
 */
export type StepKind = "auto" | "staff" | "authorized" | "partner";
export type StepStatus = "done" | "pending" | "blocked";

export interface StepDef {
  key: string;
  label: string;
  /** auto: the system checks. staff: any team member confirms. authorized: a partner, manager or owner confirms. partner: the partner's sign-off. */
  kind: StepKind;
  /** Part of "Bank and Books Closed". */
  phase: "bank_books" | "full";
  /** The day of the following month the step is normally due by (the 7th TDS, 11th GSTR-1, 20th GSTR-3B). */
  dueDay: number;
  /** One sentence on what completing it means. */
  help: string;
}

export const STEPS: StepDef[] = [
  { key: "docs_received", label: "All expected bank statements received", kind: "auto", phase: "bank_books", dueDay: 7, help: "Every bank account the client is expected to send has a statement for the month." },
  { key: "statements_verified", label: "Bank statement verification passed", kind: "auto", phase: "bank_books", dueDay: 7, help: "Each statement ties to its running balance and, where the bank prints one, its own totals." },
  { key: "recon_done", label: "Bank reconciliation completed", kind: "auto", phase: "bank_books", dueDay: 7, help: "Reconciliation has been run for the month." },
  { key: "exceptions_explained", label: "Open exceptions resolved or explained", kind: "auto", phase: "bank_books", dueDay: 7, help: "Every exception is resolved, or accepted as a timing difference by a person." },
  { key: "gst", label: "GST filed and reconciled", kind: "authorized", phase: "full", dueDay: 20, help: "Confirm that GSTR-1 and GSTR-3B are filed and reconciled. FynHelp does not file or check this for you." },
  { key: "tds", label: "TDS paid and reconciled", kind: "authorized", phase: "full", dueDay: 7, help: "Confirm that TDS is deposited and reconciled. FynHelp does not check this for you." },
  { key: "provisions", label: "Provisions and adjustments posted", kind: "authorized", phase: "full", dueDay: 20, help: "Confirm that month-end provisions and adjustments are posted in the books." },
  { key: "mis_prepared", label: "MIS prepared", kind: "auto", phase: "full", dueDay: 20, help: "A report has been generated for the month." },
  { key: "mis_reviewed", label: "MIS reviewed", kind: "staff", phase: "full", dueDay: 20, help: "A team member has read the MIS and confirms it." },
  { key: "partner_signoff", label: "Partner sign-off", kind: "partner", phase: "full", dueDay: 20, help: "The partner has signed off the MIS." },
];

export interface CloseFacts {
  statements: { expected: number; received: number; verified: number; held: number; failed: number; notAvailable: number };
  recon: { bank: number; runDone: boolean; /** The run was on bank statements alone (no books uploaded). */ bankOnly?: boolean };
  exceptions: { open: number; explained: number };
  report: { exists: boolean; signedOff: boolean };
  /** Confirmations by a person, by step key. */
  confirmed: Record<string, { by: string | null; at: string; note?: string | null } | undefined>;
}

export interface StepState extends StepDef {
  status: StepStatus;
  /** What is true now, in a sentence ("2 of 3 statements received"). */
  detail: string;
  /** For done steps: who and when, or "by FynHelp". */
  doneBy: string | null;
  doneAt: string | null;
  /** When the step is normally due (ISO date), for the month being closed. */
  dueOn: string;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** The due date of a step for a period ("2026-10"): the due day of the following month. */
export function dueOn(period: string, day: number): string {
  const [y, m] = period.split("-").map(Number) as [number, number];
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function deriveSteps(period: string, f: CloseFacts): StepState[] {
  const out: StepState[] = [];
  const auto = (def: StepDef, ok: boolean, detail: string, blocked = false) =>
    out.push({ ...def, status: ok ? "done" : blocked ? "blocked" : "pending", detail, doneBy: ok ? "FynHelp" : null, doneAt: null, dueOn: dueOn(period, def.dueDay) });
  const person = (def: StepDef, detail: string) => {
    const c = f.confirmed[def.key];
    out.push({ ...def, status: c ? "done" : "pending", detail: c ? detail : detail, doneBy: c?.by ?? null, doneAt: c?.at ?? null, dueOn: dueOn(period, def.dueDay) });
  };
  const get = (k: string) => STEPS.find((s) => s.key === k)!;
  const s = f.statements;

  auto(
    get("docs_received"),
    s.expected > 0 ? s.received >= s.expected : s.received > 0,
    s.expected > 0
      ? `${s.received} of ${plural(s.expected, "expected statement")} received.`
      : s.received > 0
        ? `${plural(s.received, "statement")} received for the month. No expected accounts are set up, so a missing account cannot be flagged. Add the expected accounts to be told.`
        : "No statement has been received for the month yet.",
    false,
  );
  const verifiedAll = s.received > 0 && s.verified >= s.received && s.held === 0 && s.failed === 0;
  auto(
    get("statements_verified"),
    verifiedAll,
    s.received === 0
      ? "No statement has been received yet."
      : s.held > 0
        ? `${plural(s.held, "statement")} held because verification failed.`
        : s.failed > 0
          ? `${plural(s.failed, "statement")} failed verification.`
          : s.verified < s.received
            ? `${s.verified} of ${s.received} statements verified; ${plural(s.notAvailable, "statement")} could not be checked.`
            : `${plural(s.verified, "statement")} verified.`,
    s.held > 0,
  );
  auto(get("recon_done"), f.recon.runDone && f.recon.bank > 0, f.recon.bank === 0 ? "There are no bank lines to reconcile yet." : f.recon.runDone ? (f.recon.bankOnly ? "Checked on the bank statements alone (no books uploaded). Upload the books to match them." : "Reconciliation has been run.") : "Reconciliation has not been run for this month.");
  const unexplained = Math.max(0, f.exceptions.open - f.exceptions.explained);
  auto(get("exceptions_explained"), f.recon.runDone && unexplained === 0, !f.recon.runDone ? "Waiting for reconciliation." : unexplained === 0 ? "No exception needs attention." : `${plural(unexplained, "exception")} still need${unexplained === 1 ? "s" : ""} a decision.`, false);
  person(get("gst"), f.confirmed["gst"] ? "Confirmed by a person." : "Waiting for a partner or manager to confirm.");
  person(get("tds"), f.confirmed["tds"] ? "Confirmed by a person." : "Waiting for a partner or manager to confirm.");
  person(get("provisions"), f.confirmed["provisions"] ? "Confirmed by a person." : "Waiting for a partner or manager to confirm.");
  auto(get("mis_prepared"), f.report.exists, f.report.exists ? "A report has been generated." : "No report has been generated for this month.");
  person(get("mis_reviewed"), f.confirmed["mis_reviewed"] ? "Confirmed by a team member." : "Waiting for a team member to review the MIS.");
  {
    const def = get("partner_signoff");
    const c = f.confirmed["partner_signoff"];
    out.push({ ...def, status: f.report.signedOff ? "done" : "pending", detail: f.report.signedOff ? "The report is signed off." : "Waiting for the partner's sign-off on the report.", doneBy: f.report.signedOff ? (c?.by ?? "Partner") : null, doneAt: c?.at ?? null, dueOn: dueOn(period, def.dueDay) });
  }
  return out;
}

export type CloseState = "not_started" | "in_progress" | "bank_books_closed" | "fully_closed";
export const CLOSE_LABEL: Record<CloseState, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  bank_books_closed: "Bank and Books Closed",
  fully_closed: "Fully Closed",
};

export function closeState(steps: StepState[]): { state: CloseState; done: number; total: number; bankBooks: boolean; full: boolean; next: StepState | null } {
  const done = steps.filter((s) => s.status === "done").length;
  const bankBooks = steps.filter((s) => s.phase === "bank_books").every((s) => s.status === "done");
  const full = steps.every((s) => s.status === "done");
  const state: CloseState = full ? "fully_closed" : bankBooks ? "bank_books_closed" : done > 0 ? "in_progress" : "not_started";
  return { state, done, total: steps.length, bankBooks, full, next: steps.find((s) => s.status !== "done") ?? null };
}

/** Whether a role may confirm a step by hand. Auto and partner steps cannot be confirmed here. */
export function mayConfirm(role: string, kind: StepKind): boolean {
  if (kind === "staff") return true;
  if (kind === "authorized") return ["owner", "admin", "partner", "manager"].includes(role);
  return false;
}

/** Whether a client-month is late: a step is past its due date and not done, judged on a given day. */
export function overdueSteps(steps: StepState[], today: string): StepState[] {
  return steps.filter((s) => s.status !== "done" && s.dueOn < today);
}
