/**
 * Pure aggregation helpers for the monthly MIS report.
 * Kept server-side and free of Supabase calls so the maths can be reasoned
 * about (and tested) on its own.
 */

export interface MisExtraction {
  classification: string | null;
  confidence: number | null;
  extracted: Record<string, unknown> | null;
  corrected: Record<string, unknown> | null;
}

export interface MisItcRow {
  total_itc: number | null;
  match_status: string | null;
}

export interface MisComplianceRow {
  status: string | null;
  event_type: string | null;
  due_date: string | null;
  filing_period: string | null;
}

export interface MisExceptionRow {
  status: string | null;
  amount: number | null;
}

const num = (v: unknown): number => {
  if (v === null || v === undefined) return 0;
  const n = Number(String(v).replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const field = (row: MisExtraction, ...keys: string[]): unknown => {
  const src = { ...(row.extracted ?? {}), ...(row.corrected ?? {}) } as Record<string, unknown>;
  for (const k of keys) if (src[k] !== undefined && src[k] !== null) return src[k];
  return null;
};

const REVENUE_KINDS = ["sales_invoice", "sales", "invoice_out", "revenue"];
const EXPENSE_KINDS = ["purchase_invoice", "purchase", "expense", "bill", "invoice_in"];

/** True when the document's period field matches the requested period label. */
export function inPeriod(row: MisExtraction, period: string): boolean {
  const raw = String(field(row, "period", "filing_period", "invoice_date", "date") ?? "");
  if (!raw) return false;
  const p = period.toLowerCase();
  if (raw.toLowerCase().includes(p)) return true;
  // period may be "Apr 2026" while the doc carries an ISO date
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return false;
  const label = `${d.toLocaleString("en-IN", { month: "short" })} ${d.getFullYear()}`.toLowerCase();
  return label === p;
}

/** True when the document's own date falls inside [start, end] (YYYY-MM-DD). */
export function inRange(row: MisExtraction, start: string, end: string): boolean {
  const raw = String(field(row, "invoice_date", "date", "period", "filing_period") ?? "");
  if (!raw) return false;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw >= start && raw <= end;
  const iso = d.toISOString().slice(0, 10);
  return iso >= start && iso <= end;
}

/** Month labels ("Apr 2026") covered by a date range, for period-labelled tables. */
export function monthsInRange(start: string, end: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${start.slice(0, 7)}-01T00:00:00Z`);
  const last = new Date(`${end.slice(0, 7)}-01T00:00:00Z`);
  while (cursor <= last && out.length < 24) {
    out.push(`${cursor.toLocaleString("en-IN", { month: "short", timeZone: "UTC" })} ${cursor.getUTCFullYear()}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}

export function summariseDocuments(rows: MisExtraction[], period: string, range?: { start: string; end: string }) {
  const scoped = range
    ? rows.filter((r) => inRange(r, range.start, range.end))
    : rows.filter((r) => inPeriod(r, period));
  const used = scoped.length ? scoped : [];
  let revenue = 0, expenses = 0, gstCollected = 0, gstPaid = 0;
  let confidenceSum = 0;

  for (const r of used) {
    const kind = String(r.classification ?? "").toLowerCase();
    const taxable = num(field(r, "taxable_value", "amount", "total_amount", "net_amount"));
    const tax = num(field(r, "tax_amount", "gst_amount", "total_tax"))
      || num(field(r, "igst")) + num(field(r, "cgst")) + num(field(r, "sgst"));
    if (REVENUE_KINDS.some((k) => kind.includes(k))) {
      revenue += taxable;
      gstCollected += tax;
    } else if (EXPENSE_KINDS.some((k) => kind.includes(k))) {
      expenses += taxable;
      gstPaid += tax;
    }
    confidenceSum += Number(r.confidence ?? 0);
  }

  const docCount = used.length;
  const avg = docCount ? confidenceSum / docCount : 0;
  return {
    revenue: Math.round(revenue * 100) / 100,
    expenses: Math.round(expenses * 100) / 100,
    gross_profit: Math.round((revenue - expenses) * 100) / 100,
    gst_collected: Math.round(gstCollected * 100) / 100,
    gst_paid: Math.round(gstPaid * 100) / 100,
    doc_count: docCount,
    confidence_avg: Math.round((avg <= 1 ? avg * 100 : avg) * 10) / 10,
  };
}

export function summariseItc(rows: MisItcRow[]) {
  const total = rows.reduce((s, r) => s + num(r.total_itc), 0);
  const claimed = rows
    .filter((r) => String(r.match_status).toLowerCase() === "matched")
    .reduce((s, r) => s + num(r.total_itc), 0);
  return {
    itc_available: Math.round(total * 100) / 100,
    itc_claimed: Math.round(claimed * 100) / 100,
    itc_balance: Math.round((total - claimed) * 100) / 100,
  };
}

export function summariseCompliance(rows: MisComplianceRow[]) {
  const now = Date.now();
  const isOverdue = (r: MisComplianceRow) =>
    String(r.status) !== "filed" && !!r.due_date && new Date(r.due_date).getTime() < now;
  return {
    filed: rows.filter((r) => String(r.status) === "filed").length,
    pending: rows.filter((r) => String(r.status) !== "filed" && !isOverdue(r)).length,
    overdue: rows.filter((r) => String(r.status) === "overdue" || isOverdue(r)).length,
    items: rows.map((r) => ({
      event_type: r.event_type,
      filing_period: r.filing_period,
      due_date: r.due_date,
      status: isOverdue(r) ? "overdue" : r.status,
    })),
  };
}

export function summariseExceptions(rows: MisExceptionRow[]) {
  const open = rows.filter((r) => !["resolved", "closed"].includes(String(r.status).toLowerCase()));
  return {
    open_count: open.length,
    amount_at_risk: Math.round(open.reduce((s, r) => s + num(r.amount), 0) * 100) / 100,
  };
}
