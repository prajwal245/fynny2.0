/**
 * Practice analytics.
 *
 * Every figure here is derived from rows the firm actually has: extraction
 * timestamps, exception ownership, engagement fees and compliance due dates.
 * Nothing is modelled or estimated — when there is no underlying data the
 * metric returns null so the UI can say "not enough data yet" instead of
 * printing a confident zero.
 */
import { supabase } from "@/integrations/supabase/client";

const DAY = 86_400_000;

export interface TurnaroundStat {
  /** Median hours from document received to posted to the ledger. */
  medianHours: number | null;
  /** Slowest of the posted documents, in hours. */
  worstHours: number | null;
  posted: number;
  awaitingReview: number;
  /** Documents received but still not posted after 7 days. */
  stale: number;
}

export interface StaffLoad {
  userId: string;
  name: string;
  open: number;
  resolved: number;
  /** Share of everything they touched that is now closed, 0-100. */
  clearanceRate: number | null;
  valueAtRisk: number;
}

export interface ClientEffort {
  businessId: string;
  name: string;
  annualFee: number;
  documents: number;
  exceptions: number;
  openTasks: number;
  /** Fee per document handled — the crudest but most honest effort signal. */
  feePerDocument: number | null;
}

export interface CapacityBucket {
  label: string;
  dueWithin: string;
  filings: number;
  overdue: number;
}

