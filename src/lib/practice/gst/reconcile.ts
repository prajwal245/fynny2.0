/**
 * GSTR-2B against the purchase books: which invoices the supplier reported and the books have, which only one side has, and which
 * differ in amount. Read-only: nothing is filed or changed, the result is a worklist for the CA.
 *
 * Matching runs in stages, most certain first, and an invoice is used once:
 *   1. same supplier GSTIN and same invoice number
 *   2. same supplier and the same number once case, punctuation and leading zeros are ignored ("INV/0042" = "inv42")
 *   3. same supplier, no number match, but the same amounts within a rupee and dates within 10 days (a number mistyped on one side)
 * A pair that matches on number but differs in amount is reported as a mismatch, never silently accepted.
 * ITC at risk is the tax on books invoices the portal does not show (the supplier has not filed, or filed under another GSTIN).
 */
import { gstinKey, looseInvoiceNo, normInvoiceNo, type GstInvoice } from "./invoices";

export type MatchHow = "exact" | "loose" | "amount";

export interface Pair {
  books: GstInvoice;
  portal: GstInvoice;
  how: MatchHow;
  /** Per component, books minus portal, only those that differ beyond the tolerance. */
  diffs: { field: "taxable" | "igst" | "cgst" | "sgst" | "cess"; books: number; portal: number }[];
}

export interface VendorFollowUp {
  gstin: string;
  party: string;
  /** Books invoices the portal does not show. */
  missing: GstInvoice[];
  itcAtRisk: number;
  taxable: number;
}

export interface Gstr2bRecon {
  period: string | null;
  matched: Pair[];
  /** Matched on the number but the amounts differ. */
  mismatched: Pair[];
  /** In the books, not on the portal. */
  missingInPortal: GstInvoice[];
  /** On the portal, not in the books. */
  missingInBooks: GstInvoice[];
  /** On the portal with ITC marked not available. */
  itcBlocked: GstInvoice[];
  vendors: VendorFollowUp[];
  totals: {
    books: Totals;
    portal: Totals;
    /** Tax on invoices both sides agree on. */
    matchedTax: number;
    itcAtRisk: number;
    /** Tax the portal offers that the books have not recorded. */
    unbookedItc: number;
    /** Tax on matched invoices where the amounts differ (books minus portal). */
    mismatchTaxDiff: number;
  };
  notes: string[];
}

