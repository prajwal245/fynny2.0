/**
 * Orchestration rules, kept pure so they are easy to test: when a failed
 * document is retried, which periods a document touched, and when the
 * "missing bank statement" chase is due. The server side (orchestrator.server)
 * applies them.
 */
import { parsePeriod, previousPeriod } from "./core";

export const MAX_EXTRACT_ATTEMPTS = 3;
/** Wait before attempt 2, attempt 3. */
export const RETRY_BACKOFF_MS = [2 * 60_000, 10 * 60_000];

/** Extract failure codes that a later attempt can fix (an AI provider was down). */
const RETRYABLE_CODES = new Set(["needs_ai"]);
const RETRYABLE_MESSAGE =
  /timed? ?out|rate limit|429|5\d\d|fetch failed|network|ECONN|temporarily|unavailable|Saving (transactions|review items) failed|download/i;

export function isRetryable(failure: { code?: string | null; message: string }): boolean {
  if (failure.code && RETRYABLE_CODES.has(failure.code)) return true;
  if (failure.code) return false;
  return RETRYABLE_MESSAGE.test(failure.message);
}

/** When the next attempt should run, or null when the document has had its tries. */
export function nextAttemptAt(attemptsSoFar: number, now = new Date()): Date | null {
  if (attemptsSoFar >= MAX_EXTRACT_ATTEMPTS) return null;
  const wait = RETRY_BACKOFF_MS[Math.min(attemptsSoFar - 1, RETRY_BACKOFF_MS.length - 1)] ?? RETRY_BACKOFF_MS[0];
  return new Date(now.getTime() + wait);
}

/** The month labels ("September 2026") a set of transaction dates falls in, most recent first. */
export function periodsOf(dates: (string | null | undefined)[]): string[] {
  const months = new Set<string>();
  for (const d of dates) if (d && /^\d{4}-\d{2}/.test(d)) months.add(d.slice(0, 7));
  return [...months].sort().reverse().map((m) => parsePeriod(m).label);
}

/** A period is ready for the partner's MIS once nothing is waiting on a person. */
export function readyForMis(counts: { matched: number; openExceptions: number; openReview: number }): boolean {
  return counts.matched > 0 && counts.openExceptions === 0 && counts.openReview === 0;
}

/**
 * The spec's automatic chase: "no bank statement received by the Nth of the
 * month". Returns the period to chase (last month) when it is due today.
 */
export function autoChaseDue(now: Date, chaseDay: number | null | undefined): string | null {
  if (!chaseDay || now.getUTCDate() < chaseDay) return null;
  const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return previousPeriod(parsePeriod(thisMonth))?.label ?? null;
}
