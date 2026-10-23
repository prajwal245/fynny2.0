/**
 * Shared (client + server safe) types, catalogue and period helpers for the
 * report-type MIS. Calculations live in caMisBuilders.server.ts.
 */

export type MisReportKind =
  | "general_mis"
  | "pnl"
  | "balance_sheet"
  | "cash_bank"
  | "receivables_aging"
  | "payables_aging"
  | "bank_rec"
  | "expense_analysis"
  | "gst_summary"
  | "tds_summary";

export type ComparisonMode = "none" | "prev_month" | "prev_year";

export interface MisCatalogEntry {
  kind: MisReportKind;
  label: string;
  description: string;
  /** "available" reports can be generated; "locked" ones are shown but disabled. */
  status: "available" | "locked";
  lockedReason?: string;
  supportsComparison: boolean;
  /** Data sources the report reads, shown in the configuration panel. */
  sources: string[];
}

export const MIS_CATALOG: MisCatalogEntry[] = [
  {
    kind: "general_mis",
    label: "General MIS",
    description: "The existing monthly MIS pack. Unchanged.",
    status: "available",
    supportsComparison: false,
    sources: [],
  },
  {
    kind: "pnl",
    label: "Profit & Loss",
    description: "Revenue, expenses, gross and net profit with monthly comparison.",
    status: "available",
    supportsComparison: true,
    sources: ["Posted documents (reviewed extractions)"],
  },
  {
    kind: "balance_sheet",
    label: "Balance Sheet",
    description: "Assets, liabilities, capital and closing balances.",
    status: "available",
    supportsComparison: true,
    sources: ["Balance sheet snapshots"],
  },
  {
    kind: "cash_bank",
    label: "Cash & Bank Position",
    description: "Bank balances, receipts, payments and movement by category.",
    status: "available",
    supportsComparison: true,
    sources: ["Bank transactions", "Linked bank accounts", "Balance sheet snapshots"],
  },
  {
    kind: "receivables_aging",
    label: "Receivables Aging",
    description: "Customer-wise outstanding, overdue invoices and aging buckets.",
    status: "available",
    supportsComparison: false,
    sources: ["Receivables ledger"],
  },
  {
    kind: "payables_aging",
    label: "Payables Aging",
    description: "Supplier-wise outstanding, unpaid bills and due dates.",
    status: "available",
    supportsComparison: false,
    sources: ["Payables ledger"],
  },
  {
    kind: "bank_rec",
    label: "Bank Reconciliation Summary",
    description: "Matched and unmatched transactions and unresolved discrepancies.",
    status: "available",
    supportsComparison: false,
    sources: ["Bank transactions", "Reconciliation runs", "Exceptions"],
  },
  {
    kind: "expense_analysis",
    label: "Expense Analysis",
    description: "Category-wise expenses and month-on-month changes.",
    status: "locked",
    lockedReason: "Coming soon",
    supportsComparison: true,
    sources: [],
  },
  {
    kind: "gst_summary",
    label: "GST Summary",
    description: "Sales, GST liability, input tax credit and reconciliation exceptions.",
    status: "locked",
    lockedReason: "Coming soon",
    supportsComparison: false,
    sources: [],
  },
  {
    kind: "tds_summary",
    label: "TDS Summary",
    description: "Deductions, outstanding payments and compliance status.",
    status: "locked",
    lockedReason: "Coming soon",
    supportsComparison: false,
    sources: [],
  },
];

export const TYPED_MIS_KINDS: MisReportKind[] = MIS_CATALOG
  .filter((c) => c.status === "available" && c.kind !== "general_mis")
  .map((c) => c.kind);

export const misLabel = (kind: string): string =>
  MIS_CATALOG.find((c) => c.kind === kind)?.label ?? kind;

// ── Report document model ────────────────────────────────────────────────

export type CellFormat = "inr" | "count" | "pct" | "text" | "date";

export interface ReportColumn {
  key: string;
  label: string;
  format: CellFormat;
}

export interface SourceTrace {
  table: string;
  ids: string[];
  /** Human-readable hint, e.g. the document filename. */
  note?: string;
}

export interface ReportRow {
  label: string;
  cells: Record<string, number | string | null>;
  emphasis?: "total" | "subtotal" | "muted";
  trace?: SourceTrace;
}

export interface ReportSection {
  id: string;
  title: string;
  /** First column (row label) heading. */
  labelHeading?: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  note?: string;
}

export interface ReportIssue {
  /** error blocks generation; warning is shown prominently; info is context. */
  level: "error" | "warning" | "info";
  code: string;
  message: string;
}

export interface ReportSource {
  name: string;
  table: string;
  records: number;
  status: "ok" | "empty" | "error" | "truncated";
  note?: string;
}

export interface TypedMisReport {
  kind: MisReportKind;
  title: string;
  client_name: string;
  period_label: string;
  financial_year: string;
  period_start: string;
  period_end: string;
  comparison_label: string | null;
  generated_at: string;
  sections: ReportSection[];
  issues: ReportIssue[];
  sources: ReportSource[];
  /** Set only when the report was saved (not for previews). */
  report_id: string | null;
}

// ── Period helpers (Indian financial year, Apr–Mar) ──────────────────────

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const pad2 = (n: number) => String(n).padStart(2, "0");

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${pad2((idx % 12) + 1)}`;
}

export function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${pad2(last)}` };
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-IN", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Financial year containing `month`, e.g. 2026-05 → { label: "2026-27", start: "2026-04" }. */
export function financialYearOf(month: string): { label: string; startMonth: string; endMonth: string } {
  const [y, m] = month.split("-").map(Number);
  const startYear = m >= 4 ? y : y - 1;
  return {
    label: `${startYear}-${pad2((startYear + 1) % 100)}`,
    startMonth: `${startYear}-04`,
    endMonth: `${startYear + 1}-03`,
  };
}

export function monthsBetween(fromMonth: string, toMonth: string): string[] {
  const out: string[] = [];
  let cur = fromMonth;
  while (cur <= toMonth && out.length < 36) {
    out.push(cur);
    cur = shiftMonth(cur, 1);
  }
  return out;
}

export interface ResolvedPeriod {
  month: string;
  label: string;
  start: string;
  end: string;
  fy: string;
  fyStartMonth: string;
  comparison: { month: string; label: string; start: string; end: string } | null;
}

export function resolvePeriod(month: string, comparison: ComparisonMode): ResolvedPeriod {
  if (!MONTH_RE.test(month)) throw new Error("Pick a valid reporting month");
  const { start, end } = monthBounds(month);
  const fy = financialYearOf(month);
  let cmp: ResolvedPeriod["comparison"] = null;
  if (comparison !== "none") {
    const cm = shiftMonth(month, comparison === "prev_year" ? -12 : -1);
    const b = monthBounds(cm);
    cmp = { month: cm, label: monthLabel(cm), start: b.start, end: b.end };
  }
  return { month, label: monthLabel(month), start, end, fy: fy.label, fyStartMonth: fy.startMonth, comparison: cmp };
}

/** Parse the date formats found in extracted documents into YYYY-MM-DD, or null. */
export function toIsoDate(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${pad2(Number(m[2]))}-${pad2(Number(m[1]))}`;
  m = s.match(/^(\d{4})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-01`;
  m = s.match(/^([A-Za-z]{3,9})[ -](\d{4})$/);
  if (m) {
    const idx = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
      .indexOf(m[1].slice(0, 3).toLowerCase());
    if (idx >= 0) return `${m[2]}-${pad2(idx + 1)}-01`;
  }
  return null;
}
