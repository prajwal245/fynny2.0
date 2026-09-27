/**
 * Narrate agent — server side. Builds a source-traceable MIS from matched
 * transactions only, stores it in ca_reports_log, and serves the
 * click-through from any figure to the transactions behind it.
 */
import { PracticeError, parsePeriod, previousPeriod, sha256Hex, signedAmount, sumRupees, type Period } from "./core";
import { assertClient, canSignOff, clientMeta, fetchAll, logActivity, type Db, type FirmContext } from "./db.server";
import { practiceLlm } from "./llm.server";
import { computeFigures, ruleInsights, toSourceRow, type Insight, type NarrateTxn, type SourceRow } from "./narrate/calc";
import { INSIGHTS_SYSTEM_PROMPT, insightsPayload, validateInsights } from "./narrate/insights";
import { REASON_LABELS, type ReasonCode } from "./recon/engine";

export const REPORT_TEMPLATES = ["Monthly MIS", "Bank Reconciliation Summary", "Key Variances", "Working Paper", "Exception and Review Summary"] as const;
export type ReportTemplate = (typeof REPORT_TEMPLATES)[number];

const COLS = "id, side, direction, amount, txn_date, counterparty, description, category, reference, balance, row_index, extraction_id, match_status";
const ROW_CAP = 500;

async function bankLines(db: Db, firmId: string, businessId: string, p: Period, statuses?: string[]) {
  const rows = await fetchAll<NarrateTxn & { match_status: string }>((from, to) => {
    let q = db.from("ca_txns").select(COLS).eq("ca_firm_id", firmId).eq("business_id", businessId).eq("side", "bank")
      .gte("txn_date", p.start).lte("txn_date", p.end);
    if (statuses) q = q.in("match_status", statuses);
    return q.order("txn_date").order("row_index").range(from, to);
  });
  return rows.map((r) => ({ ...r, amount: Number(r.amount), balance: r.balance === null ? null : Number(r.balance) }));
}

interface BankSummaryRow { key: string; label: string; value: number; unit: "inr" | "count"; rows: SourceRow[]; txn_ids: string[] }

const inrRows = (list: NarrateTxn[]) => list.slice(0, ROW_CAP).map(toSourceRow);

