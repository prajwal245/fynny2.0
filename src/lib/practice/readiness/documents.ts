/**
 * Which readiness input a stored document supplies, and which months it covers. ONE place, used by every screen that asks "has this
 * client sent it?" (Data needed, the GST page, the Close tab, the Overview), so they cannot disagree.
 *
 * Coverage comes from what a file CONTAINS (the dates of its lines), never from the day it was uploaded: a statement uploaded in
 * November that covers April to March covers every one of those months.
 */
export interface DocFact {
  id?: string;
  filename: string | null;
  side: string | null;
  classification: string | null;
  createdAt: string;
  /** From the stored read: register kind, statement check dates, the first and last line date, and what kind of books export it is. */
  registerKind?: string | null;
  referenceKind?: string | null;
  /** The period the statement's own header says it covers (it can start earlier than its first line). */
  period?: { from: string | null; to: string | null } | null;
  statement?: { first: string | null; last: string | null } | null;
  range?: { first: string | null; last: string | null } | null;
  booksKind?: "day_book" | "ledger" | "unknown" | null;
  source?: string | null;
}

/** The input a return, challan, register or tax record supplies, from its name. Null for a file that supplies none. */
export function referenceInputKey(filename: string): string | null {
  const n = filename.toLowerCase();
  if (/26\s?as/.test(n)) return "form_26as";
  if (/\bais\b|annual information/.test(n)) return "ais";
  if (/gstr[\s_-]?1\b(?![\d])/.test(n)) return "gstr1";
  if (/gstr[\s_-]?3b/.test(n)) return "gstr3b";
  if (/gstr[\s_-]?2b/.test(n)) return "gstr2b";
  if (/electronic\s+credit|credit\s+ledger/.test(n)) return "credit_ledger";
  if (/electronic\s+cash|cash\s+ledger/.test(n)) return "cash_ledger";
  if (/challan|return[\s_-]filing/.test(n)) return "challans";
  if (/(sales|purchase)[\s_-]+(and[\s_-]+(sales|purchase)[\s_-]+)?registers?/.test(n)) return "registers";
  if (/trial\s+balance/.test(n)) return "tb_opening";
  return null;
}

/** The single mapping from a stored document to a readiness input key. */
export function inputKeyOfDoc(d: DocFact): string | null {
  if (d.classification === "reference") return d.referenceKind ?? (d.filename ? referenceInputKey(d.filename) : null);
  const rk = d.registerKind ?? "";
  if (d.classification === "loan_statement" || rk === "loan_statement") return "loan_statements";
  if (d.classification === "bank_statement" || (d.side === "bank" && d.statement)) return "bank_statements";
  if (rk === "gstr2b") return "gstr2b";
  if (rk === "tally_masters") return "ledger_masters";
  if (rk === "gst_sales_register" || rk === "gst_purchase_register") return "registers";
  if (d.side === "books" && d.source !== "Zoho Books") {
    // A bank or party ledger extract is not a Day Book: it does not supply one.
    if (d.booksKind === "ledger") return null;
    if (d.booksKind == null && /\bledger\b/i.test(d.filename ?? "")) return null;
    return "day_book";
  }
  return null;
}

const month = (iso: string | null | undefined) => (iso ? iso.slice(0, 7) : null);

/** Whether the document's own dates cover the month ("2025-12"). A file that does not say its dates counts from the month it arrived. */
export function coversMonth(d: DocFact, m: string): boolean {
  const key = inputKeyOfDoc(d);
  // Returns, challans and portal ledgers are whole-year files: they stand for every month of the year they cover.
  if (key && !["bank_statements", "loan_statements", "day_book"].includes(key)) return true;
  const span = d.period ? { first: d.period.from, last: d.period.to } : (d.statement ?? d.range);
  const a = month(span?.first), b = month(span?.last);
  // A file that does not say its dates is judged by when it arrived, as before: it counts from the first of that month.
  if (!a || !b) return d.createdAt.slice(0, 7) >= m;
  return m >= a && m <= b;
}

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

/** "Apr 2025 to Mar 2026" for what a set of documents covers together, or null when none says its dates. */
export function coverageNote(docs: DocFact[]): string | null {
  const spans = docs.map((d) => (d.period ? { first: d.period.from, last: d.period.to } : (d.statement ?? d.range))).filter((s): s is { first: string | null; last: string | null } => !!s && !!s.first && !!s.last);
  if (!spans.length) return null;
  const first = spans.map((s) => month(s.first)!).sort()[0]!;
  const last = spans.map((s) => month(s.last)!).sort().at(-1)!;
  return `${docs.length} file${docs.length === 1 ? "" : "s"}, ${first === last ? monthLabel(first) : `${monthLabel(first)} to ${monthLabel(last)}`}`;
}
