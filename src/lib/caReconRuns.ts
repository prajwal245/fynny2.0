/**
 * Reconciliation run history — every bank or ITC reconciliation writes one row
 * so a CA can see how a client's match rate moved over time.
 */
import { supabase } from "@/integrations/supabase/client";

export interface ReconRunInput {
  firmId: string;
  businessId: string;
  reconType: "bank" | "itc" | "three_way";
  period: string;
  totalItems: number;
  matched: number;
  mismatched: number;
  unmatched: number;
  totalMatchedValue: number;
  totalAtRisk: number;
  snapshot?: Record<string, unknown>;
}

export interface ReconRun {
  id: string;
  recon_type: string;
  period: string;
  run_at: string;
  total_items: number;
  matched: number;
  mismatched: number;
  unmatched: number;
  total_matched_value: number;
  total_at_risk: number;
  snapshot: Record<string, unknown> | null;
}

export async function logReconRun(input: ReconRunInput): Promise<{ ok: boolean; error?: string }> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("ca_recon_runs").insert({
    ca_firm_id: input.firmId,
    business_id: input.businessId,
    recon_type: input.reconType,
    period: input.period,
    total_items: input.totalItems,
    matched: input.matched,
    mismatched: input.mismatched,
    unmatched: input.unmatched,
    total_matched_value: Math.round(input.totalMatchedValue * 100) / 100,
    total_at_risk: Math.round(input.totalAtRisk * 100) / 100,
    run_by: auth.user?.id ?? null,
    snapshot: (input.snapshot ?? {}) as never,
  });
  if (error) {
    console.warn("[fyn:ca] recon run log failed", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function loadReconRuns(firmId: string, businessId: string, limit = 25): Promise<ReconRun[]> {
  const { data, error } = await supabase
    .from("ca_recon_runs")
    .select("id, recon_type, period, run_at, total_items, matched, mismatched, unmatched, total_matched_value, total_at_risk, snapshot")
    .eq("ca_firm_id", firmId)
    .eq("business_id", businessId)
    .order("run_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("[fyn:ca] recon runs load failed", error.message);
    return [];
  }
  return (data ?? []) as unknown as ReconRun[];
}
