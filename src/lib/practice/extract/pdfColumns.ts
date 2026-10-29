/**
 * Debit and Credit columns in a PDF statement. The text layer of such a page loses which column an amount sat
 * in, so when the running balance is missing or cut off (a clipped page, a photographed table) the direction of
 * every line is unknown. Here the page's own layout answers it: each amount is tagged "Dr" or "Cr" by the header
 * column it sits under, and the statement reader takes that as the direction. Only amounts that clearly sit under
 * the Debit or Credit header are tagged; anything else (a balance column, a stray figure) is left alone.
 */

export interface PdfTextItem {
  str: string;
  /** x of the left edge and the width, in PDF points. */
  x: number;
  y: number;
  width: number;
}

const DEBIT_HEADER = /^(debits?|withdrawals?( amt\.?| amount)?|dr\.?|paid out)$/i;
const CREDIT_HEADER = /^(credits?|deposits?( amt\.?| amount)?|cr\.?|paid in)$/i;
const AMOUNT = /^\(?-?\d[\d,]*\.\d{2}\)?$/;

export interface StatementColumns {
  debit: { x: number; width: number };
  credit: { x: number; width: number };
  /** Height of the header row on the page it was found, so only lines below it are tagged. */
  headerY: number;
}

const centre = (c: { x: number; width: number }) => c.x + c.width / 2;

/** The Debit and Credit headers of a page, when it has both on one row. */
export function findColumns(items: PdfTextItem[]): StatementColumns | null {
  const heads = items.filter((i) => i.str.trim().length <= 20);
  for (const d of heads.filter((i) => DEBIT_HEADER.test(i.str.trim()))) {
    // The header row is one line: the Credit header sits at the same height.
    const c = heads.find((i) => CREDIT_HEADER.test(i.str.trim()) && Math.abs(i.y - d.y) < 3);
    if (c && Math.abs(centre(c) - centre(d)) >= 20) return { debit: { x: d.x, width: d.width }, credit: { x: c.x, width: c.width }, headerY: Math.min(d.y, c.y) };
  }
  return null;
}

/**
 * "Dr" or "Cr" for each amount that sits under a Debit or Credit column. `cols` come from this page's own header or,
 * on a later page that does not repeat it, from the page before (then every line of the page is below the header).
 */
export function columnMarks(items: PdfTextItem[], cols: StatementColumns | null, sameHeaderRow = true): Map<PdfTextItem, "Dr" | "Cr"> {
  const marks = new Map<PdfTextItem, "Dr" | "Cr">();
  if (!cols) return marks;
  const gap = Math.abs(centre(cols.credit) - centre(cols.debit));
  // An amount must be nearer to its header than half the gap between the two, and within a plausible column width.
  const reach = Math.min(Math.max(gap / 2, 20), 70);
  for (const i of items) {
    if (sameHeaderRow && i.y >= cols.headerY - 1) continue; // only below the header row
    if (!AMOUNT.test(i.str.trim())) continue;
    // Right-aligned figures line up on their right edge, left-aligned ones on their left: take the closer.
    const near = (h: { x: number; width: number }) => Math.min(Math.abs(i.x + i.width - (h.x + h.width)), Math.abs(i.x - h.x), Math.abs(centre(i) - centre(h)));
    const dd = near(cols.debit);
    const dc = near(cols.credit);
    if (Math.min(dd, dc) > reach) continue;
    if (Math.abs(dd - dc) < 1) continue; // cannot tell
    marks.set(i, dd < dc ? "Dr" : "Cr");
  }
  return marks;
}
