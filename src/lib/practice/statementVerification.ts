/**
 * The one answer to "has this bank statement been checked?": Passed, Failed or Not available.
 *
 * Read from the statement check already stored with the document (running balance, gaps, overlap with earlier statements and, where
 * the bank prints one, the tie-out to its own totals). It never changes a transaction: a bank's printed figures are evidence for a
 * person, not instructions. A failed statement is HELD until a person accepts it with a reason; a statement that cannot be checked
 * says so and is not called verified.
 */
export type VerificationResult = "passed" | "failed" | "not_available";

export interface StatementCheckLike {
  status?: "pass" | "warn" | "fail" | "unknown" | string;
  headline?: string;
  lines?: number;
  withBalance?: number;
  checks?: { ok: boolean | null; label: string; detail: string }[];
  bankTie?: { tied: boolean | null; source: string };
  /** A person accepted a failed statement, with a reason. */
  accepted?: { by: string | null; at: string; note: string } | null;
}

export interface Verification {
  result: VerificationResult;
  /** Short label for a badge. */
  label: string;
  /** Held: failed and not accepted. A held statement is not "successfully processed". */
  held: boolean;
  /** What the printed summary check said, in words. */
  summary: "tied" | "not_tied" | "not_available";
  /** Plain reasons, failed checks first. */
  reasons: string[];
  acceptedBy: string | null;
}

export function verificationOf(sc: StatementCheckLike | null | undefined): Verification {
  if (!sc || !sc.status)
    return { result: "not_available", label: "Not available", held: false, summary: "not_available", reasons: ["No statement check was recorded for this file."], acceptedBy: null };
  const failedChecks = (sc.checks ?? []).filter((c) => c.ok === false).map((c) => c.detail);
  const summary: Verification["summary"] = sc.bankTie?.tied === true ? "tied" : sc.bankTie?.tied === false ? "not_tied" : "not_available";
  if (sc.status === "fail") {
    const accepted = sc.accepted ?? null;
    return {
      result: "failed",
      label: accepted ? "Failed, accepted" : "Failed",
      held: !accepted,
      summary,
      reasons: failedChecks.length ? failedChecks : [sc.headline ?? "The statement did not pass its checks."],
      acceptedBy: accepted ? (accepted.by ?? "a team member") : null,
    };
  }
  if (sc.status === "unknown")
    return { result: "not_available", label: "Not available", held: false, summary, reasons: [sc.headline ?? "The statement has no running balance to check against."], acceptedBy: null };
  const reasons: string[] = [];
  if (summary === "not_available") reasons.push("The bank prints no summary to compare, so the verification rests on the running balance.");
  else if (summary === "tied") reasons.push("Counts and totals agree with the figures the bank prints.");
  return { result: "passed", label: "Passed", held: false, summary, reasons, acceptedBy: null };
}

/** What a verification counts as when a month is closed: verified by the system, or by a person who accepted the failure. */
export const countsAsVerified = (v: Verification) => v.result === "passed" || (v.result === "failed" && !v.held);
