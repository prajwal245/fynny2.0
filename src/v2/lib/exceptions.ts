/**
 * One count rule for exceptions everywhere (sidebar, Portfolio, client tab,
 * queue): a bank line and its book entry that failed together are one
 * decision, so the book-side twin is not counted or listed.
 */
type Ex = { id: string; status: string; side?: string; txnId?: string; candidateIds?: string[] };

export function openExceptions<T extends Ex>(all: T[]): T[] {
  const open = all.filter((e) => e.status === "open");
  const bankPairs = new Set(
    open.filter((b) => b.side !== "books" && b.txnId && b.candidateIds?.[0]).map((b) => `${b.txnId}|${b.candidateIds![0]}`),
  );
  return open.filter((e) => !(e.side === "books" && e.txnId && e.candidateIds?.[0] && bankPairs.has(`${e.candidateIds[0]}|${e.txnId}`)));
}
