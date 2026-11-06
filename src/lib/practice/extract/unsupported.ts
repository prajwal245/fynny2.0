/**
 * Reports FynHelp does not read yet. Said plainly at upload, instead of filling the review queue with lines that
 * were never transactions (a trial balance has no dates; an ageing report lists balances, not entries).
 */

const cells = (row: string[]) => row.map((c) => String(c ?? "").trim()).filter(Boolean);

export function unsupportedReport(table: string[][]): string | null {
  // Titles sit in the first rows with only a cell or two filled.
  // A title row has one or two cells and no amount or date in it, which keeps a transaction line out.
  const numeric = /^[\d,.\-]+$|\d{1,2}[\/-][\w]{1,3}[\/-]\d{2,4}/;
  const titles = table.slice(0, 12).map(cells).filter((r) => r.length > 0 && r.length <= 2 && !r.some((c) => numeric.test(c))).map((r) => r.join(" ").toLowerCase());
  const hit = (re: RegExp) => titles.some((t) => re.test(t));
  const how = "Export the bank ledger (Display More Reports, Account Books, Ledger) as Excel, or the Day Book, instead.";
  if (hit(/\btrial balance\b/)) return `This is a Trial Balance. FynHelp does not read trial balances yet, because they hold balances, not transactions. ${how}`;
  if (hit(/\b(ageing|aging)\b|\bbills? (receivable|payable)\b|\boutstandings?\b|\bdebtors?\b.*\b(ageing|aging)\b/))
    return `This looks like a debtors or creditors ageing report. FynHelp does not read ageing reports yet, because they list balances, not transactions. ${how}`;
  return null;
}

/** A Tally XML file with no vouchers is a report export (such as a Ledger), not a Day Book. */
export const TALLY_XML_NO_VOUCHERS =
  "This Tally XML has no vouchers in it, so it is probably a report export (for example Ledger as XML). In Tally, export the ledger as Excel (Spreadsheet) instead, or export the Day Book as XML.";
