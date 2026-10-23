import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  monthsInRange,
  summariseCompliance,
  summariseDocuments,
  summariseExceptions,
  summariseItc,
  type MisComplianceRow,
  type MisExceptionRow,
  type MisExtraction,
  type MisItcRow,
} from "./caMis.server";
import {
  buildAging,
  buildBalanceSheet,
  buildBankRec,
  buildCashBank,
  buildPnl,
  type AgingRow,
  type BalanceSnapshot,
  type BankTxn,
  type BuiltReport,
  type LinkedAccount,
  type OpenException,
  type PnlDoc,
  type ReconRun,
} from "./caMisBuilders.server";
import {
  misLabel,
  monthLabel,
  resolvePeriod,
  TYPED_MIS_KINDS,
  MIS_CATALOG,
  type ComparisonMode,
  type MisReportKind,
  type ReportSource,
  type TypedMisReport,
} from "./caMisReports";

export interface GenerateMisInput {
  firm_id: string;
  client_id?: string | null;
  business_id: string;
  period: string;
  report_type?: string;
  /** Optional YYYY-MM-DD bounds. When both are present the MIS covers the date range. */
  period_start?: string;
  period_end?: string;
}

export interface MisReport {
  period: string;
  client_name: string;
  revenue: number;
  expenses: number;
  gross_profit: number;
  gst_collected: number;
  gst_paid: number;
  itc_available: number;
  itc_claimed: number;
  itc_balance: number;
  compliance_summary: {
    filed: number;
    pending: number;
    overdue: number;
    items: { event_type: string | null; filing_period: string | null; due_date: string | null; status: string | null }[];
  };
  exceptions_summary: { open_count: number; amount_at_risk: number };
  data_quality: { doc_count: number; confidence_avg: number };
  generated_at: string;
  report_id: string;
  report_type?: string;

  source_txn_ids?: {
    revenue: string[];
    expenses: string[];
    exceptions: string[];
  };
}

/**
 * Builds a monthly MIS pack for one client from posted documents, ITC records,
 * compliance events and open exceptions, and logs it in `ca_reports_log`.
 */