interface Totals {
  invoices: number;
  taxable: number;
  tax: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const tax = (i: GstInvoice) => i.igst + i.cgst + i.sgst + i.cess;
const totals = (xs: GstInvoice[]): Totals => ({ invoices: xs.length, taxable: round2(xs.reduce((a, i) => a + i.taxable, 0)), tax: round2(xs.reduce((a, i) => a + tax(i), 0)) });

const TOL = 1;
const DAY = 86_400_000;

function diffsOf(b: GstInvoice, p: GstInvoice): Pair["diffs"] {
  const out: Pair["diffs"] = [];
  for (const f of ["taxable", "igst", "cgst", "sgst", "cess"] as const) if (Math.abs(b[f] - p[f]) > TOL) out.push({ field: f, books: b[f], portal: p[f] });
  return out;
}

const gap = (a: string | null, b: string | null) => (a && b ? Math.abs(Date.parse(a) - Date.parse(b)) / DAY : Infinity);

export function reconcileGstr2b(booksIn: GstInvoice[], portalIn: GstInvoice[], opts: { period?: string | null } = {}): Gstr2bRecon {
  const notes: string[] = [];
  const books = booksIn;
  const portalLeft = new Set(portalIn.map((_, i) => i));
  const booksLeft = new Set(books.map((_, i) => i));
  const pairs: Pair[] = [];

  const byGstin = new Map<string, number[]>();
  portalIn.forEach((p, i) => {
    const k = gstinKey(p.gstin);
    byGstin.set(k, [...(byGstin.get(k) ?? []), i]);
  });

  const take = (bi: number, pi: number, how: MatchHow) => {
    booksLeft.delete(bi);
    portalLeft.delete(pi);
    pairs.push({ books: books[bi]!, portal: portalIn[pi]!, how, diffs: diffsOf(books[bi]!, portalIn[pi]!) });
  };

  // Stages 1 and 2: by number.
  for (const stage of ["exact", "loose"] as const) {
    for (const bi of [...booksLeft]) {
      const b = books[bi]!;
      const cands = (byGstin.get(gstinKey(b.gstin)) ?? []).filter((pi) => portalLeft.has(pi) && portalIn[pi]!.docType === b.docType);
      const same = stage === "exact" ? (x: string, y: string) => normInvoiceNo(x) === normInvoiceNo(y) : (x: string, y: string) => looseInvoiceNo(x) === looseInvoiceNo(y);
      const hits = cands.filter((pi) => normInvoiceNo(b.no) !== "" && same(b.no, portalIn[pi]!.no));
      if (!hits.length) continue;
      // Prefer the candidate whose amounts agree.
      const best = hits.find((pi) => diffsOf(b, portalIn[pi]!).length === 0) ?? hits[0]!;
      take(bi, best, stage);
    }
  }
  // Stage 3: same supplier, same amounts, near date, different number.
  for (const bi of [...booksLeft]) {
    const b = books[bi]!;
    const cands = (byGstin.get(gstinKey(b.gstin)) ?? []).filter((pi) => portalLeft.has(pi) && portalIn[pi]!.docType === b.docType);
    const hit = cands.find((pi) => {
      const p = portalIn[pi]!;
      return diffsOf(b, p).length === 0 && b.taxable > 0 && gap(b.date, p.date) <= 10;
    });
    if (hit !== undefined) take(bi, hit, "amount");
  }

  const matched = pairs.filter((p) => p.diffs.length === 0);
  const mismatched = pairs.filter((p) => p.diffs.length > 0);
  const missingInPortal = [...booksLeft].map((i) => books[i]!);
  const missingInBooks = [...portalLeft].map((i) => portalIn[i]!);
  const itcBlocked = portalIn.filter((p) => p.itc === "N");

  const byVendor = new Map<string, VendorFollowUp>();
  for (const i of missingInPortal) {
    if (!i.gstin) continue; // an unregistered seller has no 2B to appear in
    const k = gstinKey(i.gstin);
    const v = byVendor.get(k) ?? { gstin: k, party: i.party, missing: [], itcAtRisk: 0, taxable: 0 };
    v.missing.push(i);
    v.itcAtRisk = round2(v.itcAtRisk + tax(i));
    v.taxable = round2(v.taxable + i.taxable);
    if (!v.party && i.party) v.party = i.party;
    byVendor.set(k, v);
  }
  const vendors = [...byVendor.values()].sort((a, b) => b.itcAtRisk - a.itcAtRisk);

  if (booksIn.some((i) => !i.gstin)) notes.push("Books invoices with no supplier GSTIN cannot appear on GSTR-2B and are left out of the follow-up list.");
  if (opts.period) notes.push(`Compared for ${opts.period}. A supplier who files late appears on a later month's GSTR-2B, so follow up before treating an invoice as lost.`);

  return {
    period: opts.period ?? null,
    matched,
    mismatched,
    missingInPortal,
    missingInBooks,
    itcBlocked,
    vendors,
    totals: {
      books: totals(booksIn),
      portal: totals(portalIn),
      matchedTax: round2(matched.reduce((a, p) => a + tax(p.portal), 0)),
      itcAtRisk: round2(vendors.reduce((a, v) => a + v.itcAtRisk, 0)),
      unbookedItc: round2(missingInBooks.filter((i) => i.itc !== "N").reduce((a, i) => a + tax(i), 0)),
      mismatchTaxDiff: round2(mismatched.reduce((a, p) => a + (tax(p.books) - tax(p.portal)), 0)),
    },
    notes,
  };
}

/** The message a CA sends a supplier whose invoices are missing from GSTR-2B. Plain, with the numbers, nothing invented. */
export function vendorMessage(v: VendorFollowUp, period: string | null, firm: string): string {
  const lines = v.missing.slice(0, 15).map((i) => `• ${i.no || "(no number)"}${i.date ? ` dated ${i.date}` : ""}, taxable ₹${i.taxable.toLocaleString("en-IN")}, tax ₹${round2(tax(i)).toLocaleString("en-IN")}`);
  const more = v.missing.length > 15 ? `\n…and ${v.missing.length - 15} more.` : "";
  return `Hello ${v.party || "team"}, we are reconciling GSTR-2B${period ? ` for ${period}` : ""}. These invoices from you are in our books but do not appear in our GSTR-2B:\n${lines.join("\n")}${more}\n\nPlease check that they have been reported in your GSTR-1 (or the IFF) and let us know when they are filed, so we can claim the input tax credit of ₹${v.itcAtRisk.toLocaleString("en-IN")}.\n\nThank you,\n${firm}`;
}
