/**
 * Admin view of one firm's real usage: sign-in, first extract, documents by outcome, recent errors,
 * team, AI cost, activity trail, and read-only access to the MIS reports it generated.
 * Every query is tolerant: a missing table or column leaves that part empty instead of failing the page.
 */
import { PracticeError } from "../practice/core";
import { audit, type AdminCtx } from "./security.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

async function safe<T>(run: () => PromiseLike<{ data: T | null; error: { message: string } | null }>, fallback: T): Promise<T> {
  try {
    const { data, error } = await run();
    return error || data == null ? fallback : data;
  } catch {
    return fallback;
  }
}
async function safeCount(run: () => PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> {
  try {
    const { count, error } = await run();
    return error ? 0 : count ?? 0;
  } catch {
    return 0;
  }
}

const tally = (rows: Row[], key: string) => {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = String(r[key] ?? "unknown");
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
};

export async function firmActivity(ctx: AdminCtx, firmId: string) {
  const { db } = ctx;
  const { data: firm } = await db.from("ca_firms").select("id, user_id, created_at").eq("id", firmId).maybeSingle();
  if (!firm) throw new PracticeError("not_found", "Firm not found.");
  const day = Date.now() - 86_400_000;
  const iso = (ms: number) => new Date(ms).toISOString();

  const DOC_COLS = "id, original_filename, extract_status, source_type, file_kind, row_count, txn_count, review_count, duplicate_count, error_message, created_at, extract_started_at, extract_finished_at, extract_attempts";
  const [docsNew, first, members, reports, ai, activity, openReview, txns] = await Promise.all([
    safe<Row[]>(() => db.from("ca_document_extractions").select(DOC_COLS).eq("ca_firm_id", firmId).order("created_at", { ascending: false }).limit(3000), []),
    safe<Row[]>(() => db.from("ca_document_extractions").select(DOC_COLS).eq("ca_firm_id", firmId).order("created_at", { ascending: true }).limit(1), []),
    safe<Row[]>(() => db.from("ca_firm_members").select("user_id, invited_email, role, status, created_at").eq("ca_firm_id", firmId).limit(100), []),
    safe<Row[]>(() => db.from("ca_reports_log").select("id, report_name, report_type, period, status, created_at, content").eq("ca_firm_id", firmId).order("created_at", { ascending: false }).limit(50), []),
    safe<Row[]>(() => db.from("ca_ai_calls").select("status, input_tokens, output_tokens, cost_usd, purpose, created_at").eq("ca_firm_id", firmId).gte("created_at", iso(Date.now() - 30 * 86_400_000)).limit(5000), []),
    safe<Row[]>(() => db.from("ca_activity_log").select("description, action_type, created_at").eq("ca_firm_id", firmId).order("created_at", { ascending: false }).limit(100), []),
    safeCount(() => db.from("ca_review_items").select("id", { count: "exact", head: true }).eq("ca_firm_id", firmId).eq("status", "open")),
    safeCount(() => db.from("ca_txns").select("id", { count: "exact", head: true }).eq("ca_firm_id", firmId)),
  ]);

  const userIds = [firm.user_id, ...members.map((m) => m.user_id)].filter(Boolean) as string[];
  const logins = userIds.length ? await safe<Row[]>(() => db.rpc("admin_user_logins", { ids: [...new Set(userIds)] }), []) : [];
  const lastIn = new Map(logins.map((l) => [String(l.user_id), (l.last_sign_in_at as string | null) ?? null]));

  const firstDoc = first[0] ?? null;
  const firstOk = [...docsNew].reverse().find((d) => ["parsed", "needs_review"].includes(String(d.extract_status))) ?? null;
  const hours = (a?: string | null, b?: string | null) => (a && b ? Math.round(((new Date(b).getTime() - new Date(a).getTime()) / 3_600_000) * 10) / 10 : null);
  const recent = (d: Row) => new Date(String(d.created_at)).getTime();
  const aiCost = ai.reduce((a, r) => a + Number(r.cost_usd ?? 0), 0);
  const lastTimes = [docsNew[0]?.created_at, activity[0]?.created_at, ...[...lastIn.values()]].filter(Boolean) as string[];

  return {
    signedUpAt: firm.created_at as string,
    lastActiveAt: lastTimes.sort().at(-1) ?? null,
    ownerLastSignIn: lastIn.get(String(firm.user_id)) ?? null,
    firstExtract: firstDoc
      ? {
          file: firstDoc.original_filename as string | null,
          status: firstDoc.extract_status as string | null,
          source: (firstDoc.source_type ?? firstDoc.file_kind ?? null) as string | null,
          at: firstDoc.created_at as string,
          hoursAfterSignup: hours(firm.created_at, firstDoc.created_at),
          error: (firstDoc.error_message ?? null) as string | null,
          rows: Number(firstDoc.row_count ?? 0),
          firstSuccessAt: (firstOk?.created_at ?? null) as string | null,
        }
      : null,
    documents: {
      total: docsNew.length,
      last24h: docsNew.filter((d) => recent(d) >= day).length,
      last7d: docsNew.filter((d) => recent(d) >= Date.now() - 7 * 86_400_000).length,
      byStatus: tally(docsNew, "extract_status"),
      bySource: tally(docsNew, "source_type"),
      transactions: txns,
      openReviewItems: openReview,
      /** The latest failures with the reason, so support can see what went wrong. */
      failures: docsNew
        .filter((d) => d.extract_status === "failed")
        .slice(0, 15)
        .map((d) => ({ id: d.id as string, file: d.original_filename as string | null, error: (d.error_message ?? null) as string | null, at: d.created_at as string, attempts: Number(d.extract_attempts ?? 0) })),
    },
    ai: {
      calls: ai.length,
      failed: ai.filter((r) => r.status === "error").length,
      tokensIn: ai.reduce((a, r) => a + Number(r.input_tokens ?? 0), 0),
      tokensOut: ai.reduce((a, r) => a + Number(r.output_tokens ?? 0), 0),
      costUsd: Math.round(aiCost * 1e6) / 1e6,
    },
    team: [
      { email: null as string | null, role: "owner", status: "active", lastSignIn: lastIn.get(String(firm.user_id)) ?? null },
      ...members.map((m) => ({ email: (m.invited_email ?? null) as string | null, role: String(m.role), status: String(m.status), lastSignIn: lastIn.get(String(m.user_id)) ?? null })),
    ],
    reports: reports.map((r) => ({ id: r.id as string, name: (r.report_name ?? r.report_type ?? "MIS") as string, period: (r.period ?? null) as string | null, status: (r.status ?? null) as string | null, createdAt: r.created_at as string, viewable: Boolean(r.content) })),
    activity: activity.map((a) => ({ at: a.created_at as string, type: (a.action_type ?? null) as string | null, text: a.description as string })),
  };
}

const num = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** One MIS report, read-only. Every view is written to the audit log. */
export async function firmReport(ctx: AdminCtx, firmId: string, reportId: string) {
  const { data, error } = await ctx.db
    .from("ca_reports_log")
    .select("id, report_name, report_type, period, status, created_at, content")
    .eq("id", reportId)
    .eq("ca_firm_id", firmId)
    .maybeSingle();
  if (error) throw new PracticeError("db_error", "The report could not be loaded. Try again.");
  if (!data) throw new PracticeError("not_found", "Report not found for this firm.");
  await audit(ctx, "firm.report_viewed", "ca_reports_log", reportId, { firmId, period: data.period ?? null });
  const c = (data.content ?? null) as Row | null;
  return {
    id: data.id as string,
    name: (data.report_name ?? data.report_type ?? "MIS") as string,
    period: (data.period ?? null) as string | null,
    createdAt: data.created_at as string,
    insights: Array.isArray(c?.["insights"]) ? (c!["insights"] as Row[]).map((i) => String(i["text"] ?? "")).filter(Boolean) : [],
    variances: Array.isArray(c?.["variances"]) ? (c!["variances"] as Row[]).slice(0, 30).map((v) => ({ label: String(v["label"] ?? ""), current: Number(v["current"] ?? 0), prior: Number(v["prior"] ?? 0), changePct: v["change_pct"] == null ? null : Number(v["change_pct"]) })) : [],
    warnings: Array.isArray(c?.["warnings"]) ? (c!["warnings"] as unknown[]).map(String).slice(0, 30) : [],
    totals: { revenue: num(c?.["revenue"]), expenses: num(c?.["expenses"]), receipts: num(c?.["total_receipts"]), payments: num(c?.["total_payments"]) },
  };
}
