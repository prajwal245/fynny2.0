/**
 * The month-end close as a list of steps, who does each one, and where it stands.
 *
 * It follows how a CA firm really closes a client's month (collect, read, check, match, investigate, report,
 * sign off) but names only what FynHelp does today. Everything that happens in Tally or Zoho Books, and
 * anything FynHelp does not do yet, is listed honestly as such and is never counted as progress.
 * Status comes from the same facts the rest of the app uses, never from a separate flag.
 */
import type { CloseStage } from "../store";

export type WorkflowKind = "agent" | "you" | "partner";
export type StepStatus = "done" | "current" | "todo";

export interface WorkflowFacts {
  period: string;
  /** Documents with lines in this month that were read. */
  docsRead: number;
  /** Documents still being uploaded or read. */
  reading: boolean;
  openChases: number;
  bankLines: number;
  bookLines: number;
  openReview: number;
  recon: { matched: number; bank: number } | null;
  openExceptions: number;
  misCount: number;
  signedOff: boolean;
}

export interface WorkflowStep {
  id: string;
  phase: CloseStage;
  title: string;
  kind: WorkflowKind;
  status: StepStatus;
  detail: string;
}

export const KIND_LABEL: Record<WorkflowKind, string> = {
  agent: "Agent",
  you: "You approve",
  partner: "Partner",
};

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** The steps FynHelp tracks, in order. The first one not done is the current step. */
export function workflowFor(f: WorkflowFacts): WorkflowStep[] {
  const reconDone = Boolean(f.recon);
  const misSent = f.misCount > 0;
  const rows: { s: Omit<WorkflowStep, "status">; done: boolean }[] = [
    {
      s: {
        id: "collect",
        phase: "Documents",
        title: "Collect the client's documents",
        kind: "agent",
        detail: f.openChases
          ? `${plural(f.openChases, "item is", "items are")} still being chased`
          : f.docsRead
            ? `${plural(f.docsRead, "document", "documents")} in`
            : "Nothing collected for this month yet",
      },
      done: f.docsRead > 0 && f.openChases === 0,
    },
    {
      s: {
        id: "read",
        phase: "Documents",
        title: "Read and sort each document",
        kind: "agent",
        detail: f.reading
          ? "Extract is reading"
          : f.docsRead
            ? "Sorted as sale, purchase, bank or journal, with a confidence score"
            : "Waiting for a document",
      },
      done: f.docsRead > 0 && !f.reading,
    },
    {
      s: {
        id: "books",
        phase: "Documents",
        title: "Bring in the books from Tally or Zoho Books",
        kind: "agent",
        detail: f.bookLines
          ? `${plural(f.bookLines, "entry", "entries")} read from the books`
          : "Connect Tally or Zoho Books, or upload the export",
      },
      done: f.bookLines > 0,
    },
    {
      s: {
        id: "validate",
        phase: "Review",
        title: "Check the documents for repeats and GST",
        kind: "agent",
        detail: f.docsRead
          ? "A file sent twice is ignored. The GSTIN, taxable value and tax columns of a register are checked"
          : "Runs on every document as it is read",
      },
      done: f.docsRead > 0 && !f.reading,
    },
    {
      s: {
        id: "review",
        phase: "Review",
        title: "Check the rows Extract was unsure about",
        kind: "you",
        detail: f.openReview
          ? `${plural(f.openReview, "row", "rows")} to confirm`
          : f.docsRead
            ? "All rows confirmed"
            : "Nothing to review yet",
      },
      done: f.docsRead > 0 && f.openReview === 0,
    },
    {
      s: {
        id: "match",
        phase: "Recon",
        title: "Match the bank statement to the books",
        kind: "agent",
        detail: f.recon
          ? `${f.recon.matched} of ${f.recon.bank} matched: exact first, then close matches, then your rules`
          : "Not run for this period",
      },
      done: reconDone,
    },
    {
      s: {
        id: "investigate",
        phase: "Exceptions",
        title: "Investigate what did not match",
        kind: "you",
        detail: !reconDone
          ? "Starts once Recon has run"
          : f.openExceptions
            ? `${plural(f.openExceptions, "exception", "exceptions")} to clear, each with its likeliest matches`
            : "Nothing unmatched",
      },
      done: reconDone && f.openExceptions === 0,
    },
    {
      s: {
        id: "mis",
        phase: "MIS",
        title: "Prepare the MIS from matched, verified data",
        kind: "agent",
        detail: misSent
          ? "Prepared. Every figure links to its source"
          : "Not generated yet",
      },
      done: misSent,
    },
    {
      s: {
        id: "signoff",
        phase: "MIS",
        title: "Partner reviews and signs off",
        kind: "partner",
        detail: f.signedOff
          ? "Signed off by the partner"
          : misSent
            ? "Waiting for partner sign off"
            : "After the MIS is prepared",
      },
      done: f.signedOff,
    },
  ];
  let current = false;
  return rows.map(({ s, done }) => {
    if (done) return { ...s, status: "done" as const };
    if (!current) {
      current = true;
      return { ...s, status: "current" as const };
    }
    return { ...s, status: "todo" as const };
  });
}

export type OutsideKind = "books" | "later";

export interface OutsideStep {
  id: string;
  title: string;
  kind: OutsideKind;
  detail: string;
}

export const OUTSIDE_LABEL: Record<OutsideKind, string> = {
  books: "In your books",
  later: "Not in FynHelp yet",
};

/**
 * What a firm does around FynHelp. None of it counts toward Close progress, and FynHelp does not post any of it.
 * A bank line the partner approves can be written to Tally or Zoho Books (Exceptions); everything else is yours.
 */
export const OUTSIDE_STEPS: OutsideStep[] = [
  {
    id: "record",
    title: "Record sales, purchases, expenses and journals",
    kind: "books",
    detail:
      "Entered in Tally or Zoho Books. FynHelp reads the result and does not create these entries",
  },
  {
    id: "ledgers",
    title: "Create ledgers and choose the accounting treatment",
    kind: "books",
    detail:
      "Done in Tally or Zoho Books. FynHelp only suggests an existing ledger for a bank line you approve",
  },
  {
    id: "tb",
    title: "Trial balance and the day book review",
    kind: "books",
    detail:
      "Run in your accounting software. FynHelp reads the Day Book and ledger names",
  },
  {
    id: "brs",
    title: "Bank Reconciliation Statement",
    kind: "later",
    detail:
      "FynHelp matches lines and lists the differences, and does not prepare the statement itself yet",
  },
];

/** Which phase is on screen: the phase of the current step, or MIS once everything is done. */
export function currentPhase(steps: WorkflowStep[]): CloseStage {
  return steps.find((s) => s.status === "current")?.phase ?? "MIS";
}

/** How many tracked steps are done, for "5 of 8 steps". */
export function stepsDone(steps: WorkflowStep[]): {
  done: number;
  total: number;
} {
  return {
    done: steps.filter((s) => s.status === "done").length,
    total: steps.length,
  };
}