export async function generateReport(db: Db, ctx: FirmContext, businessId: string, periodInput: string, template: ReportTemplate) {
  if (!REPORT_TEMPLATES.includes(template)) throw new PracticeError("invalid", `Unknown report template "${template}".`);
  const client = await assertClient(db, ctx, businessId);
  const period = parsePeriod(periodInput);
  const prev = previousPeriod(period);

  const [statement, prior, exceptions, reviewOpen] = await Promise.all([
    bankLines(db, ctx.firmId, businessId, period),
    prev ? bankLines(db, ctx.firmId, businessId, prev, ["matched"]) : Promise.resolve([]),
    db.from("ca_exceptions").select("id, reason_code, amount, txn_id").eq("ca_firm_id", ctx.firmId).eq("business_id", businessId).eq("status", "open")
      .gte("period_start", period.start).lte("period_end", period.end),
    db.from("ca_review_items").select("id", { count: "exact", head: true }).eq("ca_firm_id", ctx.firmId).eq("business_id", businessId).eq("status", "open"),
  ]);
  const matched = statement.filter((t) => t.match_status === "matched");
  const unmatched = statement.filter((t) => t.match_status !== "matched" && t.match_status !== "ignored");

  if (!matched.length && template !== "Exception and Review Summary" && template !== "Bank Reconciliation Summary") {
    throw new PracticeError(
      "no_matched_transactions",
      statement.length
        ? `None of the ${statement.length} bank lines in ${period.label} are matched yet. Run recon and clear exceptions first; only matched transactions go into the MIS.`
        : `No bank transactions dated in ${period.label}. Upload the bank statement and books for this period, then run recon.`,
    );
  }

  const figures = computeFigures(matched, prior, statement);
  let insights: Insight[] = ruleInsights(figures, matched);
  const aiMeta: { provider: string | null; model: string | null; rejected: { text: string; reason: string }[]; error: string | null } = { provider: null, model: null, rejected: [], error: null };
  let aiCall: Record<string, unknown> | null = null;
  const llm = matched.length >= 3 ? practiceLlm({ timeoutMs: 30_000 }) : null;
  if (llm) {
    const user = JSON.stringify(insightsPayload(figures, matched, client.client_name, period.label));
    const started = Date.now();
    try {
      const res = await llm.json({ purpose: "narrate_insights", system: INSIGHTS_SYSTEM_PROMPT, user });
      const check = validateInsights(res.data, figures, matched);
      aiMeta.provider = res.provider; aiMeta.model = res.model; aiMeta.rejected = check.rejected;
      if (check.accepted.length >= 2) {
        const texts = new Set(check.accepted.map((i) => i.text));
        insights = [...check.accepted, ...insights.filter((i) => !texts.has(i.text))].slice(0, 7);
      }
      aiCall = { purpose: "narrate_insights", provider: res.provider, model: res.model, input: user.slice(0, 20_000), output: res.raw.slice(0, 20_000), latency_ms: res.latency_ms, status: "success", error: null };
    } catch (e) {
      aiMeta.error = (e as Error).message;
      aiCall = { purpose: "narrate_insights", provider: null, model: null, input: user.slice(0, 20_000), output: null, latency_ms: Date.now() - started, status: "error", error: aiMeta.error };
    }
  }

  const excRows = exceptions.data ?? [];
  const byReason: Record<string, number> = {};
  for (const e of excRows) {
    const label = REASON_LABELS[e.reason_code as ReasonCode] ?? e.reason_code;
    byReason[label] = (byReason[label] ?? 0) + 1;
  }
  const warnings: string[] = [];
  if (unmatched.length) warnings.push(`${unmatched.length} bank line${unmatched.length === 1 ? " is" : "s are"} not reconciled and ${unmatched.length === 1 ? "is" : "are"} excluded from these figures. Insights are based only on matched data.`);
  if (reviewOpen.count) warnings.push(`${reviewOpen.count} extracted row${reviewOpen.count === 1 ? " is" : "s are"} still waiting in the Review Queue.`);
  if (!prior.length) warnings.push(prev ? `No matched data for ${prev.label}, so period-over-period variances are not shown.` : "Custom period: variances are not shown.");
  if (matched.length > 0 && matched.length < 5) warnings.push("Very few matched transactions: read insights with caution.");

  const ins = matched.filter((t) => t.direction === "in");
  const outs = matched.filter((t) => t.direction === "out");
  const high = matched.filter((t) => t.amount >= 100_000);
  const n = figures.numbers;
  const bankSummary: BankSummaryRow[] = [];
  const push = (key: string, label: string, value: number, unit: "inr" | "count", list: NarrateTxn[]) =>
    bankSummary.push({ key, label, value, unit, rows: inrRows(list), txn_ids: list.map((t) => t.id) });

  if (template === "Monthly MIS" || template === "Working Paper" || template === "Key Variances") {
    push("total_receipts", "Credits in bank", n.total_receipts.value, "inr", ins);
    push("total_payments", "Debits in bank", n.total_payments.value, "inr", outs);
    push("high_value", "High value lines above one lakh", high.length, "count", high);
    if (n.closing_balance) push("closing_balance", n.closing_balance.label, n.closing_balance.value, "inr", statement.filter((t) => n.closing_balance.txn_ids.includes(t.id)));
  }
  if (template === "Bank Reconciliation Summary") {
    push("matched_lines", "Bank lines matched to books", sumRupees(matched.map((t) => t.amount)), "inr", matched);
    push("unreconciled_in", "Unreconciled credits", sumRupees(unmatched.filter((t) => t.direction === "in").map((t) => t.amount)), "inr", unmatched.filter((t) => t.direction === "in"));
    push("unreconciled_out", "Unreconciled debits", sumRupees(unmatched.filter((t) => t.direction === "out").map((t) => t.amount)), "inr", unmatched.filter((t) => t.direction === "out"));
    const excTxnIds = new Set(excRows.map((e) => e.txn_id));
    push("open_exceptions", "Open exceptions", excRows.length, "count", statement.filter((t) => excTxnIds.has(t.id)));
  }
  if (template === "Working Paper") {
    figures.receipts_by_party.slice(0, 15).forEach((p, i) => push(`party_in_${i}`, `Receipts — ${p.party}`, p.total, "inr", ins.filter((t) => p.txn_ids.includes(t.id))));
    figures.payments_by_party.slice(0, 15).forEach((p, i) => push(`party_out_${i}`, `Payments — ${p.party}`, p.total, "inr", outs.filter((t) => p.txn_ids.includes(t.id))));
  }
  if (template === "Exception and Review Summary") {
    for (const [label, count] of Object.entries(byReason)) {
      const ids = new Set(excRows.filter((e) => (REASON_LABELS[e.reason_code as ReasonCode] ?? e.reason_code) === label).map((e) => e.txn_id));
      push(`exceptions_${label}`, `Exceptions — ${label}`, count, "count", statement.filter((t) => ids.has(t.id)));
    }
    bankSummary.push({ key: "review_open", label: "Rows waiting in the Review Queue", value: reviewOpen.count ?? 0, unit: "count", rows: [], txn_ids: [] });
  }

  const inputHash = await sha256Hex(new TextEncoder().encode(matched.map((t) => `${t.id}:${t.amount}:${t.txn_date}:${t.direction}`).sort().join("|")));
  const content = {
    template,
    period: { label: period.label, start: period.start, end: period.end },
    excluded: unmatched.length,
    revenue: n.total_receipts.value,
    expenses: n.total_payments.value,
    sources: { revenue: inrRows(ins), expenses: inrRows(outs) },
    insights: insights.map((i) => ({ text: i.text, source: i.source, cited_transaction_ids: i.cited_transaction_ids, confidence: i.confidence, origin: i.origin })),
    variances: figures.variances.map((v) => ({ key: v.key, label: v.label, current: v.current, prior: v.prior, change_pct: v.change_pct })),
    bankSummary: bankSummary.map(({ txn_ids: _ids, ...rest }) => rest),
    summary_numbers: {
      ...figures.numbers,
      ...Object.fromEntries(bankSummary.map((b) => [`summary:${b.key}`, { key: `summary:${b.key}`, label: b.label, value: b.value, unit: b.unit, txn_ids: b.txn_ids }])),
      ...Object.fromEntries(figures.variances.flatMap((v) => [
        [`variance:${v.key}:current`, { key: `variance:${v.key}:current`, label: `${v.label} (${period.label})`, value: v.current, unit: "inr", txn_ids: v.current_txn_ids }],
        [`variance:${v.key}:prior`, { key: `variance:${v.key}:prior`, label: `${v.label} (${prev?.label ?? "prior"})`, value: v.prior, unit: "inr", txn_ids: v.prior_txn_ids }],
      ])),
    },
    schedules: { receipts_by_party: figures.receipts_by_party.slice(0, 50), payments_by_party: figures.payments_by_party.slice(0, 50), by_category: figures.by_category },
    exceptions_summary: { open: excRows.length, by_reason: byReason },
    review_open: reviewOpen.count ?? 0,
    warnings,
    footer: "All numbers are derived from matched transactions only.",
    ai: aiMeta,
    generated_at: new Date().toISOString(),
  };

  const { data: report, error } = await db.from("ca_reports_log").insert({
    ca_firm_id: ctx.firmId, business_id: businessId, report_type: template, report_name: `${template} — ${period.label}`,
    period: period.label, period_start: period.start, period_end: period.end, status: "generated",
    generated_by_user_id: ctx.userId, content, input_hash: inputHash,
  }).select("id, created_at").single();
  if (error) throw new PracticeError("db_error", error.message);
  if (aiCall) await db.from("ca_ai_calls").insert({ ...aiCall, ca_firm_id: ctx.firmId, report_id: report.id });

  const meta = clientMeta(client.notes);
  await db.from("ca_clients").update({ notes: JSON.stringify({ ...meta, lastMis: new Date().toISOString().slice(0, 10) }), last_activity_at: new Date().toISOString() }).eq("id", client.id);
  await logActivity(db, ctx.firmId, businessId, "narrate", `${template} generated for ${period.label} from ${matched.length} matched transactions${unmatched.length ? ` (${unmatched.length} unreconciled lines excluded)` : ""}.`);
  return { id: report.id, created_at: report.created_at, business_id: businessId, period: period.label, template, content };
}

