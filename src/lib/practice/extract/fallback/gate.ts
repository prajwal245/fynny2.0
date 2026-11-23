/** Decides whether a document is worth sending to the fallback reader. Pure. The primary reader has always run first. */
import { TAX_REFERENCE_FILE } from "../taxReference";
import type { StatementCheck } from "../statementCheck";

export type FallbackReason = "no_rows" | "missing_fields" | "balance_mismatch";

export interface GateInput {
  kind: string;
  /** "bank" for a bank or cash-credit statement. Books, ledgers and everything else never go to the fallback. */
  side: string;
  documentKind: string | null;
  filename: string;
  hasRegister: boolean;
  /** The primary reader's error code, if it gave up. Passwords and unsupported types are not worth a retry. */
  errorCode: string | null;
  sourceTextLength: number;
  rows: {
    date: string | null;
    amount: number | null;
    direction: string | null;
    route: string;
  }[];
  check: Pick<StatementCheck, "status" | "breaks"> | null;
}

const NO_RETRY_ERRORS = new Set([
  "password_needed",
  "password_wrong",
  "unsupported_type",
  "too_large",
]);

export function fallbackReason(i: GateInput): FallbackReason | null {
  if (i.kind !== "pdf" || i.side !== "bank" || i.hasRegister) return null;
  if (TAX_REFERENCE_FILE.test(i.filename)) return null;
  // A loan statement can have no transactions and still be right; a purchase or sales invoice is not a statement.
  if (
    i.documentKind &&
    /^(loan_statement|invoice|tally_|gstr|register)/.test(i.documentKind)
  )
    return null;
  if (i.errorCode && NO_RETRY_ERRORS.has(i.errorCode)) return null;
  const tx = i.rows.filter((r) => r.route === "transaction");
  if (tx.length === 0)
    return i.sourceTextLength > 200 || i.errorCode ? "no_rows" : null;
  if (tx.some((r) => !r.date || r.amount == null || !r.direction))
    return "missing_fields";
  if (i.check && (i.check.status === "fail" || i.check.breaks.length > 0))
    return "balance_mismatch";
  return null;
}
