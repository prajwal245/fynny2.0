/**
 * Narrate agent — server side. Builds a source-traceable MIS from matched
 * transactions only, stores it in ca_reports_log, and serves the
 * click-through from any figure to the transactions behind it.
 */
import {
  PracticeError,
  parsePeriod,
  previousPeriod,
  sha256Hex,
  signedAmount,
  sumRupees,
  formatRupees,
  type Period,
  round2,
} from "./core";
import {
  assertClient,
  canSignOff,
  clientMeta,
  fetchAll,
  logActivity,
  type Db,
  type FirmContext,
} from "./db.server";
import { practiceLlm, withinAiCap } from "./llm.server";
import { statutoryDueDates } from "./india";
import { BUCKET_LABELS, cleanParty, gatewayGrossUp, misBucket, returnedChequePairs, settlementsFromRegister, type MisBucket, type Settlement } from "./narrate/flows";
import {
  computeFigures,
  ruleInsights,
  toSourceRow,
  type Insight,
  type NarrateTxn,
  type SourceRow,
} from "./narrate/calc";
import {
  INSIGHTS_SYSTEM_PROMPT,
  insightsPayload,
  validateInsights,
} from "./narrate/insights";
import { REASON_LABELS, type ReasonCode } from "./recon/engine";

export const REPORT_TEMPLATES = [
  "Monthly MIS",
  "Bank Reconciliation Summary",
  "Key Variances",
  "Working Paper",
  "Exception and Review Summary",
] as const;
export type ReportTemplate = (typeof REPORT_TEMPLATES)[number];

const COLS =
  "id, side, direction, amount, txn_date, counterparty, description, category, reference, balance, row_index, extraction_id, match_status";
const ROW_CAP = 500;

async function bankLines(
  db: Db,
  firmId: string,
  businessId: string,
  p: Period,
  statuses?: string[],
) {
  const rows = await fetchAll<NarrateTxn & { match_status: string }>(
    (from, to) => {
      let q = db
        .from("ca_txns")
        .select(COLS)
        .eq("ca_firm_id", firmId)
        .eq("business_id", businessId)
        .eq("side", "bank")
        .gte("txn_date", p.start)
        .lte("txn_date", p.end);
      if (statuses) q = q.in("match_status", statuses);
      return q.order("txn_date").order("row_index").range(from, to);
    },
  );
  return rows.map((r) => ({
    ...r,
    amount: Number(r.amount),
    balance: r.balance === null ? null : Number(r.balance),
  }));
}

interface BankSummaryRow {
  key: string;
  label: string;
  value: number;
  unit: "inr" | "count";
  rows: SourceRow[];
  txn_ids: string[];
}

const inrRows = (list: NarrateTxn[]) => list.slice(0, ROW_CAP).map(toSourceRow);

