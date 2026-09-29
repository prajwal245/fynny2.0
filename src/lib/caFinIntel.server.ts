/**
 * Pure logic for Financial Intelligence OS.
 * No Supabase calls here — the chart-of-accounts template and the data
 * quality engine are deterministic functions over real client rows.
 */

export interface CoaSeed {
  code: string;
  name: string;
  account_type: "asset" | "liability" | "equity" | "income" | "expense";
  is_group: boolean;
  parent_code: string | null;
}

/**
 * Indian SME chart of accounts (Schedule III aligned groups).
 */
export const DEFAULT_COA: CoaSeed[] = [
  { code: "1000", name: "Assets", account_type: "asset", is_group: true, parent_code: null },
  { code: "1100", name: "Current Assets", account_type: "asset", is_group: true, parent_code: "1000" },
  { code: "1110", name: "Cash in Hand", account_type: "asset", is_group: false, parent_code: "1100" },
  { code: "1120", name: "Bank Accounts", account_type: "asset", is_group: false, parent_code: "1100" },
  { code: "1130", name: "Trade Receivables", account_type: "asset", is_group: false, parent_code: "1100" },
  { code: "1140", name: "Input GST Credit (ITC)", account_type: "asset", is_group: false, parent_code: "1100" },
  { code: "1150", name: "TDS Receivable", account_type: "asset", is_group: false, parent_code: "1100" },
  { code: "1160", name: "Advances to Suppliers", account_type: "asset", is_group: false, parent_code: "1100" },
  { code: "1200", name: "Non-Current Assets", account_type: "asset", is_group: true, parent_code: "1000" },
  { code: "1210", name: "Plant & Machinery", account_type: "asset", is_group: false, parent_code: "1200" },
  { code: "1220", name: "Computers & Equipment", account_type: "asset", is_group: false, parent_code: "1200" },
  { code: "1230", name: "Furniture & Fixtures", account_type: "asset", is_group: false, parent_code: "1200" },
  { code: "1240", name: "Accumulated Depreciation", account_type: "asset", is_group: false, parent_code: "1200" },
  { code: "1250", name: "Intangible Assets", account_type: "asset", is_group: false, parent_code: "1200" },

  { code: "2000", name: "Liabilities", account_type: "liability", is_group: true, parent_code: null },
  { code: "2100", name: "Current Liabilities", account_type: "liability", is_group: true, parent_code: "2000" },
  { code: "2110", name: "Trade Payables", account_type: "liability", is_group: false, parent_code: "2100" },
  { code: "2120", name: "Output GST Payable", account_type: "liability", is_group: false, parent_code: "2100" },
  { code: "2130", name: "TDS Payable", account_type: "liability", is_group: false, parent_code: "2100" },
  { code: "2140", name: "Salaries & Wages Payable", account_type: "liability", is_group: false, parent_code: "2100" },
  { code: "2150", name: "PF / ESI Payable", account_type: "liability", is_group: false, parent_code: "2100" },
  { code: "2160", name: "Advance from Customers", account_type: "liability", is_group: false, parent_code: "2100" },
  { code: "2200", name: "Non-Current Liabilities", account_type: "liability", is_group: true, parent_code: "2000" },
  { code: "2210", name: "Term Loans", account_type: "liability", is_group: false, parent_code: "2200" },
  { code: "2220", name: "Unsecured Loans", account_type: "liability", is_group: false, parent_code: "2200" },

  { code: "3000", name: "Equity", account_type: "equity", is_group: true, parent_code: null },
  { code: "3100", name: "Share Capital", account_type: "equity", is_group: false, parent_code: "3000" },
  { code: "3200", name: "Reserves & Surplus", account_type: "equity", is_group: false, parent_code: "3000" },
  { code: "3300", name: "Partner / Proprietor Capital", account_type: "equity", is_group: false, parent_code: "3000" },
  { code: "3400", name: "Drawings", account_type: "equity", is_group: false, parent_code: "3000" },

  { code: "4000", name: "Income", account_type: "income", is_group: true, parent_code: null },
  { code: "4100", name: "Sales — Goods", account_type: "income", is_group: false, parent_code: "4000" },
  { code: "4200", name: "Sales — Services", account_type: "income", is_group: false, parent_code: "4000" },
  { code: "4300", name: "Export Sales", account_type: "income", is_group: false, parent_code: "4000" },
  { code: "4400", name: "Other Income", account_type: "income", is_group: false, parent_code: "4000" },
  { code: "4500", name: "Interest Income", account_type: "income", is_group: false, parent_code: "4000" },

  { code: "5000", name: "Expenses", account_type: "expense", is_group: true, parent_code: null },
  { code: "5100", name: "Purchases", account_type: "expense", is_group: false, parent_code: "5000" },
  { code: "5200", name: "Salaries & Wages", account_type: "expense", is_group: false, parent_code: "5000" },
  { code: "5300", name: "Rent", account_type: "expense", is_group: false, parent_code: "5000" },
  { code: "5400", name: "Professional Fees", account_type: "expense", is_group: false, parent_code: "5000" },
  { code: "5500", name: "Utilities & Telephone", account_type: "expense", is_group: false, parent_code: "5000" },
  { code: "5600", name: "Travel & Conveyance", account_type: "expense", is_group: false, parent_code: "5000" },
  { code: "5700", name: "Marketing & Advertising", account_type: "expense", is_group: false, parent_code: "5000" },
  { code: "5800", name: "Bank Charges & Interest", account_type: "expense", is_group: false, parent_code: "5000" },
  { code: "5900", name: "Depreciation", account_type: "expense", is_group: false, parent_code: "5000" },
  { code: "5950", name: "Miscellaneous Expenses", account_type: "expense", is_group: false, parent_code: "5000" },
];

