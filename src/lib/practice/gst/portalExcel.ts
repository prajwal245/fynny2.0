/**
 * The GST portal's Excel downloads as a firm actually receives them: the GSTR-3B annual report (one workbook, a column block per
 * month) and the GSTR-1 workbook (one invoice list for the year, dates written month first). The JSON readers in returns.ts cover
 * the monthly JSON; these cover the year-long Excel files, then cut one month out so every check runs on a single period.
 *
 * Pure and isomorphic. A figure the sheet does not carry is left zero and named in `notes`; nothing is estimated.
 */
import type { Gstr1Read, Gstr3bRead, TaxSplit } from "./returns";
import { money, type ReadInvoices } from "./invoices";

const r2 = (n: number) => Math.round(n * 100) / 100;
const zero = (): TaxSplit => ({ taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 });
const MONTHS = ["april", "may", "june", "july", "august", "september", "october", "november", "december", "january", "february", "march"];
const text = (c: unknown) => String(c ?? "").replace(/\s+/g, " ").trim();

export interface Gstr3bAnnual {
  /** The financial year's first calendar year, e.g. 2025 for "2025 - 2026"; null when the sheet does not say. */
  startYear: number | null;
  months: Gstr3bRead[];
  notes: string[];
}

/** "2025-04" for April of a financial year starting in 2025, "2026-01" for January. */
export const periodOfMonth = (startYear: number, monthIndex: number) => `${monthIndex < 9 ? startYear : startYear + 1}-${String(((monthIndex + 3) % 12) + 1).padStart(2, "0")}`;

/**
 * Reads the GSTR-3B annual report: a "Total for the year" block and twelve month blocks side by side, five columns each. Table 3.1 gives
 * taxable value, IGST, CGST, SGST, cess; the ITC table gives IGST, CGST, SGST, cess, total.
 */
export function readGstr3bAnnualRows(rowsIn: string[][]): Gstr3bAnnual {
  const rows = rowsIn.map((r) => r.map(text));
  const bad = (note: string): Gstr3bAnnual => ({ startYear: null, months: [], notes: [note] });
  let startYear: number | null = null;
  for (const r of rows.slice(0, 12)) {
    const m = /\b(20\d{2})\s*-\s*(20\d{2})\b/.exec(r.join(" "));
    if (m && Number(m[2]) === Number(m[1]) + 1) {
      startYear = Number(m[1]);
      break;
    }
  }
  // The row that names the months gives where each month's block starts.
  const monthRow = rows.find((r) => r.filter((c) => MONTHS.includes(c.toLowerCase())).length >= 6);
  if (!monthRow) return bad("This does not look like the GSTR-3B annual report: no row naming the months April to March.");
  const starts = MONTHS.map((m) => monthRow.findIndex((c) => c.toLowerCase() === m));
  if (starts.some((s) => s < 0)) return bad("The GSTR-3B annual report is missing some months in its heading row.");
  const label = (r: string[]) => (r[1] || r[0] || "").toLowerCase();
  const find = (re: RegExp, from = 0) => {
    for (let i = from; i < rows.length; i++) if (re.test(label(rows[i]!))) return i;
    return -1;
  };
  const at = {
    outward: find(/^\(?a\)?\s*outward taxable supplies \(other than zero/),
    rcm: find(/^\(?d\)?\s*inward supplies \(liable to reverse charge\)/),
    itcRcm: find(/^inward supplies liable to reverse charge\s*\(other than 1/),
    itcAvl: find(/^\(?a\)?\s*itc available/),
    itcRev: find(/^\(?b\)?\s*itc reversed/),
    itcNet: find(/^\(?c\)?\s*net itc available/),
  };
  if (at.outward < 0 && at.itcAvl < 0) return bad("This does not look like the GSTR-3B annual report: neither the outward supplies row nor the ITC rows were found.");
  const notes: string[] = [];
  for (const [k, v] of Object.entries(at)) if (v < 0) notes.push(`The row for ${k === "itcRcm" ? "ITC on reverse charge" : k === "itcAvl" ? "ITC available" : k === "itcRev" ? "ITC reversed" : k === "itcNet" ? "net ITC" : k === "rcm" ? "reverse charge supplies" : "outward supplies"} was not found, so it reads as zero.`);
  const n = (v: string | undefined) => money(v) ?? 0;
  // Table 3.1 rows: taxable, IGST, CGST, SGST, cess. ITC rows: IGST, CGST, SGST, cess.
  const supply = (row: number, s: number): TaxSplit => (row < 0 ? zero() : { taxable: n(rows[row]![s]), igst: n(rows[row]![s + 1]), cgst: n(rows[row]![s + 2]), sgst: n(rows[row]![s + 3]), cess: n(rows[row]![s + 4]) });
  const credit = (row: number, s: number): TaxSplit => (row < 0 ? zero() : { taxable: 0, igst: n(rows[row]![s]), cgst: n(rows[row]![s + 1]), sgst: n(rows[row]![s + 2]), cess: n(rows[row]![s + 3]) });
  const months: Gstr3bRead[] = MONTHS.map((_, i) => {
    const s = starts[i]!;
    return {
      period: startYear ? periodOfMonth(startYear, i) : null,
      ownGstin: null,
      outward: supply(at.outward, s),
      rcm: supply(at.rcm, s),
      itcAvailable: credit(at.itcAvl, s),
      itcOnRcm: credit(at.itcRcm, s),
      itcReversed: credit(at.itcRev, s),
      itcNet: credit(at.itcNet, s),
      notes: [],
    };
  });
  if (startYear === null) notes.push('The financial year ("2025 - 2026") was not found in the heading, so months cannot be named; choose by position.');
  return { startYear, months, notes };
}

/** The month of a full-year 3B report, or null when it is not in the report. */
export const gstr3bFor = (a: Gstr3bAnnual, period: string): Gstr3bRead | null => a.months.find((m) => m.period === period) ?? null;

/** True for the GSTR-1 workbook of a GST suite or the portal: its title says it holds "Transactions Available in GSTR-1". */
export const isGstr1Workbook = (rows: string[][]): boolean => rows.slice(0, 14).some((r) => /transactions available in gstr-?1/i.test(r.join(" ")));

/** The invoices dated in one month ("2025-12"), so a full-year list can be checked month by month. */
export function inMonth(read: ReadInvoices, period: string): ReadInvoices {
  const invoices = read.invoices.filter((i) => i.date?.startsWith(period));
  return { ...read, invoices, period, notes: [...read.notes, `Cut to ${period}: ${invoices.length} of ${read.invoices.length} invoices.`] };
}

/** A full-year GSTR-1 invoice list as the Gstr1Read the checks use. B2C, exports and nil-rated totals are not in this list and stay zero. */
export function toGstr1Read(read: ReadInvoices, period: string | null): Gstr1Read {
  const cut = period ? inMonth(read, period) : read;
  return {
    ...cut,
    b2c: zero(),
    exportsAndNil: zero(),
    notes: [...cut.notes, "GSTR-1 workbook: B2C sales, exports and nil-rated supplies are not in this list; if the firm has any, the totals will differ by that amount."],
  };
}

export const round2 = r2;
