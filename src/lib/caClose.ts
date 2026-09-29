/**
 * Month-end close engine.
 *
 * A close period is only as trustworthy as the evidence behind it, so the
 * readiness score is computed from live ledger state — never stored and
 * never guessed. Each check knows how to count its own blockers and links
 * back to the module where they get cleared.
 */
import { supabase } from "@/integrations/supabase/client";
import { logCAAudit } from "@/lib/caAudit";

export interface CloseCheck {
  key: string;
  label: string;
  hint: string;
  /** Where the blockers get cleared. */
  route: string;
  weight: number;
  blockers: number;
  passed: boolean;
}

export interface CloseReadiness {
  period: string;
  checks: CloseCheck[];
  score: number;
  blockers: number;
  /** False when the period holds no bank lines, invoices or expenses at all —
   *  a silent month scores 100% on every check, which would otherwise let a
   *  firm sign off a period whose books were simply never loaded. */
  hasActivity: boolean;
}


/**
 * A client is close-ready when all four conditions hold. The same definition
 * is used by the close module so the portfolio count and the per-client view
 * never disagree.
 */
export async function isCloseReady(firmId: string, businessId: string): Promise<boolean> {
  const head = { count: "exact" as const, head: true };
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date();
  monthStart.setDate(1);
  const from = monthStart.toISOString().slice(0, 10);

  const [overdue, bankLines, itcMatched, mis] = await Promise.all([
    supabase.from("ca_compliance_events").select("id", head).eq("business_id", businessId).neq("status", "filed").lt("due_date", today),
    supabase.from("bank_transactions").select("id", head).eq("business_id", businessId).gte("date", from),
    supabase.from("ca_itc_records").select("id", head).eq("ca_firm_id", firmId).eq("business_id", businessId).eq("match_status", "matched"),
    supabase.from("ca_reports_log").select("id", head).eq("ca_firm_id", firmId).eq("business_id", businessId).gte("created_at", `${from}T00:00:00Z`),
  ]);

  return (
    (overdue.count ?? 0) === 0 &&
    (bankLines.count ?? 0) > 0 &&
    (itcMatched.count ?? 0) > 0 &&
    (mis.count ?? 0) > 0
  );
}