export interface DqTxn {
  id: string;
  date: string | null;
  description: string | null;
  category: string | null;
  amount: number | null;
  type: string | null;
  source_reference?: string | null;
}

export interface DqIssue {
  issue_type: "missing_field" | "duplicate" | "anomaly" | "stale_period" | "uncategorised";
  severity: "high" | "medium" | "low";
  entity_type: string;
  entity_id: string | null;
  description: string;
  detail: Record<string, unknown>;
}

export interface DqResult {
  total_records: number;
  completeness_score: number;
  duplicate_count: number;
  anomaly_count: number;
  missing_field_count: number;
  summary: Record<string, unknown>;
  issues: DqIssue[];
}

const REQUIRED: (keyof DqTxn)[] = ["date", "description", "amount", "type", "category"];

const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Completeness scoring, duplicate detection and statistical anomaly
 * detection over one client's transactions for one period.
 */
export function computeDataQuality(txns: DqTxn[], period: string): DqResult {
  const issues: DqIssue[] = [];
  const total = txns.length;

  if (total === 0) {
    return {
      total_records: 0,
      completeness_score: 0,
      duplicate_count: 0,
      anomaly_count: 0,
      missing_field_count: 0,
      summary: { period, note: "No transactions found for this period." },
      issues: [
        {
          issue_type: "stale_period",
          severity: "high",
          entity_type: "period",
          entity_id: period,
          description: `No transaction data captured for ${period}. Books are not up to date.`,
          detail: { period },
        },
      ],
    };
  }

  // ---- Completeness ----
  let filled = 0;
  const missingByField: Record<string, number> = {};
  for (const t of txns) {
    const missing: string[] = [];
    for (const f of REQUIRED) {
      const v = t[f];
      const ok = f === "amount" ? Number.isFinite(Number(v)) && Number(v) !== 0 : !!norm(v as string);
      if (ok) filled += 1;
      else {
        missing.push(f as string);
        missingByField[f as string] = (missingByField[f as string] ?? 0) + 1;
      }
    }
    if (missing.length) {
      issues.push({
        issue_type: missing.length === 1 && missing[0] === "category" ? "uncategorised" : "missing_field",
        severity: missing.includes("amount") || missing.includes("date") ? "high" : "low",
        entity_type: "bank_transaction",
        entity_id: t.id,
        description: `Transaction is missing ${missing.join(", ")}.`,
        detail: { missing, date: t.date, description: t.description, amount: t.amount },
      });
    }
  }
  const completeness = Math.round((filled / (total * REQUIRED.length)) * 1000) / 10;

  // ---- Duplicates (same date + amount + normalised description) ----
  const seen = new Map<string, DqTxn>();
  let duplicates = 0;
  for (const t of txns) {
    const key = `${t.date ?? ""}|${Number(t.amount ?? 0).toFixed(2)}|${norm(t.description)}`;
    const first = seen.get(key);
    if (first) {
      duplicates += 1;
      issues.push({
        issue_type: "duplicate",
        severity: "high",
        entity_type: "bank_transaction",
        entity_id: t.id,
        description: `Possible duplicate of transaction on ${t.date} for ₹${Number(t.amount ?? 0).toLocaleString("en-IN")}.`,
        detail: { duplicate_of: first.id, date: t.date, amount: t.amount, description: t.description },
      });
    } else {
      seen.set(key, t);
    }
  }

  // ---- Anomalies (per direction, |z| > 3 with a minimum sample) ----
  let anomalies = 0;
  const groups = new Map<string, DqTxn[]>();
  for (const t of txns) {
    const g = norm(t.type) || "unknown";
    groups.set(g, [...(groups.get(g) ?? []), t]);
  }
  for (const [g, rows] of groups) {
    const amounts = rows.map((r) => Math.abs(Number(r.amount ?? 0))).filter((n) => Number.isFinite(n));
    if (amounts.length < 6) continue;
    const mean = amounts.reduce((s, n) => s + n, 0) / amounts.length;
    const variance = amounts.reduce((s, n) => s + (n - mean) ** 2, 0) / amounts.length;
    const sd = Math.sqrt(variance);
    if (sd <= 0) continue;
    for (const r of rows) {
      const amt = Math.abs(Number(r.amount ?? 0));
      const z = (amt - mean) / sd;
      if (z > 3) {
        anomalies += 1;
        issues.push({
          issue_type: "anomaly",
          severity: z > 5 ? "high" : "medium",
          entity_type: "bank_transaction",
          entity_id: r.id,
          description: `${g === "credit" ? "Credit" : g === "debit" ? "Debit" : g} of ₹${amt.toLocaleString("en-IN")} is ${z.toFixed(1)}σ above the ${g} average of ₹${Math.round(mean).toLocaleString("en-IN")}.`,
          detail: { z_score: Math.round(z * 100) / 100, mean: Math.round(mean), std_dev: Math.round(sd), amount: amt, date: r.date, description: r.description },
        });
      }
    }
  }

  const missingFieldIssues = issues.filter(
    (i) => i.issue_type === "missing_field" || i.issue_type === "uncategorised",
  ).length;

  return {
    total_records: total,
    completeness_score: completeness,
    duplicate_count: duplicates,
    anomaly_count: anomalies,
    missing_field_count: missingFieldIssues,
    summary: {
      period,
      missing_by_field: missingByField,
      groups: Array.from(groups.keys()),
      issue_count: issues.length,
    },
    issues,
  };
}

export const periodBounds = (period: string): { start: string; end: string } => {
  const [y, m] = period.split("-").map(Number);
  const start = new Date(Date.UTC(y, (m ?? 1) - 1, 1));
  const end = new Date(Date.UTC(y, m ?? 1, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
};
