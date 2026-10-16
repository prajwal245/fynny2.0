/**
 * What a firm used in a calendar billing month (India time): active clients
 * (a document processed or a reconciliation run for them that month) and
 * documents (one uploaded file each). Untouched and archived clients are free.
 */
import type { Db } from "../db.server";
import { PracticeError } from "../core";
import { accessFor, PLANS, type Access, type BillingRow, type Usage } from "./plans";

const IST_OFFSET = "+05:30";

/** "2026-10" for the month a moment falls in, in India time. */
export function billingMonth(now: Date = new Date()): string {
  const ist = new Date(now.getTime() + 5.5 * 3_600_000);
  return ist.toISOString().slice(0, 7);
}

export function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { start: new Date(`${month}-01T00:00:00${IST_OFFSET}`).toISOString(), end: new Date(`${next}-01T00:00:00${IST_OFFSET}`).toISOString() };
}

export interface MonthUsage extends Usage {
  month: string;
  activeIds: Set<string>;
}

export async function usageFor(db: Db, firmId: string, month: string = billingMonth()): Promise<MonthUsage> {
  const { start, end } = monthRange(month);
  const [docs, runs, docCount] = await Promise.all([
    db.from("ca_document_extractions").select("business_id").eq("ca_firm_id", firmId).gte("created_at", start).lt("created_at", end).not("business_id", "is", null).limit(20000),
    db.from("ca_agent_runs").select("business_id").eq("ca_firm_id", firmId).eq("agent", "recon").gte("started_at", start).lt("started_at", end).not("business_id", "is", null).limit(20000),
    db.from("ca_document_extractions").select("id", { count: "exact", head: true }).eq("ca_firm_id", firmId).gte("created_at", start).lt("created_at", end),
  ]);
  const activeIds = new Set<string>();
  for (const r of [...(docs.data ?? []), ...(runs.data ?? [])]) if (r.business_id) activeIds.add(String(r.business_id));
  return { month, activeClients: activeIds.size, documents: docCount.count ?? 0, activeIds };
}

/**
 * Throws before new work that the firm's limits do not cover: the trial's 5
 * active clients and 200 documents, and Essential's 25 active clients. Work
 * for a client already active this month is always allowed, and the paid
 * plans' document allowance is a soft limit that never blocks.
 */
export async function assertUsageRoom(
  db: Db,
  firmId: string,
  billing: BillingRow,
  work: { businessId: string | null; newDocument: boolean },
  access: Access = accessFor(billing),
): Promise<void> {
  if (access.maxActiveClients == null && access.maxDocuments == null) return;
  const u = await usageFor(db, firmId);
  const trial = access.state === "trial";
  if (work.newDocument && access.maxDocuments != null && u.documents >= access.maxDocuments)
    throw new PracticeError(
      "usage_limit",
      `The free trial covers ${access.maxDocuments} documents. Choose a plan in Settings, Billing to keep uploading; nothing you have done is lost.`,
    );
  if (work.businessId && access.maxActiveClients != null && !u.activeIds.has(work.businessId) && u.activeClients >= access.maxActiveClients)
    throw new PracticeError(
      "usage_limit",
      trial
        ? `The free trial covers ${access.maxActiveClients} active clients a month. Choose a plan in Settings, Billing to work on more clients.`
        : `${PLANS[billing.plan].name} covers up to ${access.maxActiveClients} active clients a month. Move to Firm in Settings, Billing to work on more.`,
    );
}