export interface PracticeAnalytics {
  turnaround: TurnaroundStat;
  staff: StaffLoad[];
  clients: ClientEffort[];
  capacity: CapacityBucket[];
  annualisedFees: number;
  clientsWithoutEngagement: number;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Annualised value of a fee given how often it is billed. */
export function annualise(fee: number | null, cycle: string | null): number {
  const f = Number(fee ?? 0);
  switch ((cycle ?? "").toLowerCase()) {
    case "monthly":
      return f * 12;
    case "quarterly":
      return f * 4;
    case "half_yearly":
      return f * 2;
    case "one_time":
      return 0;
    default:
      return f;
  }
}

export async function loadPracticeAnalytics(
  firmId: string,
  clientNames: Map<string, string>,
  memberNames: Map<string, string>,
): Promise<PracticeAnalytics> {
  const [extractionsRes, exceptionsRes, engagementsRes, tasksRes, complianceRes] = await Promise.all([
    supabase
      .from("ca_document_extractions")
      .select("id, business_id, created_at, posted_at, review_state")
      .eq("ca_firm_id", firmId)
      .limit(2000),
    supabase
      .from("ca_exceptions")
      .select("id, business_id, owner_id, resolved_by, status, amount")
      .eq("ca_firm_id", firmId)
      .limit(2000),
    supabase
      .from("ca_engagements")
      .select("business_id, fee_amount, billing_cycle, status")
      .eq("ca_firm_id", firmId)
      .limit(1000),
    supabase
      .from("ca_tasks")
      .select("id, business_id, status")
      .eq("ca_firm_id", firmId)
      .limit(2000),
    supabase
      .from("ca_compliance_events")
      .select("id, due_date, status")
      .eq("ca_firm_id", firmId)
      .limit(2000),
  ]);

  const extractions = extractionsRes.data ?? [];
  const exceptions = exceptionsRes.data ?? [];
  const engagements = engagementsRes.data ?? [];
  const tasks = tasksRes.data ?? [];
  const compliance = complianceRes.data ?? [];

  // ---- Turnaround -----------------------------------------------------
  const postedHours = extractions
    .filter((e) => e.posted_at)
    .map((e) => (new Date(e.posted_at as string).getTime() - new Date(e.created_at).getTime()) / 3_600_000)
    .filter((h) => Number.isFinite(h) && h >= 0);

  const turnaround: TurnaroundStat = {
    medianHours: median(postedHours),
    worstHours: postedHours.length ? Math.max(...postedHours) : null,
    posted: postedHours.length,
    awaitingReview: extractions.filter((e) => !e.posted_at && e.review_state !== "rejected").length,
    stale: extractions.filter(
      (e) => !e.posted_at && e.review_state !== "rejected" && Date.now() - new Date(e.created_at).getTime() > 7 * DAY,
    ).length,
  };

  // ---- Exception load per staff member --------------------------------
  const staffMap = new Map<string, StaffLoad>();
  const touch = (id: string) => {
    if (!staffMap.has(id)) {
      staffMap.set(id, {
        userId: id,
        name: memberNames.get(id) ?? "Unassigned",
        open: 0,
        resolved: 0,
        clearanceRate: null,
        valueAtRisk: 0,
      });
    }
    return staffMap.get(id)!;
  };

  for (const ex of exceptions) {
    const holder = ex.status === "resolved" ? (ex.resolved_by ?? ex.owner_id) : ex.owner_id;
    if (!holder) continue;
    const s = touch(holder);
    if (ex.status === "resolved") s.resolved += 1;
    else {
      s.open += 1;
      s.valueAtRisk += Number(ex.amount ?? 0);
    }
  }
  const staff = [...staffMap.values()]
    .map((s) => ({
      ...s,
      clearanceRate: s.open + s.resolved ? Math.round((s.resolved / (s.open + s.resolved)) * 100) : null,
    }))
    .sort((a, b) => b.open - a.open);

  // ---- Client effort vs fee -------------------------------------------
  const feeByClient = new Map<string, number>();
  for (const e of engagements) {
    if (e.status && e.status !== "active") continue;
    if (!e.business_id) continue;
    feeByClient.set(e.business_id, (feeByClient.get(e.business_id) ?? 0) + annualise(e.fee_amount, e.billing_cycle));
  }

  const countBy = <T extends { business_id: string | null }>(rows: T[], keep: (r: T) => boolean) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      if (!r.business_id || !keep(r)) continue;
      m.set(r.business_id, (m.get(r.business_id) ?? 0) + 1);
    }
    return m;
  };

  const docCount = countBy(extractions, () => true);
  const excCount = countBy(exceptions, (r) => r.status !== "resolved");
  const taskCount = countBy(tasks, (r) => r.status !== "done" && r.status !== "closed");

  const clients: ClientEffort[] = [...clientNames.entries()]
    .map(([businessId, name]) => {
      const documents = docCount.get(businessId) ?? 0;
      const annualFee = feeByClient.get(businessId) ?? 0;
      return {
        businessId,
        name,
        annualFee,
        documents,
        exceptions: excCount.get(businessId) ?? 0,
        openTasks: taskCount.get(businessId) ?? 0,
        feePerDocument: documents && annualFee ? Math.round(annualFee / documents) : null,
      };
    })
    .sort((a, b) => b.annualFee - a.annualFee);

  // ---- Capacity ahead of filing season --------------------------------
  const today = new Date();
  const startOfDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())).getTime();
  const pending = compliance.filter((c) => c.status !== "filed" && c.status !== "completed");
  const inWindow = (days: number) =>
    pending.filter((c) => {
      if (!c.due_date) return false;
      const diff = new Date(c.due_date).getTime() - startOfDay;
      return diff >= 0 && diff <= days * DAY;
    }).length;
  const overdueCount = pending.filter((c) => c.due_date && new Date(c.due_date).getTime() < startOfDay).length;

  const capacity: CapacityBucket[] = [
    { label: "This week", dueWithin: "7 days", filings: inWindow(7), overdue: 0 },
    { label: "This month", dueWithin: "30 days", filings: inWindow(30), overdue: 0 },
    { label: "Next quarter", dueWithin: "90 days", filings: inWindow(90), overdue: 0 },
    { label: "Already overdue", dueWithin: "past due", filings: overdueCount, overdue: overdueCount },
  ];

  const clientsWithEngagement = new Set(engagements.filter((e) => e.business_id).map((e) => e.business_id as string));

  return {
    turnaround,
    staff,
    clients,
    capacity,
    annualisedFees: [...feeByClient.values()].reduce((s, v) => s + v, 0),
    clientsWithoutEngagement: [...clientNames.keys()].filter((id) => !clientsWithEngagement.has(id)).length,
  };
}

/** Human-readable duration from a raw hour count. */
export function hours(h: number | null): string {
  if (h === null) return "—";
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${h.toFixed(1)} hrs`;
  return `${(h / 24).toFixed(1)} days`;
}
