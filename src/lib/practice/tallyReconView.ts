/**
 * The reconciliation as a person reads it: each bank-statement line next to the Tally entry it matched, tagged as
 * matched, partly matched or missing in Tally, with debit and credit in separate columns, the statement's account checked
 * against the Tally bank ledger it is mapped to, and a warning when Tally already seems to hold the entry.
 *
 * Pure and deterministic: nothing here writes anything. Only a line tagged "missing" can be approved for Tally.
 */
import { toPaise } from "./core";

/** Debit and credit as the client's bank ledger in Tally has them: money in is a debit, money out is a credit. */
export function splitDrCr(
  direction: "in" | "out",
  amount: number,
): { debit: number | null; credit: number | null } {
  return direction === "in"
    ? { debit: amount, credit: null }
    : { debit: null, credit: amount };
}

export interface BookEntry {
  id: string;
  date: string;
  direction: "in" | "out";
  amount: number;
  counterparty: string | null;
  description: string | null;
  reference: string | null;
  category: string | null;
}

export interface MatchInfo {
  books: BookEntry[];
  stage: string;
  score: number;
  /** Plain words for why they were paired, built from the engine's own explanation. */
  reason: string;
}

export interface ExceptionInfo {
  reason_code: string;
  detail: string | null;
  candidates: {
    txn_id: string;
    score?: number;
    amount?: number;
    txn_date?: string;
    description?: string | null;
  }[];
}

export type ReconStatus = "matched" | "partial" | "missing" | "pushed";

export const STATUS_LABEL: Record<ReconStatus, string> = {
  matched: "Matched",
  partial: "Partly matched",
  missing: "Missing in Tally",
  pushed: "Sent to Tally",
};

/** Reasons that mean "the same party is there, but not exactly": a person decides, nothing is pushed by itself. */
const PARTIAL = new Set([
  "partial_payment_suspect",
  "amount_mismatch",
  "date_gap",
  "reference_mismatch",
]);

export interface ClassifyInput {
  id: string;
  direction: "in" | "out";
  amount: number;
  date: string;
  match?: MatchInfo | null;
  exception?: ExceptionInfo | null;
  /** Already approved and sent to Tally, waiting for the next sync to show it as matched. */
  posted?: boolean;
  /** Where an approved line is: waiting for the connector, being written, or written. */
  postedState?: "queued" | "sent" | "posted";
  /** Entries of the books by id, so a candidate can be shown. */
  booksById?: Map<string, BookEntry>;
}

export interface ReconRow {
  status: ReconStatus;
  label: string;
  why: string;
  tally: BookEntry[];
  /** For a partly matched line: the nearest entry and how it differs. */
  nearest: BookEntry | null;
  difference: { amount: number; days: number } | null;
}

