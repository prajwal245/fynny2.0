/**
 * Pure GST computation helpers.
 *
 * No Supabase, no React — every function here takes plain rows and returns
 * numbers, so the maths behind ITC estimates and GSTR-2B matching is testable
 * and reviewable in one place.
 */

export const GST_STANDARD_RATE = 0.18;

/** Categories that carry no recoverable input credit for a typical SME. */
const ZERO_RATED_PATTERNS: RegExp[] = [
  /salary|payroll|wages|stipend|bonus|pf\b|esic/i,
  /rent|lease/i,
  /interest|bank charge|penalty|fine|tax paid|tds|gst paid/i,
];

const RATE_PATTERNS: { test: RegExp; rate: number }[] = [
  { test: /software|saas|subscription|consult|professional|legal|audit|marketing|advertis/i, rate: 0.18 },
  { test: /telecom|internet|broadband|mobile|electricity bill|insurance/i, rate: 0.18 },
  { test: /transport|freight|courier|logistics/i, rate: 0.05 },
  { test: /hotel|accommodation|travel|air ticket/i, rate: 0.05 },
  { test: /restaurant|food|catering|canteen/i, rate: 0.05 },
];

export interface ExpenseLike {
  category?: string | null;
  subcategory?: string | null;
  amount?: number | string | null;
  tax_amount?: number | string | null;
  gst_amount?: number | string | null;
  gst_rate?: number | string | null;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Category-aware GST rate for an expense row. Returns a fraction (0.18 = 18%). */
export function gstRateForCategory(category?: string | null, subcategory?: string | null): number {
  const hay = `${category ?? ""} ${subcategory ?? ""}`.trim();
  if (!hay) return GST_STANDARD_RATE;
  if (ZERO_RATED_PATTERNS.some((re) => re.test(hay))) return 0;
  const hit = RATE_PATTERNS.find((r) => r.test.test(hay));
  return hit ? hit.rate : GST_STANDARD_RATE;
}

/**
 * Tax embedded in a GST-inclusive amount at a given rate.
 * `1180 @ 18%` -> `180`.
 */
export function taxFromInclusive(amountInclusive: number, rate: number): number {
  if (!rate || rate <= 0) return 0;
  const amt = num(amountInclusive);
  if (amt <= 0) return 0;
  return round2((amt * rate) / (1 + rate));
}

/** Input credit for a single expense row: explicit tax wins over the estimate. */
export function inputGstForExpense(e: ExpenseLike): number {
  const explicit = num(e.tax_amount ?? e.gst_amount);
  if (explicit > 0) return round2(explicit);
  const rate = e.gst_rate !== undefined && e.gst_rate !== null && Number.isFinite(Number(e.gst_rate))
    ? Number(e.gst_rate)
    : gstRateForCategory(e.category, e.subcategory);
  return taxFromInclusive(num(e.amount), rate);
}

export interface GstSplit {
  cgst: number;
  sgst: number;
  igst: number;
}

/**
 * Split a tax amount into CGST/SGST (intra-state) or IGST (inter-state).
 * Comparison is on the first two GSTIN digits (the state code).
 */
export function splitGst(taxAmount: number, supplierGstin?: string | null, buyerGstin?: string | null): GstSplit {
  const tax = round2(num(taxAmount));
  if (tax <= 0) return { cgst: 0, sgst: 0, igst: 0 };
  const sState = (supplierGstin ?? "").trim().slice(0, 2);
  const bState = (buyerGstin ?? "").trim().slice(0, 2);
  const interState = Boolean(sState) && Boolean(bState) && sState !== bState;
  if (interState) return { cgst: 0, sgst: 0, igst: tax };
  const half = round2(tax / 2);
  // Put any rounding remainder on CGST so the halves always add back to `tax`.
  return { cgst: round2(tax - half), sgst: half, igst: 0 };
}

export interface GstSummary {
  outputGst: number;
  inputGst: number;
  netPayable: number;
  netRefund: number;
}

/** Output tax, estimated input credit and the net position for a period. */
export function computeGstSummary(
  invoices: { tax_amount?: number | string | null }[],
  expenses: ExpenseLike[],
): GstSummary {
  const outputGst = round2(invoices.reduce((s, i) => s + num(i.tax_amount), 0));
  const inputGst = round2(expenses.reduce((s, e) => s + inputGstForExpense(e), 0));
  const net = round2(outputGst - inputGst);
  return {
    outputGst,
    inputGst,
    netPayable: net > 0 ? net : 0,
    netRefund: net < 0 ? round2(-net) : 0,
  };
}

/** GSTR-2B matching tolerance: 1% of the larger value, floor of Rs 1. */
export const ITC_TOLERANCE_PCT = 0.01;

export type ItcMatchStatus = "matched" | "mismatched" | "missing_in_2b" | "missing_in_books";

export function itcTolerance(a: number, b: number): number {
  return Math.max(1, Math.abs(Math.max(Math.abs(num(a)), Math.abs(num(b)))) * ITC_TOLERANCE_PCT);
}

/**
 * Compare a books ITC value against the GSTR-2B value.
 * `null` means the invoice is absent on that side.
 */
export function itcMatchStatus(bookValue: number | null, portalValue: number | null): ItcMatchStatus {
  if (bookValue === null && portalValue === null) return "mismatched";
  if (bookValue === null) return "missing_in_books";
  if (portalValue === null) return "missing_in_2b";
  const diff = Math.abs(num(bookValue) - num(portalValue));
  return diff <= itcTolerance(bookValue, portalValue) ? "matched" : "mismatched";
}