export async function generateReport(
  db: Db,
  ctx: FirmContext,
  businessId: string,
  periodInput: string,
  template: ReportTemplate,
) {
  if (!REPORT_TEMPLATES.includes(template))
    throw new PracticeError(
      "invalid",
      `Unknown report template "${template}".`,
    );
  const client = await assertClient(db, ctx, businessId);
  const period = parsePeriod(periodInput);
  const prev = previousPeriod(period);

  const [statement, prior, exceptions, reviewOpen, decidedRes] = await Promise.all([
    bankLines(db, ctx.firmId, businessId, period),
    prev
      ? bankLines(db, ctx.firmId, businessId, prev, ["matched"])
      : Promise.resolve([]),
    db
      .from("ca_exceptions")
      .select("id, reason_code, amount, txn_id")
      .eq("ca_firm_id", ctx.firmId)
      .eq("business_id", businessId)
      .eq("status", "open")
      .gte("period_start", period.start)
      .lte("period_end", period.end),
    db
      .from("ca_review_items")
      .select("id", { count: "exact", head: true })
      .eq("ca_firm_id", ctx.firmId)
      .eq("business_id", businessId)
      .eq("status", "open"),
    // Decided lines are listed in the Exception and Review Summary, not just counted.
    template === "Exception and Review Summary"
      ? db
          .from("ca_exceptions")
          .select("reason_code, amount, txn_id, txn_side, status, resolution_action, resolution_note, resolved_at")
          .eq("ca_firm_id", ctx.firmId)
          .eq("business_id", businessId)
          .neq("status", "open")
          .gte("period_start", period.start)
          .lte("period_end", period.end)
          .limit(200)
      : Promise.resolve({ data: [] as { reason_code: string; amount: number | null; txn_id: string | null; txn_side: string | null; status: string; resolution_action: string | null; resolution_note: string | null; resolved_at: string | null }[] }),
  ]);
  const matchedRaw = statement.filter((t) => t.match_status === "matched");
  // The books say who a matched line is really with ("Kaveri Fashions Pvt Ltd",
  // or "Suspense A/c"), so their party name and ledger decide how it is shown.
  const books = await bookSideOf(db, ctx.firmId, matchedRaw.map((t) => t.id));
  const matched = matchedRaw.map((t) => {
    const b = books.get(t.id);
    return { ...t, counterparty: b?.party || cleanParty(t.counterparty) || t.counterparty };
  });
  const bookText = (id: string) => books.get(id)?.text ?? "";
  const unmatched = statement.filter(
    (t) => t.match_status !== "matched" && t.match_status !== "ignored",
  );

  if (
    !matched.length &&
    template !== "Exception and Review Summary" &&
    template !== "Bank Reconciliation Summary"
  ) {
    throw new PracticeError(
      "no_matched_transactions",
      statement.length
        ? `None of the ${statement.length} bank lines in ${period.label} are matched yet. Run recon and clear exceptions first; only matched transactions go into the MIS.`
        : `No bank transactions dated in ${period.label}. Upload the bank statement and books for this period, then run recon.`,
    );
  }

  const figures = computeFigures(matched, prior, statement);
  // Bucket every matched line once: bank narration plus what the books say.
  const pairs = returnedChequePairs(statement);
  const pairIds = new Set(pairs.flatMap((p) => [p.deposit, p.ret]));
  const bucketOf = new Map<string, MisBucket>(
    matched.map((t) => [
      t.id,
      pairIds.has(t.id) ? "returned_cheque" : misBucket({ ...t, description: `${t.description ?? ""} ${bookText(t.id)}` }),
    ]),
  );
  const revenueTxns = matched.filter((t) => bucketOf.get(t.id) === "revenue");
  const expenseTxns = matched.filter((t) => bucketOf.get(t.id) === "expense");
  let insights: Insight[] = ruleInsights(figures, matched, revenueTxns);
  const suspense = matched.filter((t) => bucketOf.get(t.id) === "unidentified");
  if (suspense.length) {
    const total = sumRupees(suspense.map((t) => t.amount));
    insights.unshift({
      text: `${formatRupees(total)} received across ${suspense.length} line${suspense.length === 1 ? " is" : "s are"} booked to Suspense. Find out who paid and rebook ${suspense.length === 1 ? "it" : "them"}; ${suspense.length === 1 ? "it is" : "they are"} not counted as revenue.`,
      cited_transaction_ids: suspense.map((t) => t.id),
      confidence: 1,
      origin: "rules",
      source: `${suspense.length} transaction${suspense.length === 1 ? "" : "s"}`,
    });
  }
  if (pairs.length) {
    const total = sumRupees(pairs.map((p) => p.amount));
    const ids = pairs.flatMap((p) => [p.deposit, p.ret]);
    insights.unshift({
      text: `${pairs.length} cheque${pairs.length === 1 ? " was" : "s were"} returned (${formatRupees(total)}). The deposit${pairs.length === 1 ? " is" : "s are"} left out of revenue; check the receipt${pairs.length === 1 ? " has" : "s have"} been reversed in the books.`,
      cited_transaction_ids: ids,
      confidence: 1,
      origin: "rules",
      source: `${ids.length} transactions`,
    });
  }
  const aiMeta: {
    provider: string | null;
    model: string | null;
    rejected: { text: string; reason: string }[];
    error: string | null;
  } = { provider: null, model: null, rejected: [], error: null };
  let aiCall: Record<string, unknown> | null = null;
  // Insights are a bonus on top of figures computed in code: never let the AI
  // hold the report up. One short attempt, then the rule-based insights stand.
  const llm = matched.length >= 3 && (await withinAiCap(db, ctx.firmId)) ? practiceLlm({ timeoutMs: 9_000 }) : null;
  if (llm) {
    const user = JSON.stringify(
      insightsPayload(figures, matched, client.client_name, period.label),
    );
    const started = Date.now();
    try {
      const res = await Promise.race([
        llm.json({
          purpose: "narrate_insights",
          system: INSIGHTS_SYSTEM_PROMPT,
          user,
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("AI insights took too long; rule-based insights used")), 10_000)),
      ]);
      const check = validateInsights(res.data, figures, matched);
      aiMeta.provider = res.provider;
      aiMeta.model = res.model;
      aiMeta.rejected = check.rejected;
      if (check.accepted.length >= 2) {
        const texts = new Set(check.accepted.map((i) => i.text));
        insights = [
          ...check.accepted,
          ...insights.filter((i) => !texts.has(i.text)),
        ].slice(0, 7);
      }
      aiCall = {
        purpose: "narrate_insights",
        provider: res.provider,
        model: res.model,
        input: user.slice(0, 20_000),
        output: res.raw.slice(0, 20_000),
        latency_ms: res.latency_ms,
        status: "success",
        error: null,
      };
    } catch (e) {
      aiMeta.error = (e as Error).message;
      aiCall = {
        purpose: "narrate_insights",
        provider: null,
        model: null,
        input: user.slice(0, 20_000),
        output: null,
        latency_ms: Date.now() - started,
        status: "error",
        error: aiMeta.error,
      };
    }
  }

  const excRows = exceptions.data ?? [];
  const decidedRows = (decidedRes.data ?? []).filter((d) => d.txn_id && d.resolution_action !== "auto_matched");
  const decidedTxnIds = [...new Set(decidedRows.map((d) => d.txn_id as string))];
  const { data: decidedTxns } = decidedTxnIds.length
    ? await db.from("ca_txns").select("id, txn_date, description, counterparty, amount, direction, side").in("id", decidedTxnIds)
    : { data: [] as { id: string; txn_date: string; description: string | null; counterparty: string | null; amount: number; direction: string; side: string }[] };
  const txnById = new Map((decidedTxns ?? []).map((t) => [t.id, t]));
  const OUTCOME: Record<string, string> = {
    ignore: "Ignored",
    ignored: "Ignored",
    reconciled_external: "Reconciled outside FynHelp",
    matched_manually: "Matched by hand",
  };
  // A bank line and its book entry closed by one match are listed once (the bank line).
  const bankClosed = new Set(decidedRows.filter((d) => d.txn_side === "bank" && d.resolution_action === "matched_manually").map((d) => d.resolved_at));
  const decisions = decidedRows
    .filter((d) => !(d.txn_side === "books" && d.resolution_action === "matched_manually" && bankClosed.has(d.resolved_at)))
    .map((d) => {
      const t = txnById.get(d.txn_id as string);
      const amount = Number(t?.amount ?? d.amount ?? 0);
      return {
        date: t?.txn_date ?? null,
        particulars: t?.counterparty || t?.description || "Line",
        side: t?.side ?? d.txn_side ?? null,
        amount: t?.direction === "out" ? -Math.abs(amount) : Math.abs(amount),
        reason: REASON_LABELS[d.reason_code as ReasonCode] ?? d.reason_code,
        outcome: /difference/i.test(d.resolution_note ?? "") ? "Matched with a difference" : (OUTCOME[d.resolution_action ?? d.status] ?? d.status),
        note: d.resolution_note ?? "",
      };
    })
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const byReason: Record<string, number> = {};
  for (const e of excRows) {
    const label = REASON_LABELS[e.reason_code as ReasonCode] ?? e.reason_code;
    byReason[label] = (byReason[label] ?? 0) + 1;
  }
  const warnings: string[] = [];
  if (unmatched.length)
    warnings.push(
      `${unmatched.length} bank line${unmatched.length === 1 ? " is" : "s are"} not reconciled and ${unmatched.length === 1 ? "is" : "are"} excluded from these figures. Insights are based only on matched data.`,
    );
  if (reviewOpen.count)
    warnings.push(
      `${reviewOpen.count} extracted row${reviewOpen.count === 1 ? " is" : "s are"} still waiting in the Review Queue.`,
    );
  if (!prior.length)
    warnings.push(
      prev
        ? `No matched data for ${prev.label}, so period-over-period variances are not shown.`
        : "Custom period: variances are not shown.",
    );
  if (matched.length > 0 && matched.length < 5)
    warnings.push("Very few matched transactions: read insights with caution.");

  const ins = matched.filter((t) => t.direction === "in");
  const outs = matched.filter((t) => t.direction === "out");
  // Operating revenue and expenses only; other cash flows are listed separately,
  // each as a signed net (money in positive, money out negative) with In and Out.
  const otherFlows = (Object.keys(BUCKET_LABELS) as MisBucket[])
    .filter((b) => b !== "revenue" && b !== "expense")
    .map((b) => {
      let list = matched.filter((t) => bucketOf.get(t.id) === b);
      // A return still waiting in the exceptions belongs next to its deposit.
      if (b === "returned_cheque") list = statement.filter((t) => pairIds.has(t.id)).map((t) => matched.find((m) => m.id === t.id) ?? t);
      const inAmt = sumRupees(list.filter((t) => t.direction === "in").map((t) => t.amount));
      const outAmt = sumRupees(list.filter((t) => t.direction === "out").map((t) => t.amount));
      const net = round2(inAmt - outAmt);
      return {
        key: b,
        label: BUCKET_LABELS[b],
        direction: (net < 0 ? "out" : "in") as "in" | "out",
        amount: Math.abs(net),
        net,
        in: inAmt,
        out: outAmt,
        count: list.length,
        rows: inrRows(list),
      };
    })
    .filter((f) => f.count > 0);
  // Gateway payouts arrive net of fees: with the settlement report uploaded,
  // revenue is grossed up to what customers paid and the fees become an expense.
  const { data: gatewayDocs } = await db
    .from("ca_document_extractions")
    .select("original_filename, extracted")
    .eq("ca_firm_id", ctx.firmId)
    .eq("business_id", businessId)
    .eq("classification", "gateway_settlement");
  const settlements: Settlement[] = (gatewayDocs ?? []).flatMap((d) =>
    settlementsFromRegister(
      (d.extracted as { register?: { totals?: { label: string; amount: number }[]; groups?: Settlement[] } } | null)?.register,
      d.original_filename ?? "Settlement report",
    ),
  );
  const gateway = settlements.length
    ? gatewayGrossUp(revenueTxns.map((t) => ({ id: t.id, amount: t.amount, txn_date: t.txn_date })), settlements)
    : { fees: 0, tax: 0, matches: [] as { txn_id: string; settlement: string; fee: number; tax: number }[] };
  const gatewayCost = round2(gateway.fees + gateway.tax);
  const high = matched.filter((t) => t.amount >= 100_000);
  const n = figures.numbers;
  const bankSummary: BankSummaryRow[] = [];
  const push = (
    key: string,
    label: string,
    value: number,
    unit: "inr" | "count",
    list: NarrateTxn[],
  ) =>
    bankSummary.push({
      key,
      label,
      value,
      unit,
      rows: inrRows(list),
      txn_ids: list.map((t) => t.id),
    });

  if (
    template === "Monthly MIS" ||
    template === "Working Paper" ||
    template === "Key Variances"
  ) {
    push(
      "total_receipts",
      "Credits in bank",
      n.total_receipts.value,
      "inr",
      ins,
    );
    push(
      "total_payments",
      "Debits in bank",
      n.total_payments.value,
      "inr",
      outs,
    );
    push(
      "high_value",
      "High value lines above one lakh",
      high.length,
      "count",
      high,
    );
    if (n.closing_balance)
      push(
        "closing_balance",
        n.closing_balance.label,
        n.closing_balance.value,
        "inr",
        statement.filter((t) => n.closing_balance.txn_ids.includes(t.id)),
      );
  }
  if (template === "Bank Reconciliation Summary") {
    push(
      "matched_lines",
      "Bank lines matched to books",
      sumRupees(matched.map((t) => t.amount)),
      "inr",
      matched,
    );
    push(
      "unreconciled_in",
      "Unreconciled credits",
      sumRupees(
        unmatched.filter((t) => t.direction === "in").map((t) => t.amount),
      ),
      "inr",
      unmatched.filter((t) => t.direction === "in"),
    );
    push(
      "unreconciled_out",
      "Unreconciled debits",
      sumRupees(
        unmatched.filter((t) => t.direction === "out").map((t) => t.amount),
      ),
      "inr",
      unmatched.filter((t) => t.direction === "out"),
    );
    const excTxnIds = new Set(excRows.map((e) => e.txn_id));
    push(
      "open_exceptions",
      "Open exceptions",
      excRows.length,
      "count",
      statement.filter((t) => excTxnIds.has(t.id)),
    );
  }
  if (template === "Working Paper") {
    figures.receipts_by_party.slice(0, 15).forEach((p, i) =>
      push(
        `party_in_${i}`,
        `Receipts — ${p.party}`,
        p.total,
        "inr",
        ins.filter((t) => p.txn_ids.includes(t.id)),
      ),
    );
    figures.payments_by_party.slice(0, 15).forEach((p, i) =>
      push(
        `party_out_${i}`,
        `Payments — ${p.party}`,
        p.total,
        "inr",
        outs.filter((t) => p.txn_ids.includes(t.id)),
      ),
    );
  }
  if (template === "Exception and Review Summary") {
    for (const [label, count] of Object.entries(byReason)) {
      const ids = new Set(
        excRows
          .filter(
            (e) =>
              (REASON_LABELS[e.reason_code as ReasonCode] ?? e.reason_code) ===
              label,
          )
          .map((e) => e.txn_id),
      );
      push(
        `exceptions_${label}`,
        `Exceptions — ${label}`,
        count,
        "count",
        statement.filter((t) => ids.has(t.id)),
      );
    }
    bankSummary.push({
      key: "review_open",
      label: "Rows waiting in the Review Queue",
      value: reviewOpen.count ?? 0,
      unit: "count",
      rows: [],
      txn_ids: [],
    });
  }

  const inputHash = await sha256Hex(
    new TextEncoder().encode(
      matched
        .map((t) => `${t.id}:${t.amount}:${t.txn_date}:${t.direction}`)
        .sort()
        .join("|"),
    ),
  );
  const content = {
    template,
    period: { label: period.label, start: period.start, end: period.end },
    excluded: unmatched.length,
    revenue: round2(sumRupees(revenueTxns.map((t) => t.amount)) + gatewayCost),
    expenses: round2(sumRupees(expenseTxns.map((t) => t.amount)) + gatewayCost),
    gateway: gateway.matches.length
      ? { payouts: gateway.matches.length, fees: gateway.fees, gst_on_fees: gateway.tax, settlements: gateway.matches.map((m) => m.settlement) }
      : null,
    total_receipts: n.total_receipts.value,
    total_payments: n.total_payments.value,
    sources: { revenue: inrRows(revenueTxns), expenses: inrRows(expenseTxns) },
    other_flows: otherFlows,
    // Due dates that follow from this month's statutory payments (Indian rules, computed in code).
    statutory: statutoryDueDates(
      period.end,
      statement.filter((t) => t.direction === "out").map((t) => `${t.description ?? ""} ${t.counterparty ?? ""} ${t.category ?? ""}`),
    ),
    decisions,
    insights: insights.map((i) => ({
      text: i.text,
      source: i.source,
      cited_transaction_ids: i.cited_transaction_ids,
      confidence: i.confidence,
      origin: i.origin,
    })),
    variances: figures.variances.map((v) => ({
      key: v.key,
      label: v.label,
      current: v.current,
      prior: v.prior,
      change_pct: v.change_pct,
    })),
    bankSummary: bankSummary.map(({ txn_ids: _ids, ...rest }) => rest),
    summary_numbers: {
      ...figures.numbers,
      ...Object.fromEntries(
        bankSummary.map((b) => [
          `summary:${b.key}`,
          {
            key: `summary:${b.key}`,
            label: b.label,
            value: b.value,
            unit: b.unit,
            txn_ids: b.txn_ids,
          },
        ]),
      ),
      ...Object.fromEntries(
        figures.variances.flatMap((v) => [
          [
            `variance:${v.key}:current`,
            {
              key: `variance:${v.key}:current`,
              label: `${v.label} (${period.label})`,
              value: v.current,
              unit: "inr",
              txn_ids: v.current_txn_ids,
            },
          ],
          [
            `variance:${v.key}:prior`,
            {
              key: `variance:${v.key}:prior`,
              label: `${v.label} (${prev?.label ?? "prior"})`,
              value: v.prior,
              unit: "inr",
              txn_ids: v.prior_txn_ids,
            },
          ],
        ]),
      ),
    },
    schedules: {
      receipts_by_party: figures.receipts_by_party.slice(0, 50),
      payments_by_party: figures.payments_by_party.slice(0, 50),
      by_category: figures.by_category,
    },
    exceptions_summary: { open: excRows.length, by_reason: byReason },
    review_open: reviewOpen.count ?? 0,
    warnings,
    footer: "All numbers are derived from matched transactions only.",
    ai: aiMeta,
    generated_at: new Date().toISOString(),
  };

  const { data: report, error } = await db
    .from("ca_reports_log")
    .insert({
      ca_firm_id: ctx.firmId,
      business_id: businessId,
      report_type: template,
      report_name: `${template} — ${period.label}`,
      period: period.label,
      period_start: period.start,
      period_end: period.end,
      status: "generated",
      generated_by_user_id: ctx.userId,
      content,
      input_hash: inputHash,
    })
    .select("id, created_at")
    .single();
  if (error) throw new PracticeError("db_error", error.message);
  if (aiCall)
    await db
      .from("ca_ai_calls")
      .insert({ ...aiCall, ca_firm_id: ctx.firmId, report_id: report.id });

  const meta = clientMeta(client.notes);
  await db
    .from("ca_clients")
    .update({
      notes: JSON.stringify({
        ...meta,
        lastMis: new Date().toISOString().slice(0, 10),
      }),
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", client.id);
  await logActivity(
    db,
    ctx.firmId,
    businessId,
    "narrate",
    `${template} generated for ${period.label} from ${matched.length} matched transactions${unmatched.length ? ` (${unmatched.length} unreconciled lines excluded)` : ""}.`,
  );
  return {
    id: report.id,
    created_at: report.created_at,
    business_id: businessId,
    period: period.label,
    template,
    content,
  };
}

/** The transactions behind one figure of a report (paginated). */
export async function numberSources(
  db: Db,
  ctx: FirmContext,
  reportId: string,
  key: string,
  page = 0,
  pageSize = 50,
) {
  const { data: report } = await db
    .from("ca_reports_log")
    .select("id, content")
    .eq("id", reportId)
    .eq("ca_firm_id", ctx.firmId)
    .maybeSingle();
  if (!report) throw new PracticeError("not_found", "Report not found.");
  const numbers =
    (
      (report.content ?? {}) as {
        summary_numbers?: Record<
          string,
          { label: string; value: number; unit: string; txn_ids: string[] }
        >;
      }
    ).summary_numbers ?? {};
  const figure = numbers[key] ?? numbers[`summary:${key}`];
  if (!figure)
    throw new PracticeError("not_found", `No figure "${key}" in this report.`);
  const ids = figure.txn_ids ?? [];
  const slice = ids.slice(page * pageSize, (page + 1) * pageSize);
  const { data: txns } = slice.length
    ? await db
        .from("ca_txns")
        .select(
          "id, side, direction, amount, txn_date, counterparty, reference, description, category, extraction_id, row_index, raw_text",
        )
        .in("id", slice)
    : { data: [] };
  const order = new Map(slice.map((id, i) => [id, i]));
  const rows = (txns ?? [])
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map((t) => ({
      ...t,
      amount: Number(t.amount),
      signed_amount: signedAmount({
        amount: Number(t.amount),
        direction: t.direction,
      }),
    }));
  return {
    key,
    label: figure.label,
    value: figure.value,
    unit: figure.unit,
    total_transactions: ids.length,
    page,
    page_size: pageSize,
    transactions: rows,
    missing: slice.length - rows.length,
  };
}

export async function signOffReport(
  db: Db,
  ctx: FirmContext,
  reportId: string,
  by: string,
  note?: string,
  opts: { acknowledgeOpen?: boolean } = {},
) {
  if (!canSignOff(ctx))
    throw new PracticeError(
      "forbidden",
      "Only a partner or admin can sign off an MIS.",
    );
  const { data } = await db
    .from("ca_reports_log")
    .select("id, business_id, content, report_type, period")
    .eq("id", reportId)
    .eq("ca_firm_id", ctx.firmId)
    .maybeSingle();
  if (!data) throw new PracticeError("not_found", "Report not found.");
  // Open work in the period is never signed off silently.
  const p = (data.content as { period?: { start?: string; end?: string } } | null)?.period;
  let open = { exceptions: 0, review: 0, unmatched: 0 };
  if (p?.start && p?.end && data.business_id) {
    const [ex, rv, um] = await Promise.all([
      db.from("ca_exceptions").select("id", { count: "exact", head: true }).eq("ca_firm_id", ctx.firmId).eq("business_id", data.business_id).eq("status", "open").gte("period_start", p.start).lte("period_end", p.end),
      db.from("ca_review_items").select("id", { count: "exact", head: true }).eq("ca_firm_id", ctx.firmId).eq("business_id", data.business_id).eq("status", "open"),
      db.from("ca_txns").select("id", { count: "exact", head: true }).eq("ca_firm_id", ctx.firmId).eq("business_id", data.business_id).eq("side", "bank").in("match_status", ["unmatched", "exception"]).gte("txn_date", p.start).lte("txn_date", p.end),
    ]);
    open = { exceptions: ex.count ?? 0, review: rv.count ?? 0, unmatched: um.count ?? 0 };
  }
  const openTotal = open.exceptions + open.review + open.unmatched;
  // A correction the partner asked for is either marked done or overridden with a reason.
  const pendingCorrection = (data.content as { correction?: { note?: string; resolved_at?: string | null } | null } | null)?.correction;
  if (pendingCorrection?.note && !pendingCorrection.resolved_at && !(opts.acknowledgeOpen && note?.trim()))
    throw new PracticeError(
      "needs_confirmation",
      `A correction request is still open: "${pendingCorrection.note}". Mark it corrected, or sign off with a note saying why it no longer applies.`,
    );
  if (openTotal > 0 && !opts.acknowledgeOpen)
    throw new PracticeError(
      "needs_confirmation",
      `Not signed off: ${[
        open.exceptions && `${open.exceptions} open exception${open.exceptions === 1 ? "" : "s"}`,
        open.review && `${open.review} row${open.review === 1 ? "" : "s"} in the Review Queue`,
        open.unmatched && `${open.unmatched} unreconciled bank line${open.unmatched === 1 ? "" : "s"}`,
      ].filter(Boolean).join(", ")}. Clear them, or confirm that you are signing off with them left out.`,
    );
  const content = {
    ...((data.content ?? {}) as Record<string, unknown>),
    signedOffBy: by,
    signOffNote: note ?? null,
    signedOffWithOpen: openTotal > 0 ? open : null,
    correction: null,
    // The request stays on record with how it ended.
    corrections_history: [
      ...(((data.content as { corrections_history?: unknown[] } | null)?.corrections_history as unknown[]) ?? []),
      ...(pendingCorrection?.note ? [{ ...pendingCorrection, closed_by_signoff: !pendingCorrection.resolved_at, signoff_note: note ?? null }] : []),
    ],
  };
  await db
    .from("ca_reports_log")
    .update({
      signed_off_by: ctx.userId,
      signed_off_at: new Date().toISOString(),
      status: "signed_off",
      content,
    })
    .eq("id", reportId);
  await logActivity(
    db,
    ctx.firmId,
    data.business_id,
    "narrate",
    `${by} signed off the ${data.report_type} for ${data.period}.`,
  );
  return { ok: true };
}

export async function requestCorrection(
  db: Db,
  ctx: FirmContext,
  reportId: string,
  note: string,
) {
  const { data } = await db
    .from("ca_reports_log")
    .select("id, business_id, content, report_type, period")
    .eq("id", reportId)
    .eq("ca_firm_id", ctx.firmId)
    .maybeSingle();
  if (!data) throw new PracticeError("not_found", "Report not found.");
  const byName = await personName(db, ctx.userId);
  const content = {
    ...((data.content ?? {}) as Record<string, unknown>),
    correction: {
      note,
      at: new Date().toISOString().slice(0, 10),
      by: ctx.userId,
      by_name: byName,
      resolved_at: null,
    },
  };
  await db
    .from("ca_reports_log")
    .update({
      signed_off_by: null,
      signed_off_at: null,
      status: "correction_requested",
      content,
    })
    .eq("id", reportId);
  await logActivity(
    db,
    ctx.firmId,
    data.business_id,
    "narrate",
    `${byName} asked for a correction on the ${data.report_type} for ${data.period}: ${note}`,
  );
  return { ok: true };
}

/** Someone on the team says the requested correction is done; the partner can sign off again. */
export async function markCorrected(db: Db, ctx: FirmContext, reportId: string, what?: string) {
  const { data } = await db
    .from("ca_reports_log")
    .select("id, business_id, content, report_type, period")
    .eq("id", reportId)
    .eq("ca_firm_id", ctx.firmId)
    .maybeSingle();
  if (!data) throw new PracticeError("not_found", "Report not found.");
  const c = (data.content ?? {}) as Record<string, unknown> & { correction?: Record<string, unknown> | null };
  if (!c.correction?.note) return { ok: true };
  const byName = await personName(db, ctx.userId);
  await db
    .from("ca_reports_log")
    .update({
      status: "ready_for_review",
      content: { ...c, correction: { ...c.correction, resolved_at: new Date().toISOString(), resolved_by: ctx.userId, resolved_by_name: byName, resolution: what?.trim() || null } },
    })
    .eq("id", reportId);
  await logActivity(
    db,
    ctx.firmId,
    data.business_id,
    "narrate",
    `${byName} marked the correction on the ${data.report_type} for ${data.period} as done${what?.trim() ? `: ${what.trim()}` : ""}. Ready for the partner to sign off.`,
  );
  return { ok: true };
}

async function personName(db: Db, userId: string): Promise<string> {
  try {
    const { data } = await db.auth.admin.getUserById(userId);
    return String((data?.user?.user_metadata as { full_name?: string } | undefined)?.full_name || data?.user?.email || "Someone");
  } catch {
    return "Someone";
  }
}

/**
 * For each matched bank line, the book entries it was matched to: their
 * party (ledger) name and the words that say what kind of entry it is.
 */
async function bookSideOf(db: Db, firmId: string, bankIds: string[]): Promise<Map<string, { party: string; text: string }>> {
  const out = new Map<string, { party: string; text: string }>();
  if (!bankIds.length) return out;
  const matches: { bank_txn_id: string; book_txn_ids: string[] }[] = [];
  for (let i = 0; i < bankIds.length; i += 300) {
    const { data } = await db
      .from("ca_recon_matches")
      .select("bank_txn_id, book_txn_ids")
      .eq("ca_firm_id", firmId)
      .eq("status", "active")
      .in("bank_txn_id", bankIds.slice(i, i + 300));
    matches.push(...((data ?? []) as typeof matches));
  }
  const bookIds = [...new Set(matches.flatMap((m) => m.book_txn_ids ?? []))];
  const book = new Map<string, { counterparty: string | null; description: string | null; category: string | null }>();
  for (let i = 0; i < bookIds.length; i += 300) {
    const { data } = await db.from("ca_txns").select("id, counterparty, description, category").in("id", bookIds.slice(i, i + 300));
    for (const r of data ?? []) book.set(r.id as string, r as never);
  }
  for (const m of matches) {
    const rows = (m.book_txn_ids ?? []).map((id) => book.get(id)).filter(Boolean) as { counterparty: string | null; description: string | null; category: string | null }[];
    if (!rows.length) continue;
    // Tally ledgers carry the party in Particulars, which lands in description.
    const nameOf = (r: (typeof rows)[number]) => {
      const cp = (r.counterparty ?? "").trim();
      if (cp) return cp;
      const d = (r.description ?? "").trim();
      return d && d.length <= 60 && !/\d{6,}/.test(d) ? d : "";
    };
    const parties = [...new Set(rows.map(nameOf).filter(Boolean))];
    // One party across the entries: show it.
    const party = parties.length === 1 && !/^(cash|bank|sundry)$/i.test(parties[0]) ? parties[0] : "";
    const text = rows.map((r) => `${r.counterparty ?? ""} ${r.description ?? ""} ${r.category ?? ""}`).join(" ");
    out.set(m.bank_txn_id, { party, text });
  }
  return out;
}
