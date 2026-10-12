/**
 * Where a client's month stands, from the documents in and the recon done.
 * "All clear" only after Recon has run on both sides with nothing left open.
 */
export type Stage = { label: string; tone: "good" | "warn" | "bad" | "neutral" | "info" };

export function closeStage(x: {
  hasDocs: boolean;
  reading: boolean;
  bank: { matchStatus?: string }[];
  books: { matchStatus?: string }[];
  registersInMonth?: boolean;
  openExceptions: number;
  openReview: number;
  openChases: number;
}): Stage {
  if (!x.hasDocs && !x.reading) return { label: "Not started", tone: "neutral" };
  const hasBank = x.bank.length > 0;
  const hasBooks = x.books.length > 0;
  if (!hasBank && !hasBooks) {
    if (x.reading) return { label: "Reading documents", tone: "info" };
    return { label: x.registersInMonth ? "Waiting for bank and books" : "Waiting for documents", tone: "neutral" };
  }
  if (x.openExceptions > 0) return { label: "Needs attention", tone: "bad" };
  if (hasBank && !hasBooks) return { label: x.reading ? "Reading documents" : "Waiting for books", tone: "neutral" };
  if (hasBooks && !hasBank) return { label: x.reading ? "Reading documents" : "Waiting for bank statement", tone: "neutral" };
  // Lines Recon has not looked at yet.
  const notRun = [...x.bank, ...x.books].some((r) => !r.matchStatus || r.matchStatus === "unmatched");
  if (notRun) return { label: "Ready to reconcile", tone: "info" };
  if (x.openReview > 0 || x.openChases > 0) return { label: "Ready for review", tone: "warn" };
  return { label: "All clear", tone: "good" };
}