/** First and last instant of a YYYY-MM period, as ISO dates. */
export function periodRange(period: string): { from: string; to: string } {
  const [y, m] = period.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Last 12 periods, most recent first, excluding the current incomplete month. */
export function recentPeriods(count = 12): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 1; i <= count; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

const countOf = async (p: PromiseLike<{ count: number | null }>) => (await p).count ?? 0;

/**
 * Runs every close check for one client and period. All counts are scoped to
 * the client, so a member who cannot see the client gets zeros from RLS
 * rather than another firm's numbers.
 */
export async function computeReadiness(
  firmId: string,
  businessId: string,
  period: string,
): Promise<CloseReadiness> {
  const { from, to } = periodRange(period);
  const head = { count: "exact" as const, head: true };

  const activityOf = async (table: "bank_transactions" | "invoices" | "expenses", dateCol: string) =>
    countOf(
      supabase
        .from(table)
        .select("id", head)
        .eq("business_id", businessId)
        .gte(dateCol, from)
        .lte(dateCol, to),
    );

  const [unreconciled, exceptions, pendingReview, openRequests, unpaidInvoices, uncategorised] = await Promise.all([
    countOf(
      supabase
        .from("bank_transactions")
        .select("id", head)
        .eq("business_id", businessId)
        .gte("date", from)
        .lte("date", to)
        .eq("reconciled", false),
    ),
    countOf(
      supabase
        .from("ca_exceptions")
        .select("id", head)
        .eq("ca_firm_id", firmId)
        .eq("business_id", businessId)
        .neq("status", "resolved"),
    ),
    countOf(
      supabase
        .from("ca_document_extractions")
        .select("id", head)
        .eq("ca_firm_id", firmId)
        .eq("business_id", businessId)
        .in("status", ["pending", "needs_review", "reviewed"]),
    ),
    countOf(
      supabase
        .from("ca_document_requests")
        .select("id", head)
        .eq("ca_firm_id", firmId)
        .eq("business_id", businessId)
        .neq("status", "fulfilled"),
    ),
    countOf(
      supabase
        .from("invoices")
        .select("id", head)
        .eq("business_id", businessId)
        .gte("invoice_date", from)
        .lte("invoice_date", to)
        .neq("status", "paid"),
    ),
    countOf(
      supabase
        .from("expenses")
        .select("id", head)
        .eq("business_id", businessId)
        .gte("date", from)
        .lte("date", to)
        .is("category", null),
    ),
  ]);

  const checks: CloseCheck[] = [
    {
      key: "bank_reconciled",
      label: "Bank fully reconciled",
      hint: "Every bank line in the period is matched to an invoice, bill or journal.",
      route: "/ca/reconciliation",
      weight: 30,
      blockers: unreconciled,
      passed: unreconciled === 0,
    },
    {
      key: "exceptions_cleared",
      label: "Exceptions cleared",
      hint: "No unresolved exceptions left in the queue for this client.",
      route: "/ca/exceptions",
      weight: 20,
      blockers: exceptions,
      passed: exceptions === 0,
    },
    {
      key: "review_queue_empty",
      label: "Review queue empty",
      hint: "Every extracted document has been posted to the ledger or rejected.",
      route: "/ca/intake/review",
      weight: 20,
      blockers: pendingReview,
      passed: pendingReview === 0,
    },
    {
      key: "requests_fulfilled",
      label: "Document requests fulfilled",
      hint: "The client has supplied everything the firm asked for.",
      route: "/ca/intake/requests",
      weight: 10,
      blockers: openRequests,
      passed: openRequests === 0,
    },
    {
      key: "expenses_categorised",
      label: "Expenses categorised",
      hint: "No expense in the period is missing a ledger head.",
      route: "/ca/intake/review",
      weight: 10,
      blockers: uncategorised,
      passed: uncategorised === 0,
    },
    {
      key: "receivables_reviewed",
      label: "Open receivables reviewed",
      hint: "Invoices still unpaid at period end — informational, does not block sign-off.",
      route: "/ca/reconciliation",
      weight: 10,
      blockers: unpaidInvoices,
      passed: true,
    },
  ];

  const earned = checks.reduce((s, c) => s + (c.passed ? c.weight : 0), 0);
  const total = checks.reduce((s, c) => s + c.weight, 0);

  const [bankLines, invoiceLines, expenseLines] = await Promise.all([
    activityOf("bank_transactions", "date"),
    activityOf("invoices", "invoice_date"),
    activityOf("expenses", "date"),
  ]);

  return {
    period,
    checks,
    score: Math.round((earned / total) * 100),
    blockers: checks.filter((c) => !c.passed).reduce((s, c) => s + c.blockers, 0),
    hasActivity: bankLines + invoiceLines + expenseLines > 0,
  };

}

export interface ClosePeriodRow {
  id: string;
  business_id: string;
  period: string;
  status: string;
  readiness_score: number;
  checklist: unknown;
  signed_off_at: string | null;
  signed_off_by: string | null;
}

/** Creates the period row if it does not exist yet, then refreshes its score. */
export async function saveReadiness(
  firmId: string,
  businessId: string,
  readiness: CloseReadiness,
): Promise<ClosePeriodRow | null> {
  const { data, error } = await supabase
    .from("ca_close_periods")
    .upsert(
      {
        ca_firm_id: firmId,
        business_id: businessId,
        period: readiness.period,
        readiness_score: readiness.score,
        checklist: readiness.checks as never,
      },
      { onConflict: "ca_firm_id,business_id,period" },
    )
    .select("id, business_id, period, status, readiness_score, checklist, signed_off_at, signed_off_by")
    .single();
  if (error) throw error;
  return data as ClosePeriodRow;
}

/**
 * Locks a period. Refuses when a blocking check still fails, so a clean
 * sign-off always means the evidence was actually there.
 */
export async function signOffPeriod(
  firmId: string,
  businessId: string,
  readiness: CloseReadiness,
  actorRole: string | null,
): Promise<{ ok: boolean; reason?: string }> {
  if (!readiness.hasActivity) {
    return { ok: false, reason: "No bank lines, invoices or expenses recorded in this period" };
  }
  const blocking = readiness.checks.filter((c) => !c.passed);
  if (blocking.length) {
    return { ok: false, reason: `${blocking.length} check${blocking.length > 1 ? "s" : ""} still open` };
  }


  const row = await saveReadiness(firmId, businessId, readiness);
  const { data: userRes } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("ca_close_periods")
    .update({
      status: "signed_off",
      signed_off_at: new Date().toISOString(),
      signed_off_by: userRes?.user?.id ?? null,
    })
    .eq("id", row!.id);
  if (error) return { ok: false, reason: error.message };

  await logCAAudit({
    firmId,
    businessId,
    entityType: "close_period",
    entityId: row!.id,
    action: "close_signed_off",
    actorRole,
    detail: { period: readiness.period, score: readiness.score },
  });
  return { ok: true };
}

/** Re-opens a signed-off period, always leaving a trace of who did it. */
export async function reopenPeriod(
  firmId: string,
  businessId: string,
  periodId: string,
  period: string,
  actorRole: string | null,
): Promise<string | null> {
  const { error } = await supabase
    .from("ca_close_periods")
    .update({ status: "open", signed_off_at: null, signed_off_by: null })
    .eq("id", periodId);
  if (error) return error.message;
  await logCAAudit({
    firmId,
    businessId,
    entityType: "close_period",
    entityId: periodId,
    action: "close_reopened",
    actorRole,
    detail: { period },
  });
  return null;
}
