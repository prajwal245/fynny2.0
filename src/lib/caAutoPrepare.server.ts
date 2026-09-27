/**
 * Server-only aggregation logic for auto-preparing a return from posted
 * document extractions. Every figure is derived from real extracted data.
 */
export const RETURN_TYPES = ["GSTR1", "GSTR3B", "TDS_26Q", "ITR"] as const;
export type CAReturnType = (typeof RETURN_TYPES)[number];

/** Classifications that feed each return type. */
const SOURCE_CLASSES: Record<CAReturnType, string[]> = {
  GSTR1: ["invoice", "sales_invoice"],
  GSTR3B: ["invoice", "sales_invoice", "expense", "purchase_invoice", "bill"],
  TDS_26Q: ["salary", "salary_register", "tds_challan", "payroll"],
  ITR: ["invoice", "sales_invoice", "expense", "purchase_invoice", "bill", "bank_statement"],
};

const OUTWARD = ["invoice", "sales_invoice"];

export const num = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v.replace(/[^0-9.-]/g, "")) : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const pick = (o: Record<string, unknown>, keys: string[]): unknown => {
  for (const k of keys) if (o?.[k] !== undefined && o?.[k] !== null) return o[k];
  return undefined;
};

/** True when the extraction's own date/period fields fall inside `period`. */
export function matchesPeriod(data: Record<string, unknown>, period: string): boolean {
  const explicit = pick(data, ["period", "filing_period", "tax_period"]);
  if (typeof explicit === "string" && explicit.trim().toUpperCase() === period.trim().toUpperCase()) return true;

  const raw = pick(data, ["invoice_date", "date", "document_date", "bill_date", "payment_date"]);
  if (typeof raw !== "string" && typeof raw !== "number") return false;
  const d = new Date(raw as string);
  if (Number.isNaN(d.getTime())) return false;

  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const mm = String(m).padStart(2, "0");
  const p = period.trim().toUpperCase();

  if (p === `${y}-${mm}` || p === `${mm}${y}` || p === `${mm}-${y}`) return true;
  const monName = d.toLocaleString("en-US", { month: "short" }).toUpperCase();
  if (p === `${monName} ${y}` || p === `${monName}-${y}`) return true;

  const qMatch = p.match(/^Q([1-4]).*?(\d{4})/);
  if (qMatch) {
    const q = Number(qMatch[1]);
    const fyStart = Number(qMatch[2]);
    const startMonth = 4 + (q - 1) * 3;
    const months = [0, 1, 2].map((i) => {
      const mo = startMonth + i;
      return mo > 12 ? { y: fyStart + 1, m: mo - 12 } : { y: fyStart, m: mo };
    });
    if (months.some((x) => x.y === y && x.m === m)) return true;
  }

  // Financial-year style periods, e.g. "FY2026-27"
  const fyMatch = p.match(/^FY\s?(\d{4})/);
  if (fyMatch) {
    const fyStart = Number(fyMatch[1]);
    const inFy = (y === fyStart && m >= 4) || (y === fyStart + 1 && m <= 3);
    if (inFy) return true;
  }
  return false;
}

export interface ExtractionRow {
  id: string;
  classification: string | null;
  confidence: number | null;
  original_filename: string | null;
  extracted: unknown;
  corrected: unknown;
}

export interface PreparedReturn {
  lineItems: Record<string, unknown>[];
  totals: Record<string, number>;
  warnings: string[];
  docCount: number;
}

export function prepareReturn(
  rowsIn: ExtractionRow[],
  returnType: CAReturnType,
  period: string,
): PreparedReturn {
  const wanted = SOURCE_CLASSES[returnType];
  const warnings: string[] = [];

  const rows = rowsIn
    .map((e) => ({
      id: e.id,
      classification: String(e.classification ?? "").toLowerCase(),
      confidence: num(e.confidence),
      filename: e.original_filename,
      data: ((e.corrected ?? e.extracted) ?? {}) as Record<string, unknown>,
    }))
    .filter((e) => wanted.includes(e.classification))
    .filter((e) => matchesPeriod(e.data, period));

  let taxableValue = 0;
  let totalTax = 0;
  let totalItc = 0;
  let tdsDeducted = 0;

  const lineItems = rows.map((r) => {
    const d = r.data;
    const taxable = num(pick(d, ["taxable_value", "taxable_amount", "subtotal", "amount_before_tax", "net_amount"]));
    const igst = num(pick(d, ["igst", "igst_amount"]));
    const cgst = num(pick(d, ["cgst", "cgst_amount"]));
    const sgst = num(pick(d, ["sgst", "sgst_amount"]));
    const tax = igst + cgst + sgst || num(pick(d, ["tax_amount", "gst_amount", "total_tax"]));
    const total = num(pick(d, ["total", "total_amount", "grand_total", "amount"]));
    const tds = num(pick(d, ["tds", "tds_amount", "tds_deducted", "challan_amount"]));
    const isOutward = OUTWARD.includes(r.classification);
    const base = taxable || Math.max(total - tax, 0);

    if (!taxable && !total) warnings.push(`No amount could be read from ${r.filename ?? r.id}`);
    if (r.confidence && r.confidence > 0 && r.confidence < 0.6) {
      warnings.push(`Low extraction confidence on ${r.filename ?? r.id}`);
    }

    if (returnType === "TDS_26Q") {
      tdsDeducted += tds;
      taxableValue += base || total;
      if (!tds) warnings.push(`No TDS amount on ${r.filename ?? r.id}`);
    } else {
      taxableValue += isOutward || returnType !== "GSTR3B" ? base : 0;
      if (isOutward) totalTax += tax;
      else totalItc += tax;
    }

    return {
      extraction_id: r.id,
      classification: r.classification,
      document: r.filename,
      party: pick(d, ["party_name", "vendor_name", "customer_name", "employee_name", "deductee"]) ?? null,
      gstin: pick(d, ["gstin", "party_gstin", "vendor_gstin"]) ?? null,
      document_no: pick(d, ["invoice_no", "invoice_number", "document_no", "challan_no"]) ?? null,
      date: pick(d, ["invoice_date", "date", "document_date", "payment_date"]) ?? null,
      taxable_value: base,
      igst,
      cgst,
      sgst,
      tax_amount: tax,
      tds_amount: tds,
      total,
      direction: isOutward ? "outward" : "inward",
    } as Record<string, unknown>;
  });

  const r2 = (n: number) => Math.round(n * 100) / 100;

  const totals: Record<string, number> =
    returnType === "TDS_26Q"
      ? {
          total_payments: r2(taxableValue),
          total_tds_deducted: r2(tdsDeducted),
          net_payable: r2(tdsDeducted),
        }
      : {
          total_taxable_value: r2(taxableValue),
          total_tax: r2(totalTax),
          total_itc: r2(totalItc),
          net_tax_payable: r2(Math.max(totalTax - totalItc, 0)),
        };

  return { lineItems, totals, warnings: [...new Set(warnings)].slice(0, 25), docCount: rows.length };
}