/** The transactions behind one figure of a report (paginated). */
export async function numberSources(db: Db, ctx: FirmContext, reportId: string, key: string, page = 0, pageSize = 50) {
  const { data: report } = await db.from("ca_reports_log").select("id, content").eq("id", reportId).eq("ca_firm_id", ctx.firmId).maybeSingle();
  if (!report) throw new PracticeError("not_found", "Report not found.");
  const numbers = ((report.content ?? {}) as { summary_numbers?: Record<string, { label: string; value: number; unit: string; txn_ids: string[] }> }).summary_numbers ?? {};
  const figure = numbers[key] ?? numbers[`summary:${key}`];
  if (!figure) throw new PracticeError("not_found", `No figure "${key}" in this report.`);
  const ids = figure.txn_ids ?? [];
  const slice = ids.slice(page * pageSize, (page + 1) * pageSize);
  const { data: txns } = slice.length
    ? await db.from("ca_txns").select("id, side, direction, amount, txn_date, counterparty, reference, description, category, extraction_id, row_index, raw_text").in("id", slice)
    : { data: [] };
  const order = new Map(slice.map((id, i) => [id, i]));
  const rows = (txns ?? []).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)).map((t) => ({ ...t, amount: Number(t.amount), signed_amount: signedAmount({ amount: Number(t.amount), direction: t.direction }) }));
  return { key, label: figure.label, value: figure.value, unit: figure.unit, total_transactions: ids.length, page, page_size: pageSize, transactions: rows, missing: slice.length - rows.length };
}