export const generateMisReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: GenerateMisInput) => {
    const hasRange =
      !!input?.period_start &&
      !!input?.period_end &&
      /^\d{4}-\d{2}-\d{2}$/.test(input.period_start) &&
      /^\d{4}-\d{2}-\d{2}$/.test(input.period_end);
    if (!input?.firm_id || !input?.business_id || (!input?.period?.trim() && !hasRange)) {
      throw new Error("firm_id, business_id and period are required");
    }
    if (input.period_start && input.period_end && input.period_end < input.period_start) {
      throw new Error("period_end cannot be before period_start");
    }
    return input;
  })
  .handler(async ({ data, context }): Promise<MisReport> => {
    const { supabase, userId } = context;
    const reportType = data.report_type?.trim() || "monthly_mis";
    const hasRange = !!data.period_start && !!data.period_end;
    const periodLabel = hasRange
      ? `${data.period_start} to ${data.period_end}`
      : data.period.trim();
    const rangeMonths = hasRange ? monthsInRange(data.period_start!, data.period_end!) : null;

    // Portfolio access is enforced in SQL as well; fail fast with a clear message.
    const { data: access } = await supabase
      .from("ca_client_access")
      .select("id")
      .eq("ca_firm_id", data.firm_id)
      .eq("business_id", data.business_id)
      .eq("is_active", true)
      .maybeSingle();
    if (!access) throw new Error("Access denied. This client is not in your portfolio.");

    const [clientRes, docsRes, itcRes, complianceRes, exceptionsRes] = await Promise.all([
      supabase
        .from("ca_clients")
        .select("client_name")
        .eq("ca_firm_id", data.firm_id)
        .eq("business_id", data.business_id)
        .maybeSingle(),
      supabase
        .from("ca_document_extractions")
        .select("classification, confidence, extracted, corrected")
        .eq("ca_firm_id", data.firm_id)
        .eq("business_id", data.business_id)
        .eq("review_state", "posted")
        .limit(5000),
      rangeMonths
        ? supabase
            .from("ca_itc_records")
            .select("total_itc, match_status, filing_period")
            .eq("ca_firm_id", data.firm_id)
            .eq("business_id", data.business_id)
            .in("filing_period", rangeMonths)
            .limit(5000)
        : supabase
            .from("ca_itc_records")
            .select("total_itc, match_status, filing_period")
            .eq("ca_firm_id", data.firm_id)
            .eq("business_id", data.business_id)
            .eq("filing_period", data.period)
            .limit(5000),
      rangeMonths
        ? supabase
            .from("ca_compliance_events")
            .select("status, event_type, due_date, filing_period")
            .eq("ca_firm_id", data.firm_id)
            .eq("business_id", data.business_id)
            .in("filing_period", rangeMonths)
            .limit(500)
        : supabase
            .from("ca_compliance_events")
            .select("status, event_type, due_date, filing_period")
            .eq("ca_firm_id", data.firm_id)
            .eq("business_id", data.business_id)
            .eq("filing_period", data.period)
            .limit(500),
      supabase
        .from("ca_exceptions")
        .select("status, amount")
        .eq("ca_firm_id", data.firm_id)
        .eq("business_id", data.business_id)
        .limit(2000),
    ]);

    const docs = summariseDocuments(
      (docsRes.data ?? []) as unknown as MisExtraction[],
      periodLabel,
      hasRange ? { start: data.period_start!, end: data.period_end! } : undefined,
    );
    const itc = summariseItc((itcRes.data ?? []) as unknown as MisItcRow[]);
    const compliance = summariseCompliance((complianceRes.data ?? []) as unknown as MisComplianceRow[]);
    const exceptions = summariseExceptions((exceptionsRes.data ?? []) as unknown as MisExceptionRow[]);

    // Collect source transaction IDs so the MIS can drill through to the ledger.
    const sourceTxnIds: NonNullable<MisReport["source_txn_ids"]> = {
      revenue: [],
      expenses: [],
      exceptions: [],
    };
    try {
      const from = hasRange ? data.period_start! : "2000-01-01";
      const to = hasRange ? data.period_end! : new Date().toISOString().slice(0, 10);
      const [revTxns, expTxns, excItems] = await Promise.all([
        supabase.from("bank_transactions").select("id")
          .eq("business_id", data.business_id).eq("type", "credit")
          .gte("date", from).lte("date", to).limit(500),
        supabase.from("bank_transactions").select("id")
          .eq("business_id", data.business_id).eq("type", "debit")
          .gte("date", from).lte("date", to).limit(500),
        supabase.from("ca_exceptions").select("id")
          .eq("ca_firm_id", data.firm_id).eq("business_id", data.business_id)
          .neq("status", "resolved").limit(100),
      ]);
      sourceTxnIds.revenue = (revTxns.data ?? []).map((r) => r.id as string);
      sourceTxnIds.expenses = (expTxns.data ?? []).map((r) => r.id as string);
      sourceTxnIds.exceptions = (excItems.data ?? []).map((r) => r.id as string);
      console.log(
        `[fyn:mis] source_txn_ids revenue=${sourceTxnIds.revenue.length} expenses=${sourceTxnIds.expenses.length} exceptions=${sourceTxnIds.exceptions.length}`,
      );
    } catch { /* non-blocking */ }

    const report = {
      period: periodLabel,
      client_name: clientRes.data?.client_name ?? "Client",
      revenue: docs.revenue,
      expenses: docs.expenses,
      gross_profit: docs.gross_profit,
      gst_collected: docs.gst_collected,
      gst_paid: docs.gst_paid,
      itc_available: itc.itc_available,
      itc_claimed: itc.itc_claimed,
      itc_balance: itc.itc_balance,
      compliance_summary: compliance,
      exceptions_summary: exceptions,
      data_quality: { doc_count: docs.doc_count, confidence_avg: docs.confidence_avg },
      generated_at: new Date().toISOString(),
      source_txn_ids: sourceTxnIds,
      report_type: reportType,
    };



    const { data: logRow, error: logErr } = await supabase
      .from("ca_reports_log")
      .insert({
        ca_firm_id: data.firm_id,
        business_id: data.business_id,
        report_type: reportType,
        report_name: `MIS — ${report.client_name} — ${periodLabel}`,
        period: periodLabel,
        ...(hasRange ? { period_start: data.period_start, period_end: data.period_end } : {}),
        content: report as never,
        generated_by_user_id: userId,
        status: "ready",
      })
      .select("id")
      .maybeSingle();
    if (logErr) throw new Error(logErr.message);

    await supabase.from("ca_audit_events").insert({
      ca_firm_id: data.firm_id,
      business_id: data.business_id,
      actor_id: userId,
      entity_type: "report",
      entity_id: logRow?.id ?? null,
      action: "mis_generated",
      detail: { period: periodLabel, report_type: reportType, doc_count: docs.doc_count } as never,
    });

    return { ...report, report_id: logRow?.id ?? "" };
  });

