/**
 * Pure, deterministic builders for the report-type MIS. They take plain rows
 * and return report sections plus data-quality issues; no Supabase calls and no
 * AI so every figure can be reproduced and unit-tested.
 */
import {
  monthLabel,
  monthsBetween,
  toIsoDate,
  type ReportColumn,
  type ReportIssue,
  type ReportRow,
  type ReportSection,
  type ResolvedPeriod,
  type SourceTrace,
} from "./caMisReports";

export interface BuiltReport {
  sections: ReportSection[];
  issues: ReportIssue[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

const num = (v: unknown): number => {
  if (v === null || v === undefined) return 0;
  const n = Number(String(v).replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const inrCol = (key: string, label: string): ReportColumn => ({ key, label, format: "inr" });
const countCol = (key: string, label: string): ReportColumn => ({ key, label, format: "count" });
const pctCol = (key: string, label: string): ReportColumn => ({ key, label, format: "pct" });
const textCol = (key: string, label: string): ReportColumn => ({ key, label, format: "text" });
const dateCol = (key: string, label: string): ReportColumn => ({ key, label, format: "date" });

const cap = (ids: string[], n = 200) => ids.slice(0, n);

const fmtInr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

const todayIso = (now: Date) => now.toISOString().slice(0, 10);

const pctChange = (cur: number | null, prev: number | null): number | null =>
  cur === null || prev === null || prev === 0 ? null : r2(((cur - prev) / Math.abs(prev)) * 100);

// ── Profit & Loss ────────────────────────────────────────────────────────

export interface PnlDoc {
  id: string;
  original_filename: string | null;
  classification: string | null;
  confidence: number | null;
  extracted: Record<string, unknown> | null;
  corrected: Record<string, unknown> | null;
}

const REVENUE_KINDS = ["sales_invoice", "sales", "invoice_out", "revenue"];
const EXPENSE_KINDS = ["purchase_invoice", "purchase", "expense", "bill", "invoice_in"];
const DIRECT_COST_RE = /cogs|cost of (goods|sales)|direct|raw material|purchase of goods|stock/i;

function docField(d: PnlDoc, ...keys: string[]): unknown {
  const src = { ...(d.extracted ?? {}), ...(d.corrected ?? {}) } as Record<string, unknown>;
  for (const k of keys) if (src[k] !== undefined && src[k] !== null && src[k] !== "") return src[k];
  return null;
}

interface MonthAgg {
  revenue: number;
  direct: number;
  other: number;
  revenueIds: string[];
  expenseIds: string[];
  docs: number;
}

export interface PnlInput {
  docs: PnlDoc[];
  /** Extractions in the client that are not yet posted (review pending). */
  pendingReviewCount: number;
  truncated: boolean;
}

export function buildPnl(input: PnlInput, period: ResolvedPeriod, now = new Date()): BuiltReport {
  const issues: ReportIssue[] = [];
  const byMonth = new Map<string, MonthAgg>();
  let undated = 0;
  let lowConfidence = 0;
  let anyCategory = false;

  for (const d of input.docs) {
    const kind = String(d.classification ?? "").toLowerCase();
    const isRev = REVENUE_KINDS.some((k) => kind.includes(k));
    const isExp = !isRev && EXPENSE_KINDS.some((k) => kind.includes(k));
    if (!isRev && !isExp) continue;

    const iso = toIsoDate(docField(d, "invoice_date", "date", "period", "filing_period"));
    if (!iso) {
      undated++;
      continue;
    }
    const mk = iso.slice(0, 7);
    const agg = byMonth.get(mk) ?? { revenue: 0, direct: 0, other: 0, revenueIds: [], expenseIds: [], docs: 0 };
    const amount = num(docField(d, "taxable_value", "amount", "total_amount", "net_amount"));
    agg.docs++;
    const conf = Number(d.confidence ?? 0);
    if ((conf <= 1 ? conf * 100 : conf) < 70) lowConfidence++;

    if (isRev) {
      agg.revenue += amount;
      agg.revenueIds.push(d.id);
    } else {
      const cat = docField(d, "expense_category", "category", "account_head");
      if (cat !== null) anyCategory = true;
      if (cat !== null && DIRECT_COST_RE.test(String(cat))) agg.direct += amount;
      else agg.other += amount;
      agg.expenseIds.push(d.id);
    }
    byMonth.set(mk, agg);
  }

  const cur = byMonth.get(period.month);
  if (!cur) {
    issues.push({
      level: "error",
      code: "pnl_no_data",
      message: `No posted sales or purchase documents are dated in ${period.label}. Upload and post documents for this month before generating the P&L.`,
    });
  }
  if (input.truncated) {
    issues.push({ level: "warning", code: "pnl_truncated", message: "More than 5,000 posted documents exist; only the first 5,000 were read. Totals may be understated." });
  }
  if (period.end > todayIso(now)) {
    issues.push({ level: "warning", code: "period_incomplete", message: `${period.label} is not over yet; figures cover only documents posted so far.` });
  }
  if (undated > 0) {
    issues.push({ level: "warning", code: "pnl_undated", message: `${undated} posted document(s) have no readable date and are excluded from every month.` });
  }
  if (lowConfidence > 0) {
    issues.push({ level: "warning", code: "pnl_low_confidence", message: `${lowConfidence} document(s) were extracted with confidence below 70%. Verify before sharing.` });
  }
  if (input.pendingReviewCount > 0) {
    issues.push({ level: "warning", code: "pnl_pending_review", message: `${input.pendingReviewCount} extracted document(s) are awaiting review and are not included.` });
  }
  if (cur && cur.revenue === 0 && cur.other + cur.direct > 0) {
    issues.push({ level: "warning", code: "pnl_no_revenue", message: `No revenue documents are posted for ${period.label}; the profit shown is a loss driven by expenses alone.` });
  }
  if (cur && !anyCategory) {
    issues.push({ level: "info", code: "pnl_no_gross", message: "Expense documents carry no direct-cost classification, so gross profit is not reported. Net profit is before income tax and depreciation." });
  }

  const cmp = period.comparison ? byMonth.get(period.comparison.month) : null;
  if (period.comparison && !cmp) {
    issues.push({ level: "warning", code: "pnl_no_comparison", message: `No posted documents are dated in the comparison period (${period.comparison.label}); comparison figures are left blank rather than shown as zero.` });
  }

  const figs = (a: MonthAgg | null | undefined) => {
    if (!a) return null;
    const expenses = a.direct + a.other;
    return {
      revenue: r2(a.revenue),
      direct: r2(a.direct),
      other: r2(a.other),
      expenses: r2(expenses),
      gross: anyCategory ? r2(a.revenue - a.direct) : null,
      net: r2(a.revenue - expenses),
    };
  };
  const c = figs(cur);
  const p = figs(cmp);

  const showCmp = !!period.comparison;
  const columns: ReportColumn[] = [inrCol("cur", period.label)];
  if (showCmp) columns.push(inrCol("prev", period.comparison!.label), inrCol("chg", "Change"), pctCol("pct", "Change %"));

  const line = (label: string, key: keyof NonNullable<typeof c>, emphasis?: ReportRow["emphasis"], trace?: SourceTrace): ReportRow => {
    const a = c ? (c[key] as number | null) : null;
    const b = p ? (p[key] as number | null) : null;
    const cells: ReportRow["cells"] = { cur: a };
    if (showCmp) {
      cells.prev = b;
      cells.chg = a !== null && b !== null ? r2(a - b) : null;
      cells.pct = pctChange(a, b);
    }
    return { label, cells, emphasis, trace };
  };

  const rows: ReportRow[] = [
    line("Revenue (excl. GST)", "revenue", undefined, cur ? { table: "ca_document_extractions", ids: cap(cur.revenueIds), note: `${cur.revenueIds.length} sales document(s)` } : undefined),
  ];
  if (anyCategory) {
    rows.push(line("Direct costs", "direct"));
    rows.push(line("Gross profit", "gross", "subtotal"));
    rows.push(line("Operating & other expenses", "other", undefined, cur ? { table: "ca_document_extractions", ids: cap(cur.expenseIds), note: `${cur.expenseIds.length} purchase / expense document(s)` } : undefined));
  } else {
    rows.push(line("Total expenses (excl. GST)", "expenses", undefined, cur ? { table: "ca_document_extractions", ids: cap(cur.expenseIds), note: `${cur.expenseIds.length} purchase / expense document(s)` } : undefined));
  }
  rows.push(line("Net profit before tax", "net", "total"));

  const sections: ReportSection[] = [
    { id: "pnl", title: "Profit & loss", columns, rows, note: "Derived from reviewed (posted) sales and purchase documents. GST is excluded." },
  ];

  // Month-by-month trend across the financial year up to the selected month.
  const fyMonths = monthsBetween(period.fyStartMonth, period.month);
  const trend: ReportRow[] = [];
  let prevNet: number | null = null;
  for (const mk of fyMonths) {
    const a = byMonth.get(mk);
    if (!a) {
      trend.push({ label: monthLabel(mk), cells: { revenue: null, expenses: null, net: null, margin: null, mom: null }, emphasis: "muted" });
      prevNet = null;
      continue;
    }
    const exp = r2(a.direct + a.other);
    const net = r2(a.revenue - exp);
    trend.push({
      label: monthLabel(mk),
      cells: {
        revenue: r2(a.revenue),
        expenses: exp,
        net,
        margin: a.revenue ? r2((net / a.revenue) * 100) : null,
        mom: pctChange(net, prevNet),
      },
    });
    prevNet = net;
  }
  sections.push({
    id: "pnl_trend",
    title: `Monthly trend — FY ${period.fy}`,
    columns: [inrCol("revenue", "Revenue"), inrCol("expenses", "Expenses"), inrCol("net", "Net profit"), pctCol("margin", "Margin %"), pctCol("mom", "Net profit MoM %")],
    rows: trend,
    note: "Months with no posted documents are shown blank, not as zero.",
  });

  return { sections, issues };
}

// ── Balance Sheet ────────────────────────────────────────────────────────

export interface BalanceSnapshot {
  id: string;
  snapshot_date: string;
  cash: number;
  accounts_receivable: number;
  inventory: number;
  fixed_assets: number;
  other_assets: number;
  total_assets: number;
  accounts_payable: number;
  accrued: number;
  short_term_debt: number;
  long_term_debt: number;
  total_liabilities: number;
  total_equity: number;
}

export function buildBalanceSheet(
  snap: BalanceSnapshot | null,
  prev: BalanceSnapshot | null,
  period: ResolvedPeriod,
  now = new Date(),
): BuiltReport {
  const issues: ReportIssue[] = [];
  if (!snap) {
    issues.push({ level: "error", code: "bs_no_snapshot", message: `No balance sheet snapshot exists on or before ${period.end}. Record a balance sheet snapshot before generating this report.` });
    return { sections: [], issues };
  }

  const compAssets = (s: BalanceSnapshot) => r2(num(s.cash) + num(s.accounts_receivable) + num(s.inventory) + num(s.fixed_assets) + num(s.other_assets));
  const compLiab = (s: BalanceSnapshot) => r2(num(s.accounts_payable) + num(s.accrued) + num(s.short_term_debt) + num(s.long_term_debt));

  const check = (s: BalanceSnapshot, tag: string) => {
    const ca = compAssets(s);
    const cl = compLiab(s);
    if (Math.abs(ca - num(s.total_assets)) > 1) {
      issues.push({ level: "warning", code: "bs_assets_mismatch", message: `${tag}: asset lines add up to ${fmtInr(ca)} but the snapshot's stated total assets is ${fmtInr(num(s.total_assets))}.` });
    }
    if (Math.abs(cl - num(s.total_liabilities)) > 1) {
      issues.push({ level: "warning", code: "bs_liab_mismatch", message: `${tag}: liability lines add up to ${fmtInr(cl)} but the stated total liabilities is ${fmtInr(num(s.total_liabilities))}.` });
    }
    const gap = r2(num(s.total_assets) - num(s.total_liabilities) - num(s.total_equity));
    if (Math.abs(gap) > 1) {
      issues.push({ level: "warning", code: "bs_unbalanced", message: `${tag}: the balance sheet does not balance. Assets less liabilities and capital differ by ${fmtInr(gap)}. Treat as an unresolved discrepancy.` });
    }
  };
  check(snap, `Snapshot ${snap.snapshot_date}`);
  if (prev) check(prev, `Comparison snapshot ${prev.snapshot_date}`);

  const ageDays = Math.floor((Date.parse(`${period.end}T00:00:00Z`) - Date.parse(`${snap.snapshot_date}T00:00:00Z`)) / 86_400_000);
  if (ageDays > 35) {
    issues.push({ level: "warning", code: "bs_stale", message: `The latest snapshot is dated ${snap.snapshot_date}, ${ageDays} days before ${period.end}. Balances may not reflect the period end.` });
  }
  if (period.end > todayIso(now)) {
    issues.push({ level: "warning", code: "period_incomplete", message: `${period.label} is not over yet; balances are as at the latest snapshot.` });
  }
  if (period.comparison && !prev) {
    issues.push({ level: "warning", code: "bs_no_comparison", message: `No snapshot exists on or before ${period.comparison.end}; comparison column is blank.` });
  }
  const allZero = [snap.total_assets, snap.total_liabilities, snap.total_equity, snap.cash].every((v) => num(v) === 0);
  if (allZero) {
    issues.push({ level: "error", code: "bs_empty", message: "The latest snapshot has no balances recorded (all zero)." });
  }

  const showCmp = !!period.comparison;
  const columns: ReportColumn[] = [inrCol("cur", `As at ${snap.snapshot_date}`)];
  if (showCmp) columns.push(inrCol("prev", prev ? `As at ${prev.snapshot_date}` : period.comparison!.label), inrCol("chg", "Change"));

  const trace: SourceTrace = { table: "balance_sheet_snapshots", ids: [snap.id], note: `Snapshot ${snap.snapshot_date}` };
  const rowOf = (label: string, get: (s: BalanceSnapshot) => number, emphasis?: ReportRow["emphasis"]): ReportRow => {
    const a = get(snap);
    const b = prev ? get(prev) : null;
    const cells: ReportRow["cells"] = { cur: r2(a) };
    if (showCmp) {
      cells.prev = b === null ? null : r2(b);
      cells.chg = b === null ? null : r2(a - b);
    }
    return { label, cells, emphasis, trace };
  };

  const sections: ReportSection[] = [
    {
      id: "bs_assets",
      title: "Assets",
      columns,
      rows: [
        rowOf("Cash & bank", (s) => num(s.cash)),
        rowOf("Accounts receivable", (s) => num(s.accounts_receivable)),
        rowOf("Inventory", (s) => num(s.inventory)),
        rowOf("Fixed assets", (s) => num(s.fixed_assets)),
        rowOf("Other assets", (s) => num(s.other_assets)),
        rowOf("Total assets", (s) => num(s.total_assets), "total"),
      ],
    },
    {
      id: "bs_liabilities",
      title: "Liabilities",
      columns,
      rows: [
        rowOf("Accounts payable", (s) => num(s.accounts_payable)),
        rowOf("Accrued expenses", (s) => num(s.accrued)),
        rowOf("Short-term debt", (s) => num(s.short_term_debt)),
        rowOf("Long-term debt", (s) => num(s.long_term_debt)),
        rowOf("Total liabilities", (s) => num(s.total_liabilities), "total"),
      ],
    },
    {
      id: "bs_capital",
      title: "Capital & balance check",
      columns,
      rows: [
        rowOf("Total capital / equity", (s) => num(s.total_equity), "total"),
        rowOf("Difference: assets − (liabilities + capital)", (s) => num(s.total_assets) - num(s.total_liabilities) - num(s.total_equity), "muted"),
      ],
      note: "A non-zero difference means the snapshot is internally inconsistent and must be corrected before sharing.",
    },
  ];
  return { sections, issues };
}

// ── Cash & Bank Position ─────────────────────────────────────────────────

export interface BankTxn {
  id: string;
  date: string;
  description: string | null;
  category: string | null;
  amount: number;
  balance: number;
  type: string;
  reconciled?: boolean;
  source_reference?: string | null;
}

const signedAmount = (t: Pick<BankTxn, "amount" | "type">): number => {
  const a = num(t.amount);
  const ty = String(t.type ?? "").toLowerCase();
  if (ty === "debit") return -Math.abs(a);
  if (ty === "credit") return Math.abs(a);
  return a;
};

export interface CashSummary {
  opening: number | null;
  receipts: number;
  payments: number;
  net: number;
  closing: number | null;
  count: number;
  hasBalances: boolean;
}

/** `txns` must be sorted oldest → newest; `prior` is the last transaction before the period. */
export function summariseCash(txns: BankTxn[], prior: BankTxn | null): CashSummary {
  let receipts = 0;
  let payments = 0;
  for (const t of txns) {
    const s = signedAmount(t);
    if (s >= 0) receipts += s;
    else payments += -s;
  }
  const hasBalances = txns.some((t) => num(t.balance) !== 0);
  let opening: number | null = null;
  let closing: number | null = null;
  if (hasBalances && txns.length) {
    closing = num(txns[txns.length - 1].balance);
    opening = prior && num(prior.balance) !== 0 ? num(prior.balance) : num(txns[0].balance) - signedAmount(txns[0]);
  }
  return {
    opening: opening === null ? null : r2(opening),
    receipts: r2(receipts),
    payments: r2(payments),
    net: r2(receipts - payments),
    closing: closing === null ? null : r2(closing),
    count: txns.length,
    hasBalances,
  };
}

export interface LinkedAccount {
  id: string;
  masked_account_number: string | null;
  fip_name: string | null;
  account_type: string | null;
}

export interface CashInput {
  txns: BankTxn[];
  prior: BankTxn | null;
  cmpTxns: BankTxn[] | null;
  cmpPrior: BankTxn | null;
  accounts: LinkedAccount[];
  snapshotCash: { value: number; date: string } | null;
  truncated: boolean;
}

export function buildCashBank(input: CashInput, period: ResolvedPeriod, now = new Date()): BuiltReport {
  const issues: ReportIssue[] = [];
  const cur = summariseCash(input.txns, input.prior);

  if (!cur.count) {
    issues.push({ level: "error", code: "cash_no_txns", message: `No bank transactions are recorded in ${period.label}. Sync or upload a bank statement before generating this report.` });
    return { sections: [], issues };
  }
  if (input.truncated) {
    issues.push({ level: "warning", code: "cash_truncated", message: "More than 5,000 transactions fall in this period; only the first 5,000 were read." });
  }
  if (!cur.hasBalances) {
    issues.push({ level: "warning", code: "cash_no_balances", message: "The imported transactions carry no running balance, so opening and closing balances cannot be stated. Movements are still shown." });
  } else {
    const expected = r2((cur.opening ?? 0) + cur.net);
    if (Math.abs(expected - (cur.closing ?? 0)) > 1) {
      issues.push({ level: "warning", code: "cash_roll_forward", message: `Opening balance + net movement (${fmtInr(expected)}) does not equal the closing balance on the statement (${fmtInr(cur.closing ?? 0)}). Transactions may be missing or duplicated.` });
    }
  }
  if (period.end > todayIso(now)) {
    issues.push({ level: "warning", code: "period_incomplete", message: `${period.label} is not over yet; position is as at the latest transaction.` });
  }
  if (!input.accounts.length) {
    issues.push({ level: "info", code: "cash_no_accounts", message: "No linked bank accounts on file. Transactions are reported at client level." });
  } else if (input.accounts.length > 1) {
    issues.push({ level: "info", code: "cash_multi_accounts", message: "Transactions are not tagged to an account, so balances are shown for all linked accounts combined." });
  }

  const prev = period.comparison && input.cmpTxns ? summariseCash(input.cmpTxns, input.cmpPrior) : null;
  if (period.comparison && (!prev || !prev.count)) {
    issues.push({ level: "warning", code: "cash_no_comparison", message: `No bank transactions in the comparison period (${period.comparison.label}); comparison column is blank.` });
  }
  const showCmp = !!period.comparison;
  const columns: ReportColumn[] = [inrCol("cur", period.label)];
  if (showCmp) columns.push(inrCol("prev", period.comparison!.label), inrCol("chg", "Change"));
  const trace: SourceTrace = { table: "bank_transactions", ids: cap(input.txns.map((t) => t.id)), note: `${input.txns.length} transaction(s)` };
  const line = (label: string, key: keyof CashSummary, emphasis?: ReportRow["emphasis"]): ReportRow => {
    const a = cur[key] as number | null;
    const b = prev && prev.count ? (prev[key] as number | null) : null;
    const cells: ReportRow["cells"] = { cur: a };
    if (showCmp) {
      cells.prev = b;
      cells.chg = a !== null && b !== null ? r2(a - b) : null;
    }
    return { label, cells, emphasis, trace };
  };

  const sections: ReportSection[] = [
    {
      id: "cash_position",
      title: "Bank position",
      columns,
      rows: [
        line("Opening balance", "opening"),
        line("Receipts", "receipts"),
        line("Payments", "payments"),
        line("Net cash movement", "net", "subtotal"),
        line("Closing balance (per statement)", "closing", "total"),
        { label: "Transactions", cells: { cur: cur.count, ...(showCmp ? { prev: prev?.count ?? null, chg: prev ? cur.count - prev.count : null } : {}) }, emphasis: "muted" },
      ],
    },
  ];

  if (input.snapshotCash) {
    const diff = cur.closing === null ? null : r2(cur.closing - input.snapshotCash.value);
    sections.push({
      id: "cash_crosscheck",
      title: "Cross-check with balance sheet",
      columns: [inrCol("cur", "Amount")],
      rows: [
        { label: `Cash per balance sheet snapshot (${input.snapshotCash.date})`, cells: { cur: input.snapshotCash.value } },
        { label: "Closing balance per bank statement", cells: { cur: cur.closing } },
        { label: "Difference", cells: { cur: diff }, emphasis: "total" },
      ],
    });
    if (diff !== null && Math.abs(diff) > 1) {
      issues.push({ level: "warning", code: "cash_vs_bs", message: `Bank closing balance differs from the balance sheet snapshot cash by ${fmtInr(diff)}.` });
    }
  }

  const cats = new Map<string, { receipts: number; payments: number; ids: string[] }>();
  for (const t of input.txns) {
    const key = (t.category ?? "").trim() || "Uncategorised";
    const g = cats.get(key) ?? { receipts: 0, payments: 0, ids: [] };
    const s = signedAmount(t);
    if (s >= 0) g.receipts += s;
    else g.payments += -s;
    g.ids.push(t.id);
    cats.set(key, g);
  }
  const catRows = [...cats.entries()]
    .map(([label, g]) => ({ label, g, net: g.receipts - g.payments }))
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
    .slice(0, 15)
    .map<ReportRow>(({ label, g, net }) => ({
      label,
      cells: { receipts: r2(g.receipts), payments: r2(g.payments), net: r2(net) },
      trace: { table: "bank_transactions", ids: cap(g.ids), note: `${g.ids.length} transaction(s)` },
    }));
  sections.push({
    id: "cash_movement",
    title: "Cash movement by category",
    columns: [inrCol("receipts", "Receipts"), inrCol("payments", "Payments"), inrCol("net", "Net")],
    rows: catRows,
    note: cats.size > 15 ? `Top 15 of ${cats.size} categories by net movement.` : undefined,
  });

  if (input.accounts.length) {
    sections.push({
      id: "cash_accounts",
      title: "Linked bank accounts",
      columns: [textCol("bank", "Bank"), textCol("type", "Type")],
      rows: input.accounts.map((a) => ({
        label: a.masked_account_number ?? "Account",
        cells: { bank: a.fip_name ?? "—", type: a.account_type ?? "—" },
        trace: { table: "ca_bank_accounts_linked", ids: [a.id] },
      })),
    });
  }
  return { sections, issues };
}

// ── Receivables / Payables aging ─────────────────────────────────────────

export interface AgingRow {
  id: string;
  party: string | null;
  ref: string | null;
  date: string | null;
  due: string | null;
  amount: number;
  settled: number | null;
  outstanding: number | null;
}

const BUCKETS = [
  { key: "current", label: "Not yet due" },
  { key: "d30", label: "1–30 days" },
  { key: "d60", label: "31–60 days" },
  { key: "d90", label: "61–90 days" },
  { key: "d90p", label: "Over 90 days" },
  { key: "nodue", label: "No due date" },
] as const;
type BucketKey = (typeof BUCKETS)[number]["key"];

function bucketOf(daysPastDue: number | null): BucketKey {
  if (daysPastDue === null) return "nodue";
  if (daysPastDue <= 0) return "current";
  if (daysPastDue <= 30) return "d30";
  if (daysPastDue <= 60) return "d60";
  if (daysPastDue <= 90) return "d90";
  return "d90p";
}

export function buildAging(
  kind: "receivable" | "payable",
  rows: AgingRow[],
  period: ResolvedPeriod,
  now = new Date(),
): BuiltReport {
  const isRec = kind === "receivable";
  const partyWord = isRec ? "Customer" : "Supplier";
  const docWord = isRec ? "invoice" : "bill";
  const issues: ReportIssue[] = [];

  if (!rows.length) {
    issues.push({ level: "error", code: "aging_no_data", message: `No ${isRec ? "receivables" : "payables"} are recorded for this client. Add ${docWord}s to the ${isRec ? "receivables" : "payables"} ledger before generating this report.` });
    return { sections: [], issues };
  }

  const asOf = period.end;
  const asOfMs = Date.parse(`${asOf}T00:00:00Z`);
  const open = rows
    .filter((r) => !r.date || r.date <= asOf)
    .map((r) => ({ ...r, out: r2(r.outstanding ?? num(r.amount) - num(r.settled)) }))
    .filter((r) => r.out > 0.005)
    .map((r) => ({
      ...r,
      days: r.due ? Math.floor((asOfMs - Date.parse(`${r.due}T00:00:00Z`)) / 86_400_000) : null,
    }))
    .map((r) => ({ ...r, bucket: bucketOf(r.days) }));

  if (period.end > todayIso(now)) {
    issues.push({ level: "warning", code: "period_incomplete", message: `${period.label} is not over yet; aging is calculated as at ${asOf}.` });
  } else if (asOf < todayIso(now)) {
    issues.push({ level: "warning", code: "aging_snapshot", message: `The ${isRec ? "receivables" : "payables"} ledger holds current balances only. Settlements recorded after ${asOf} are not reversed, so outstanding amounts may be lower than they were at period end.` });
  }
  const noDue = open.filter((r) => r.bucket === "nodue").length;
  if (noDue) {
    issues.push({ level: "warning", code: "aging_no_due", message: `${noDue} ${docWord}(s) have no due date and are shown separately, not aged.` });
  }
  const unnamed = open.filter((r) => !r.party?.trim()).length;
  if (unnamed) {
    issues.push({ level: "warning", code: "aging_unnamed", message: `${unnamed} ${docWord}(s) have no ${partyWord.toLowerCase()} name and are grouped under "Unknown".` });
  }
  if (!open.length) {
    issues.push({ level: "info", code: "aging_nil", message: `Nothing is outstanding as at ${asOf}.` });
  }

  const total = r2(open.reduce((s, r) => s + r.out, 0));
  const bucketTotals = new Map<BucketKey, { amount: number; count: number; ids: string[] }>();
  for (const b of BUCKETS) bucketTotals.set(b.key, { amount: 0, count: 0, ids: [] });
  for (const r of open) {
    const g = bucketTotals.get(r.bucket)!;
    g.amount += r.out;
    g.count++;
    g.ids.push(r.id);
  }

  const table = isRec ? "receivables" : "payables";
  const sections: ReportSection[] = [
    {
      id: "aging_summary",
      title: `Aging summary — as at ${asOf}`,
      labelHeading: "Bucket (days past due)",
      columns: [inrCol("amount", "Outstanding"), countCol("count", docWord === "bill" ? "Bills" : "Invoices"), pctCol("share", "% of total")],
      rows: [
        ...BUCKETS.filter((b) => bucketTotals.get(b.key)!.count > 0 || b.key !== "nodue").map<ReportRow>((b) => {
          const g = bucketTotals.get(b.key)!;
          return {
            label: b.label,
            cells: { amount: r2(g.amount), count: g.count, share: total ? r2((g.amount / total) * 100) : null },
            trace: g.count ? { table, ids: cap(g.ids), note: `${g.count} ${docWord}(s)` } : undefined,
          };
        }),
        { label: "Total outstanding", cells: { amount: total, count: open.length, share: total ? 100 : null }, emphasis: "total" },
      ],
    },
  ];

  const parties = new Map<string, { b: Record<BucketKey, number>; total: number; ids: string[]; oldestDue: string | null }>();
  for (const r of open) {
    const name = r.party?.trim() || "Unknown";
    const g = parties.get(name) ?? {
      b: { current: 0, d30: 0, d60: 0, d90: 0, d90p: 0, nodue: 0 },
      total: 0, ids: [], oldestDue: null,
    };
    g.b[r.bucket] += r.out;
    g.total += r.out;
    g.ids.push(r.id);
    if (r.due && (!g.oldestDue || r.due < g.oldestDue)) g.oldestDue = r.due;
    parties.set(name, g);
  }
  const partyList = [...parties.entries()].sort((a, b) => b[1].total - a[1].total);
  sections.push({
    id: "aging_parties",
    title: `${partyWord}-wise outstanding`,
    labelHeading: partyWord,
    columns: [
      ...BUCKETS.map((b) => inrCol(b.key, b.label)),
      inrCol("total", "Total"),
      dateCol("oldest", "Oldest due"),
    ],
    rows: partyList.slice(0, 100).map<ReportRow>(([name, g]) => ({
      label: name,
      cells: {
        ...Object.fromEntries(BUCKETS.map((b) => [b.key, r2(g.b[b.key])])),
        total: r2(g.total),
        oldest: g.oldestDue,
      },
      trace: { table, ids: cap(g.ids), note: `${g.ids.length} ${docWord}(s)` },
    })),
    note: partyList.length > 100 ? `Top 100 of ${partyList.length} ${partyWord.toLowerCase()}s by outstanding. The summary above includes all.` : undefined,
  });

  const listed = (isRec ? open.filter((r) => r.days !== null && r.days > 0) : open)
    .sort((a, b) => (isRec ? (b.days ?? 0) - (a.days ?? 0) : (a.due ?? "9999").localeCompare(b.due ?? "9999")));
  sections.push({
    id: "aging_docs",
    title: isRec ? "Overdue invoices" : "Unpaid bills and due dates",
    labelHeading: isRec ? "Invoice" : "Bill",
    columns: [textCol("party", partyWord), dateCol("due", "Due date"), countCol("days", "Days past due"), inrCol("out", "Outstanding")],
    rows: listed.slice(0, 100).map<ReportRow>((r) => ({
      label: r.ref ?? "(no number)",
      cells: { party: r.party?.trim() || "Unknown", due: r.due, days: r.days !== null && r.days > 0 ? r.days : r.days === null ? null : 0, out: r.out },
      trace: { table, ids: [r.id] },
    })),
    note: listed.length > 100 ? `Showing the first 100 of ${listed.length}.` : listed.length === 0 ? (isRec ? "No overdue invoices." : "No unpaid bills.") : undefined,
  });
  return { sections, issues };
}

// ── Bank Reconciliation Summary ──────────────────────────────────────────

export interface ReconRun {
  id: string;
  recon_type: string;
  period: string;
  run_at: string;
  matched: number;
  unmatched: number;
  mismatched: number;
  total_at_risk: number;
}

export interface OpenException {
  id: string;
  reason_code: string;
  severity: string;
  status: string;
  amount: number | null;
  description: string | null;
  created_at: string;
}

export interface BankRecInput {
  txns: BankTxn[];
  runs: ReconRun[];
  exceptions: OpenException[];
  truncated: boolean;
}

export function buildBankRec(input: BankRecInput, period: ResolvedPeriod, now = new Date()): BuiltReport {
  const issues: ReportIssue[] = [];
  if (!input.txns.length) {
    issues.push({ level: "error", code: "rec_no_txns", message: `No bank transactions are recorded in ${period.label}, so there is nothing to reconcile.` });
    return { sections: [], issues };
  }
  if (input.truncated) {
    issues.push({ level: "warning", code: "rec_truncated", message: "More than 5,000 transactions fall in this period; only the first 5,000 were read." });
  }
  if (period.end > todayIso(now)) {
    issues.push({ level: "warning", code: "period_incomplete", message: `${period.label} is not over yet; new transactions may still arrive.` });
  }

  const matched = input.txns.filter((t) => t.reconciled);
  const unmatched = input.txns.filter((t) => !t.reconciled);
  const abs = (t: BankTxn) => Math.abs(num(t.amount));
  const sum = (ts: BankTxn[]) => r2(ts.reduce((s, t) => s + abs(t), 0));
  const totalVal = sum(input.txns);
  const matchedVal = sum(matched);
  const unmatchedVal = sum(unmatched);

  if (unmatched.length) {
    issues.push({ level: "warning", code: "rec_unmatched", message: `${unmatched.length} transaction(s) worth ${fmtInr(unmatchedVal)} are not reconciled.` });
  }
  if (!input.runs.length) {
    issues.push({ level: "warning", code: "rec_no_run", message: `No reconciliation run is logged for ${period.label}. Run a reconciliation to record matched and mismatched counts.` });
  }
  const openExc = input.exceptions;
  const excAmt = r2(openExc.reduce((s, e) => s + num(e.amount), 0));
  if (openExc.length) {
    issues.push({ level: "warning", code: "rec_open_exceptions", message: `${openExc.length} unresolved exception(s) remain open${excAmt ? `, with ${fmtInr(excAmt)} at risk` : ""}.` });
  }

  const sections: ReportSection[] = [
    {
      id: "rec_status",
      title: "Reconciliation status",
      columns: [countCol("count", "Transactions"), inrCol("value", "Value"), pctCol("rate", "% by count")],
      rows: [
        { label: "Total transactions", cells: { count: input.txns.length, value: totalVal, rate: 100 }, trace: { table: "bank_transactions", ids: cap(input.txns.map((t) => t.id)) } },
        { label: "Matched / reconciled", cells: { count: matched.length, value: matchedVal, rate: r2((matched.length / input.txns.length) * 100) }, trace: matched.length ? { table: "bank_transactions", ids: cap(matched.map((t) => t.id)) } : undefined },
        { label: "Unmatched", cells: { count: unmatched.length, value: unmatchedVal, rate: r2((unmatched.length / input.txns.length) * 100) }, emphasis: "total", trace: unmatched.length ? { table: "bank_transactions", ids: cap(unmatched.map((t) => t.id)) } : undefined },
      ],
      note: "Value is the sum of absolute transaction amounts (receipts and payments).",
    },
    {
      id: "rec_unmatched",
      title: "Unmatched entries",
      labelHeading: "Date",
      columns: [textCol("desc", "Description"), textCol("type", "Type"), inrCol("amount", "Amount"), textCol("ref", "Reference")],
      rows: [...unmatched].sort((a, b) => abs(b) - abs(a)).slice(0, 100).map<ReportRow>((t) => ({
        label: t.date,
        cells: { desc: t.description ?? "—", type: String(t.type ?? "—"), amount: r2(abs(t)), ref: t.source_reference ?? "—" },
        trace: { table: "bank_transactions", ids: [t.id] },
      })),
      note: unmatched.length > 100 ? `Largest 100 of ${unmatched.length} unmatched entries.` : unmatched.length === 0 ? "Every transaction in the period is reconciled." : undefined,
    },
  ];

  if (input.runs.length) {
    sections.push({
      id: "rec_runs",
      title: "Reconciliation runs",
      labelHeading: "Run at",
      columns: [textCol("type", "Type"), countCol("matched", "Matched"), countCol("unmatched", "Unmatched"), countCol("mismatched", "Mismatched"), inrCol("risk", "Amount at risk")],
      rows: input.runs.slice(0, 5).map<ReportRow>((r) => ({
        label: r.run_at.slice(0, 16).replace("T", " "),
        cells: { type: r.recon_type, matched: r.matched, unmatched: r.unmatched, mismatched: r.mismatched, risk: r2(num(r.total_at_risk)) },
        trace: { table: "ca_recon_runs", ids: [r.id] },
      })),
    });
  }

  sections.push({
    id: "rec_exceptions",
    title: "Unresolved discrepancies (open exceptions)",
    labelHeading: "Reason",
    columns: [textCol("severity", "Severity"), textCol("status", "Status"), inrCol("amount", "Amount"), dateCol("raised", "Raised")],
    rows: [
      ...openExc.slice(0, 50).map<ReportRow>((e) => ({
        label: e.description ? `${e.reason_code} — ${e.description}`.slice(0, 90) : e.reason_code,
        cells: { severity: e.severity, status: e.status, amount: e.amount === null ? null : r2(num(e.amount)), raised: e.created_at.slice(0, 10) },
        trace: { table: "ca_exceptions", ids: [e.id] },
      })),
      ...(openExc.length ? [{ label: "Total at risk", cells: { severity: "", status: "", amount: excAmt, raised: null }, emphasis: "total" as const }] : []),
    ],
    note: openExc.length ? "Includes exceptions from all sources raised on or before the period end." : "No open exceptions.",
  });
  return { sections, issues };
}
