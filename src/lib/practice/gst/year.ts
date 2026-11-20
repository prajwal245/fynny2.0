/**
 * GST by year. A month-only cut shows differences that clear the next month (an invoice the supplier files late, credit deferred to a
 * later return), so every loop is shown month by month and as a running total for the year. A difference that nets out across the year
 * was timing; one that is still there at the end of the year needs a reason.
 *
 * Loops built here: outward tax (GSTR-1 against GSTR-3B 3.1(a)), and input credit (GSTR-2B available against GSTR-3B claimed). The input
 * loop is PROVISIONAL: its exact definition (which 3B rows count as claimed, how reversals and ineligible credit are netted) is to be
 * agreed with the reviewing CA, and the result says so instead of presenting a settled difference.
 */
import type { ReadInvoices } from "./invoices";
import { sumInvoices, taxOf, type Gstr3bRead } from "./returns";

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface YearRow {
  month: string;
  /** Outward: GSTR-1 against GSTR-3B 3.1(a). */
  g1Taxable: number; g3bTaxable: number; g1Tax: number; g3bTax: number; outwardDiff: number; outwardCumulative: number;
  /** Input: GSTR-2B available against GSTR-3B claimed (net ITC less reverse-charge credit). Provisional. */
  itc2b: number; itc3b: number; itcDiff: number; itcCumulative: number;
  /** Reverse charge liability declared in 3B 3.1(d). */
  rcm3b: number;
}

export interface YearView {
  rows: YearRow[];
  totals: { g1Taxable: number; g3bTaxable: number; g1Tax: number; g3bTax: number; outwardDiff: number; itc2b: number; itc3b: number; itcDiff: number; rcm3b: number };
  /** Months missing from a source, by source: a year with a gap is incomplete and says so. */
  missing: { gstr1: string[]; gstr2b: string[]; gstr3b: string[] };
  notes: string[];
}

export function fiscalMonths(startYear: number): string[] {
  return Array.from({ length: 12 }, (_, i) => { const m = ((3 + i) % 12) + 1; const y = startYear + (3 + i >= 12 ? 1 : 0); return `${y}-${String(m).padStart(2, "0")}`; });
}

export function yearView(months: string[], read: { gstr1: (m: string) => ReadInvoices; gstr2b: (m: string) => ReadInvoices; gstr3b: (m: string) => Gstr3bRead }): YearView {
  const rows: YearRow[] = [];
  const missing = { gstr1: [] as string[], gstr2b: [] as string[], gstr3b: [] as string[] };
  let cumOut = 0, cumItc = 0;
  for (const m of months) {
    const a = read.gstr1(m), b = read.gstr2b(m), c = read.gstr3b(m);
    if (!a.invoices.length) missing.gstr1.push(m);
    if (!b.invoices.length) missing.gstr2b.push(m);
    if (c.notes.length || (!taxOf(c.outward) && !c.outward.taxable)) missing.gstr3b.push(m);
    const s1 = sumInvoices(a.invoices);
    const avail = sumInvoices(b.invoices.filter((i) => i.itc !== "N" && !i.reverseCharge));
    const claimed = r2(taxOf(c.itcNet) - taxOf(c.itcOnRcm));
    const outwardDiff = r2(taxOf(s1) - taxOf(c.outward));
    const itcDiff = r2(claimed - taxOf(avail));
    cumOut = r2(cumOut + outwardDiff); cumItc = r2(cumItc + itcDiff);
    rows.push({ month: m, g1Taxable: s1.taxable, g3bTaxable: c.outward.taxable, g1Tax: taxOf(s1), g3bTax: taxOf(c.outward), outwardDiff, outwardCumulative: cumOut, itc2b: taxOf(avail), itc3b: claimed, itcDiff, itcCumulative: cumItc, rcm3b: taxOf(c.rcm) });
  }
  const sum = (k: keyof YearRow) => r2(rows.reduce((n, r) => n + (r[k] as number), 0));
  return {
    rows, missing,
    totals: { g1Taxable: sum("g1Taxable"), g3bTaxable: sum("g3bTaxable"), g1Tax: sum("g1Tax"), g3bTax: sum("g3bTax"), outwardDiff: sum("outwardDiff"), itc2b: sum("itc2b"), itc3b: sum("itc3b"), itcDiff: sum("itcDiff"), rcm3b: sum("rcm3b") },
    notes: [
      "A running total that returns to nil is timing; a difference still open at the end of the year needs a reason.",
      "The input credit comparison is provisional until its definition is agreed with the reviewing CA (which 3B rows are claimed, reversals, ineligible credit, reverse charge).",
      ...(missing.gstr1.length + missing.gstr2b.length + missing.gstr3b.length ? ["Some months are missing from a source. The year is incomplete and its totals should not be signed off."] : []),
    ],
  };
}