const days = (a: string, b: string) =>
  Math.round(
    (Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000,
  );

export function classifyLine(i: ClassifyInput): ReconRow {
  if (i.match && i.match.books.length) {
    return {
      status: "matched",
      label: STATUS_LABEL.matched,
      why: i.match.reason,
      tally: i.match.books,
      nearest: null,
      difference: null,
    };
  }
  if (i.posted || i.postedState) {
    const st = i.postedState ?? "posted";
    const why =
      st === "queued"
        ? "Approved. It is written to Tally the next time the connector checks in."
        : st === "sent"
          ? "Being written to Tally now."
          : "Approved and written to Tally. It shows as matched after the next sync.";
    return {
      status: "pushed",
      label: st === "posted" ? STATUS_LABEL.pushed : st === "sent" ? "Writing to Tally" : "Approved, waiting for Tally",
      why,
      tally: [],
      nearest: null,
      difference: null,
    };
  }
  const ex = i.exception;
  if (ex && PARTIAL.has(ex.reason_code)) {
    const cand = [...ex.candidates].sort(
      (a, b) => (b.score ?? 0) - (a.score ?? 0),
    )[0];
    const book = cand ? (i.booksById?.get(cand.txn_id) ?? null) : null;
    const nearest: BookEntry | null =
      book ??
      (cand && cand.amount !== undefined && cand.txn_date
        ? {
            id: cand.txn_id,
            date: cand.txn_date,
            direction: i.direction,
            amount: cand.amount,
            counterparty: null,
            description: cand.description ?? null,
            reference: null,
            category: null,
          }
        : null);
    if (nearest) {
      return {
        status: "partial",
        label: STATUS_LABEL.partial,
        why:
          ex.detail ||
          "The same party is in Tally, but the amount or date is different.",
        tally: [],
        nearest,
        difference: {
          amount: Math.round((i.amount - nearest.amount) * 100) / 100,
          days: days(i.date, nearest.date),
        },
      };
    }
  }
  return {
    status: "missing",
    label: STATUS_LABEL.missing,
    why: ex?.detail || "No entry in Tally matches this line.",
    tally: [],
    nearest: null,
    difference: null,
  };
}

/** The words for a match, from the engine's explanation of how close it was. */
export function matchReason(
  stage: string,
  score: number,
  e:
    | {
        amount_diff?: number;
        date_gap_days?: number;
        counterparty_score?: number;
      }
    | null
    | undefined,
): string {
  const how =
    stage === "exact"
      ? "Same amount and date"
      : stage === "rules"
        ? "Paired by a rule"
        : stage === "manual"
          ? "Matched by a person"
          : stage === "external"
            ? "Matched in the other system"
            : "Same party and amount";
  const bits: string[] = [];
  if (e?.date_gap_days)
    bits.push(
      `${Math.abs(e.date_gap_days)} day${Math.abs(e.date_gap_days) === 1 ? "" : "s"} apart`,
    );
  if (e?.amount_diff && Math.abs(e.amount_diff) > 0.004)
    bits.push(`₹${Math.abs(e.amount_diff).toFixed(2)} difference`);
  return `${how}${bits.length ? `, ${bits.join(", ")}` : ""} (${Math.round(score * 100)}% sure).`;
}

/* ── "Looks already in Tally" ─────────────────────────────── */

/**
 * Entries in the books that look like the same transaction as a line about to be pushed: the same direction and the exact
 * amount within a few days. It covers books updated after the last sync, or typed in by hand, that reconciliation did not pair.
 */
export function alreadyInTally(
  line: { direction: "in" | "out"; amount: number; date: string },
  books: BookEntry[],
  windowDays = 3,
): BookEntry[] {
  const p = toPaise(line.amount);
  return books
    .filter(
      (b) =>
        b.direction === line.direction &&
        toPaise(b.amount) === p &&
        Math.abs(days(line.date, b.date)) <= windowDays,
    )
    .slice(0, 3);
}

export const duplicateWarning = (b: BookEntry): string =>
  `Tally already has a ${b.direction === "in" ? "receipt" : "payment"} of ₹${b.amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} on ${b.date}${b.description ? `: ${b.description.slice(0, 80)}` : ""}.`;

/* ── the statement's account against the Tally bank ledger ── */

const BANKS: [string, RegExp][] = [
  ["HDFC", /\bhdfc\b/i],
  ["ICICI", /\bicici\b/i],
  ["SBI", /\b(sbi|state bank of india)\b/i],
  ["Axis", /\baxis\b/i],
  ["Kotak", /\bkotak\b/i],
  ["Yes Bank", /\byes bank\b/i],
  ["IDFC", /\bidfc\b/i],
  ["IndusInd", /\bindusind\b/i],
  ["Federal", /\bfederal\b/i],
  ["Canara", /\bcanara\b/i],
  ["PNB", /\b(pnb|punjab national)\b/i],
  ["Bank of Baroda", /\b(bank of baroda|bob)\b/i],
  ["Union Bank", /\bunion bank\b/i],
];

export interface StatementAccount {
  accountNo: string | null;
  bank: string | null;
}

/** The account number and bank a statement says it is for, read from its header text and file name. */
export function statementAccount(
  text: string,
  filename = "",
): StatementAccount {
  const head = text.slice(0, 6000);
  const m =
    /\b(?:a\/?c|account)\s*(?:no\.?|number|#)?\s*[:.\-]?\s*([Xx*\d][Xx*\d\s-]{5,24}\d)/i.exec(
      head,
    );
  const accountNo = m ? m[1]!.replace(/[\s-]/g, "") : null;
  const bank =
    BANKS.find(([, re]) => re.test(head) || re.test(filename))?.[0] ?? null;
  return {
    accountNo: accountNo && /\d{4}/.test(accountNo) ? accountNo : null,
    bank,
  };
}

export interface AccountCheck {
  state: "match" | "mismatch" | "unknown";
  message: string;
}

/** Compares what the statement says with the Tally bank ledger it is being posted to. A mismatch must be confirmed by a person. */
export function compareAccount(
  stmt: StatementAccount | null,
  ledgerName: string,
): AccountCheck {
  if (!stmt || (!stmt.accountNo && !stmt.bank))
    return {
      state: "unknown",
      message:
        "The statement does not say which account it is, so it could not be compared with the Tally ledger.",
    };
  const last4 = stmt.accountNo
    ? stmt.accountNo.replace(/\D/g, "").slice(-4)
    : "";
  const runs = [...ledgerName.matchAll(/\d{4,}/g)].map((m) => m[0]);
  const named = BANKS.find(([, re]) => re.test(ledgerName))?.[0] ?? null;
  const label = `${stmt.bank ?? "The statement"}${stmt.accountNo ? ` account ending ${last4}` : ""}`;
  if (stmt.bank && named && stmt.bank !== named)
    return {
      state: "mismatch",
      message: `${label} is being posted to "${ledgerName}", which is a ${named} ledger.`,
    };
  if (last4 && runs.length) {
    const same = runs.some(
      (r) =>
        r.includes(last4) ||
        (stmt.accountNo ?? "").replace(/\D/g, "").includes(r),
    );
    return same
      ? {
          state: "match",
          message: `${label} matches the Tally ledger "${ledgerName}".`,
        }
      : {
          state: "mismatch",
          message: `${label}, but the Tally ledger "${ledgerName}" is for an account with different digits (${runs[0]}).`,
        };
  }
  if (stmt.bank && named)
    return {
      state: "match",
      message: `${label} and the Tally ledger "${ledgerName}" are the same bank. The ledger name has no account number to check further.`,
    };
  return {
    state: "unknown",
    message: `${label}. The Tally ledger "${ledgerName}" has no bank name or account number in its name, so the two could not be compared.`,
  };
}

/**
 * The bank ledger a statement belongs to, so nobody has to pick it by hand and a wrong default can never be one click from posting
 * money into the wrong bank. A ledger whose name carries the statement's account digits wins; failing that, the only ledger of the
 * same bank. When it is not clear, nothing is chosen and the person picks.
 */
export function pickBankLedger(stmt: StatementAccount | null, ledgers: string[]): string | null {
  if (!stmt || (!stmt.accountNo && !stmt.bank) || !ledgers.length) return null;
  const digits = (stmt.accountNo ?? "").replace(/\D/g, "");
  const last4 = digits.slice(-4);
  if (last4) {
    const byDigits = ledgers.filter((l) => [...l.matchAll(/\d{4,}/g)].some((m) => m[0].includes(last4) || digits.includes(m[0])));
    if (byDigits.length === 1) return byDigits[0]!;
    if (byDigits.length > 1) return byDigits.find((l) => compareAccount(stmt, l).state === "match") ?? null;
  }
  if (stmt.bank) {
    const sameBank = ledgers.filter((l) => BANKS.find(([, re]) => re.test(l))?.[0] === stmt.bank);
    if (sameBank.length === 1) return sameBank[0]!;
  }
  return null;
}
