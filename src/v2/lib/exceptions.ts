/**
 * One count rule for exceptions everywhere (sidebar, Portfolio, client tab,
 * queue): a bank line and its book entry that failed together are one
 * decision, so the book-side twin is not counted or listed.
 */
import { isExplained } from "@/lib/practice/exceptionKinds";

type Ex = { id: string; status: string; side?: string; txnId?: string; candidateIds?: string[]; workStatus?: string };

export function openExceptions<T extends Ex>(all: T[]): T[] {
  const open = all.filter((e) => e.status === "open");
  // A bank line and its book entry are one decision: pair them first, so accepting either settles both.
  const bankPairs = new Set(
    open.filter((b) => b.side !== "books" && b.txnId && b.candidateIds?.[0]).map((b) => `${b.txnId}|${b.candidateIds![0]}`),
  );
  const decisions = open.filter((e) => !(e.side === "books" && e.txnId && e.candidateIds?.[0] && bankPairs.has(`${e.candidateIds[0]}|${e.txnId}`)));
  // Open means "still needs a decision": a decision a person accepted as timing (or resolved) is explained, exactly as the month-end
  // close counts it, so it leaves every count. It stays attached to its line and clears when a later match settles it.
  return decisions.filter((e) => !isExplained(e.workStatus));
}

/** The same rule for the month on screen: what the sidebar, client tabs and close progress count. */
export function openExceptionsIn<T extends Ex & { date: string }>(all: T[], monthOf: (iso: string) => string | null, period: string): T[] {
  return openExceptions(all).filter((e) => monthOf(e.date) === period);
}