export async function signOffReport(db: Db, ctx: FirmContext, reportId: string, by: string, note?: string) {
  if (!canSignOff(ctx)) throw new PracticeError("forbidden", "Only a partner or admin can sign off an MIS.");
  const { data } = await db.from("ca_reports_log").select("id, business_id, content, report_type, period").eq("id", reportId).eq("ca_firm_id", ctx.firmId).maybeSingle();
  if (!data) throw new PracticeError("not_found", "Report not found.");
  const content = { ...((data.content ?? {}) as Record<string, unknown>), signedOffBy: by, signOffNote: note ?? null, correction: null };
  await db.from("ca_reports_log").update({ signed_off_by: ctx.userId, signed_off_at: new Date().toISOString(), status: "signed_off", content }).eq("id", reportId);
  await logActivity(db, ctx.firmId, data.business_id, "narrate", `${by} signed off the ${data.report_type} for ${data.period}.`);
  return { ok: true };
}

export async function requestCorrection(db: Db, ctx: FirmContext, reportId: string, note: string) {
  const { data } = await db.from("ca_reports_log").select("id, business_id, content, report_type, period").eq("id", reportId).eq("ca_firm_id", ctx.firmId).maybeSingle();
  if (!data) throw new PracticeError("not_found", "Report not found.");
  const content = { ...((data.content ?? {}) as Record<string, unknown>), correction: { note, at: new Date().toISOString().slice(0, 10), by: ctx.userId } };
  await db.from("ca_reports_log").update({ signed_off_by: null, signed_off_at: null, status: "correction_requested", content }).eq("id", reportId);
  await logActivity(db, ctx.firmId, data.business_id, "narrate", `Correction requested on the ${data.report_type} for ${data.period}. ${note}`);
  return { ok: true };
}
