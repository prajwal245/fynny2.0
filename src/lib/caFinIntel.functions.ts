import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEFAULT_COA, computeDataQuality, periodBounds, type DqTxn } from "./caFinIntel.server";

export interface FinIntelInput {
  firm_id: string;
  business_id: string;
  period?: string;
}

export interface SeedCoaResult {
  created: number;
  skipped: number;
}

export interface DataQualityResult {
  run_id: string;
  total_records: number;
  completeness_score: number;
  duplicate_count: number;
  anomaly_count: number;
  missing_field_count: number;
  issue_count: number;
}

async function assertAccess(
  sb: { from: (t: string) => any },
  userId: string,
  firmId: string,
  businessId: string,
) {
  const { data: member } = await sb
    .from("ca_firm_members").select("id").eq("ca_firm_id", firmId).eq("user_id", userId).maybeSingle();
  if (!member) throw new Error("Access denied. You are not a member of this firm.");
  const { data: access } = await sb
    .from("ca_client_access").select("id")
    .eq("ca_firm_id", firmId).eq("business_id", businessId).eq("is_active", true).maybeSingle();
  if (!access) throw new Error("Access denied. This client is not in your portfolio.");
}

/** Seeds the Schedule III aligned chart of accounts for one client. */
export const seedChartOfAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: FinIntelInput) => {
    if (!input?.firm_id || !input?.business_id) throw new Error("firm_id and business_id are required");
    return input;
  })
  .handler(async ({ data, context }): Promise<SeedCoaResult> => {
    const { supabase, userId } = context;
    await assertAccess(supabase as never, userId, data.firm_id, data.business_id);

    const { data: existing } = await supabase
      .from("ca_ledger_accounts").select("id, code")
      .eq("ca_firm_id", data.firm_id).eq("business_id", data.business_id);
    const have = new Set(((existing ?? []) as { code: string }[]).map((r) => r.code));

    const idByCode = new Map<string, string>();
    for (const row of (existing ?? []) as { id: string; code: string }[]) idByCode.set(row.code, row.id);

    let created = 0;
    // Two passes so parents exist before children.
    for (const pass of [0, 1]) {
      const batch = DEFAULT_COA.filter((a) => (pass === 0 ? a.parent_code === null : a.parent_code !== null))
        .filter((a) => !have.has(a.code));
      for (const a of batch) {
        const { data: ins, error } = await supabase
          .from("ca_ledger_accounts")
          .insert({
            ca_firm_id: data.firm_id,
            business_id: data.business_id,
            code: a.code,
            name: a.name,
            account_type: a.account_type,
            is_group: a.is_group,
            parent_id: a.parent_code ? idByCode.get(a.parent_code) ?? null : null,
          })
          .select("id, code")
          .maybeSingle();
        if (error) continue;
        if (ins) {
          idByCode.set((ins as { code: string }).code, (ins as { id: string }).id);
          created += 1;
        }
      }
      // Second pass may reference codes created in the same pass (level 3).
      if (pass === 1) {
        for (const a of DEFAULT_COA.filter((x) => x.parent_code)) {
          const id = idByCode.get(a.code);
          const parentId = a.parent_code ? idByCode.get(a.parent_code) : null;
          if (id && parentId) {
            await supabase.from("ca_ledger_accounts").update({ parent_id: parentId }).eq("id", id);
          }
        }
      }
    }

    return { created, skipped: DEFAULT_COA.length - created };
  });

/** Runs the data quality engine over one client's transactions for a period. */
export const runDataQualityScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: FinIntelInput) => {
    if (!input?.firm_id || !input?.business_id) throw new Error("firm_id and business_id are required");
    if (!input.period || !/^\d{4}-\d{2}$/.test(input.period)) throw new Error("period must be YYYY-MM");
    return input;
  })
  .handler(async ({ data, context }): Promise<DataQualityResult> => {
    const { supabase, userId } = context;
    await assertAccess(supabase as never, userId, data.firm_id, data.business_id);
    const period = data.period as string;
    const { start, end } = periodBounds(period);

    const { data: txnRows, error: txnErr } = await supabase
      .from("bank_transactions")
      .select("id, date, description, category, amount, type, source_reference")
      .eq("business_id", data.business_id)
      .gte("date", start)
      .lte("date", end)
      .order("date", { ascending: true })
      .limit(5000);
    if (txnErr) throw new Error(txnErr.message);

    const result = computeDataQuality((txnRows ?? []) as unknown as DqTxn[], period);

    const { data: run, error: runErr } = await supabase
      .from("ca_data_quality_runs")
      .insert({
        ca_firm_id: data.firm_id,
        business_id: data.business_id,
        period,
        total_records: result.total_records,
        completeness_score: result.completeness_score,
        duplicate_count: result.duplicate_count,
        anomaly_count: result.anomaly_count,
        missing_field_count: result.missing_field_count,
        summary: result.summary as never,
        created_by: userId,
      })
      .select("id")
      .single();
    if (runErr) throw new Error(runErr.message);

    const runId = (run as { id: string }).id;
    if (result.issues.length) {
      const rows = result.issues.slice(0, 500).map((i) => ({
        run_id: runId,
        ca_firm_id: data.firm_id,
        business_id: data.business_id,
        issue_type: i.issue_type,
        severity: i.severity,
        entity_type: i.entity_type,
        entity_id: i.entity_id,
        description: i.description,
        detail: i.detail as never,
      }));
      await supabase.from("ca_data_quality_issues").insert(rows as never);
    }

    await supabase.from("ca_audit_events").insert({
      ca_firm_id: data.firm_id,
      business_id: data.business_id,
      actor_id: userId,
      entity_type: "data_quality_run",
      entity_id: runId,
      action: "data_quality_scan",
      detail: {
        period,
        completeness_score: result.completeness_score,
        duplicates: result.duplicate_count,
        anomalies: result.anomaly_count,
      } as never,
    } as never);

    return {
      run_id: runId,
      total_records: result.total_records,
      completeness_score: result.completeness_score,
      duplicate_count: result.duplicate_count,
      anomaly_count: result.anomaly_count,
      missing_field_count: result.missing_field_count,
      issue_count: result.issues.length,
    };
  });