export interface GenerateTypedMisInput {
  firm_id: string;
  business_id: string;
  report_type: MisReportKind;
  /** Reporting month, YYYY-MM. The financial year is derived from it. */
  month: string;
  comparison?: ComparisonMode;
  /** false = preview only (nothing is saved). */
  persist?: boolean;
}

const ROW_LIMIT = 5000;

/**
 * Builds one of the report-type MIS reports (P&L, Balance Sheet, Cash & Bank,
 * Receivables/Payables Aging, Bank Reconciliation). All figures come from the
 * deterministic builders in caMisBuilders.server.ts; the general MIS keeps using
 * `generateMisReport`.
 */
export const generateTypedMis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: GenerateTypedMisInput) => {
    if (!input?.firm_id || !input?.business_id) throw new Error("firm_id and business_id are required");
    const entry = MIS_CATALOG.find((c) => c.kind === input.report_type);
    if (!entry) throw new Error("Unknown report type");
    if (!TYPED_MIS_KINDS.includes(input.report_type)) {
      throw new Error(`${entry.label} is not available yet.`);
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month ?? "")) throw new Error("Pick a valid reporting month");
    if (input.comparison && !["none", "prev_month", "prev_year"].includes(input.comparison)) {
      throw new Error("Unknown comparison period");
    }
    return input;
  })
  .handler(async ({ data, context }): Promise<TypedMisReport> => {
    const { supabase, userId } = context;
    const kind = data.report_type;
    const entry = MIS_CATALOG.find((c) => c.kind === kind)!;
    const comparison: ComparisonMode = entry.supportsComparison ? (data.comparison ?? "none") : "none";
    const period = resolvePeriod(data.month, comparison);

    const { data: access } = await supabase
      .from("ca_client_access")
      .select("id")
      .eq("ca_firm_id", data.firm_id)
      .eq("business_id", data.business_id)
      .eq("is_active", true)
      .maybeSingle();
    if (!access) throw new Error("Access denied. This client is not in your portfolio.");

    const { data: clientRow } = await supabase
      .from("ca_clients")
      .select("client_name")
      .eq("ca_firm_id", data.firm_id)
      .eq("business_id", data.business_id)
      .maybeSingle();

    const sources: ReportSource[] = [];
    /** Records the outcome of a read so missing or failed sources are visible in the report. */
    const track = <T,>(name: string, table: string, res: { data: T[] | null; error: { message: string } | null }, limit?: number): T[] => {
      const rows = res.data ?? [];
      if (res.error) {
        sources.push({ name, table, records: 0, status: "error", note: res.error.message });
        return [];
      }
      sources.push({
        name, table, records: rows.length,
        status: limit && rows.length >= limit ? "truncated" : rows.length ? "ok" : "empty",
      });
      return rows;
    };

    const bid = data.business_id;
    const fid = data.firm_id;
    let built: BuiltReport;

    if (kind === "pnl") {
      const [docsRes, pendingRes] = await Promise.all([
        supabase.from("ca_document_extractions")
          .select("id, original_filename, classification, confidence, extracted, corrected")
          .eq("ca_firm_id", fid).eq("business_id", bid).eq("review_state", "posted").limit(ROW_LIMIT),
        supabase.from("ca_document_extractions")
          .select("id", { count: "exact", head: true })
          .eq("ca_firm_id", fid).eq("business_id", bid).neq("review_state", "posted"),
      ]);
      const docs = track("Posted documents", "ca_document_extractions", docsRes as never, ROW_LIMIT) as unknown as PnlDoc[];
      built = buildPnl({ docs, pendingReviewCount: pendingRes.count ?? 0, truncated: docs.length >= ROW_LIMIT }, period);
    } else if (kind === "balance_sheet") {
      const snapAt = (end: string) =>
        supabase.from("balance_sheet_snapshots").select("*")
          .eq("business_id", bid).lte("snapshot_date", end)
          .order("snapshot_date", { ascending: false }).limit(1);
      const [curRes, cmpRes] = await Promise.all([
        snapAt(period.end),
        period.comparison ? snapAt(period.comparison.end) : Promise.resolve(null),
      ]);
      const cur = track("Balance sheet snapshots", "balance_sheet_snapshots", curRes as never) as unknown as BalanceSnapshot[];
      const prev = cmpRes ? (track("Comparison snapshot", "balance_sheet_snapshots", cmpRes as never) as unknown as BalanceSnapshot[]) : [];
      built = buildBalanceSheet(cur[0] ?? null, prev[0] ?? null, period);
    } else if (kind === "cash_bank") {
      const cols = "id, date, description, category, amount, balance, type";
      const txnsIn = (start: string, end: string) =>
        supabase.from("bank_transactions").select(cols).eq("business_id", bid)
          .gte("date", start).lte("date", end)
          .order("date", { ascending: true }).order("created_at", { ascending: true }).limit(ROW_LIMIT);
      const lastBefore = (start: string) =>
        supabase.from("bank_transactions").select(cols).eq("business_id", bid).lt("date", start)
          .order("date", { ascending: false }).order("created_at", { ascending: false }).limit(1);
      const cmp = period.comparison;
      const [curRes, priorRes, cmpRes, cmpPriorRes, acctRes, snapRes] = await Promise.all([
        txnsIn(period.start, period.end),
        lastBefore(period.start),
        cmp ? txnsIn(cmp.start, cmp.end) : Promise.resolve(null),
        cmp ? lastBefore(cmp.start) : Promise.resolve(null),
        supabase.from("ca_bank_accounts_linked").select("id, masked_account_number, fip_name, account_type")
          .eq("ca_firm_id", fid).eq("business_id", bid),
        supabase.from("balance_sheet_snapshots").select("cash, snapshot_date")
          .eq("business_id", bid).lte("snapshot_date", period.end)
          .order("snapshot_date", { ascending: false }).limit(1),
      ]);
      const txns = track("Bank transactions", "bank_transactions", curRes as never, ROW_LIMIT) as unknown as BankTxn[];
      const prior = ((priorRes as { data: BankTxn[] | null }).data ?? [])[0] ?? null;
      const cmpTxns = cmpRes ? ((cmpRes as { data: BankTxn[] | null }).data ?? []) : null;
      const cmpPrior = cmpPriorRes ? ((cmpPriorRes as { data: BankTxn[] | null }).data ?? [])[0] ?? null : null;
      const accounts = track("Linked bank accounts", "ca_bank_accounts_linked", acctRes as never) as unknown as LinkedAccount[];
      const snap = ((snapRes as { data: { cash: number; snapshot_date: string }[] | null }).data ?? [])[0];
      built = buildCashBank({
        txns, prior, cmpTxns, cmpPrior, accounts,
        snapshotCash: snap ? { value: Number(snap.cash), date: snap.snapshot_date } : null,
        truncated: txns.length >= ROW_LIMIT,
      }, period);
    } else if (kind === "receivables_aging") {
      const res = await supabase.from("receivables")
        .select("id, customer_name, invoice_number, invoice_date, due_date, amount, received, outstanding")
        .eq("business_id", bid).limit(ROW_LIMIT);
      const rows = track("Receivables ledger", "receivables", res as never, ROW_LIMIT) as unknown as {
        id: string; customer_name: string; invoice_number: string | null; invoice_date: string | null;
        due_date: string | null; amount: number; received: number | null; outstanding: number | null;
      }[];
      const aging: AgingRow[] = rows.map((r) => ({
        id: r.id, party: r.customer_name, ref: r.invoice_number, date: r.invoice_date, due: r.due_date,
        amount: Number(r.amount), settled: r.received, outstanding: r.outstanding,
      }));
      built = buildAging("receivable", aging, period);
    } else if (kind === "payables_aging") {
      const res = await supabase.from("payables")
        .select("id, vendor_name, invoice_number, created_at, due_date, amount, paid, outstanding")
        .eq("business_id", bid).limit(ROW_LIMIT);
      const rows = track("Payables ledger", "payables", res as never, ROW_LIMIT) as unknown as {
        id: string; vendor_name: string; invoice_number: string | null; created_at: string;
        due_date: string | null; amount: number; paid: number | null; outstanding: number | null;
      }[];
      const aging: AgingRow[] = rows.map((r) => ({
        id: r.id, party: r.vendor_name, ref: r.invoice_number, date: r.created_at.slice(0, 10), due: r.due_date,
        amount: Number(r.amount), settled: r.paid, outstanding: r.outstanding,
      }));
      built = buildAging("payable", aging, period);
    } else {
      // bank_rec
      const [txnRes, runRes, excRes] = await Promise.all([
        supabase.from("bank_transactions")
          .select("id, date, description, category, amount, balance, type, reconciled, source_reference")
          .eq("business_id", bid).gte("date", period.start).lte("date", period.end)
          .order("date", { ascending: true }).limit(ROW_LIMIT),
        supabase.from("ca_recon_runs")
          .select("id, recon_type, period, run_at, matched, unmatched, mismatched, total_at_risk")
          .eq("ca_firm_id", fid).eq("business_id", bid).order("run_at", { ascending: false }).limit(50),
        supabase.from("ca_exceptions")
          .select("id, reason_code, severity, status, amount, description, created_at")
          .eq("ca_firm_id", fid).eq("business_id", bid)
          .not("status", "in", "(resolved,closed)")
          .lte("created_at", `${period.end}T23:59:59Z`).limit(500),
      ]);
      const txns = track("Bank transactions", "bank_transactions", txnRes as never, ROW_LIMIT) as unknown as BankTxn[];
      const allRuns = track("Reconciliation runs", "ca_recon_runs", runRes as never) as unknown as ReconRun[];
      const exceptions = track("Open exceptions", "ca_exceptions", excRes as never) as unknown as OpenException[];
      const needles = [period.month, period.label, monthLabel(period.month).replace(" ", "-")].map((x) => x.toLowerCase());
      const runs = allRuns.filter((r) => needles.some((n) => String(r.period ?? "").toLowerCase().includes(n)));
      built = buildBankRec({ txns, runs, exceptions, truncated: txns.length >= ROW_LIMIT }, period);
    }

    for (const s of sources) {
      if (s.status === "error") {
        built.issues.unshift({ level: "error", code: "source_error", message: `Could not read ${s.name.toLowerCase()}: ${s.note ?? "unknown error"}. Check that this client's data is shared with your firm.` });
      } else if (s.status === "empty" && !built.issues.some((i) => i.level === "error")) {
        built.issues.push({ level: "info", code: "source_empty", message: `${s.name}: no records found.` });
      }
    }

    const hasError = built.issues.some((i) => i.level === "error");
    const report: TypedMisReport = {
      kind,
      title: misLabel(kind),
      client_name: clientRow?.client_name ?? "Client",
      period_label: period.label,
      financial_year: period.fy,
      period_start: period.start,
      period_end: period.end,
      comparison_label: period.comparison?.label ?? null,
      generated_at: new Date().toISOString(),
      sections: hasError ? [] : built.sections,
      issues: built.issues,
      sources,
      report_id: null,
    };

    if (!data.persist) return report;
    if (hasError) {
      throw new Error(built.issues.filter((i) => i.level === "error").map((i) => i.message).join(" "));
    }

    const { data: logRow, error: logErr } = await supabase
      .from("ca_reports_log")
      .insert({
        ca_firm_id: fid,
        business_id: bid,
        report_type: `mis_${kind}`,
        report_name: `${report.title} — ${report.client_name} — ${report.period_label}`,
        period: report.period_label,
        period_start: report.period_start,
        period_end: report.period_end,
        content: report as never,
        generated_by_user_id: userId,
        status: "ready",
      })
      .select("id")
      .maybeSingle();
    if (logErr) throw new Error(logErr.message);

    await supabase.from("ca_audit_events").insert({
      ca_firm_id: fid,
      business_id: bid,
      actor_id: userId,
      entity_type: "report",
      entity_id: logRow?.id ?? null,
      action: "mis_generated",
      detail: { period: report.period_label, report_type: `mis_${kind}`, issues: built.issues.length } as never,
    });
    return { ...report, report_id: logRow?.id ?? null };
  });
