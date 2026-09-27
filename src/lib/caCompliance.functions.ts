import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { RETURN_TYPES, prepareReturn, type CAReturnType, type ExtractionRow } from "./caAutoPrepare.server";

export interface AutoPrepareInput {
  firm_id: string;
  client_id?: string | null;
  business_id: string;
  return_type: string;
  period: string;
}

export interface AutoPrepareResult {
  working_paper_id: string;
  return_type: CAReturnType;
  period: string;
  totals: Record<string, number>;
  warnings: string[];
  doc_count: number;
}

/**
 * Auto-prepares a return (GSTR1 / GSTR3B / TDS_26Q / ITR) from posted document
 * extractions and stores it as a draft working paper. Runs as the signed-in
 * CA member: the `process` permission and portfolio access are both checked.
 */
export const autoPrepareReturn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: AutoPrepareInput) => {
    if (!input?.firm_id || !input?.business_id || !input?.period) {
      throw new Error("firm_id, business_id and period are required");
    }
    if (!RETURN_TYPES.includes(input.return_type as CAReturnType)) {
      throw new Error("Unsupported return_type");
    }
    return input;
  })
  .handler(async ({ data, context }): Promise<AutoPrepareResult> => {
    const { supabase, userId } = context;
    const returnType = data.return_type as CAReturnType;

    const { data: canProcess, error: permErr } = await supabase.rpc("ca_can", {
      _firm_id: data.firm_id,
      _permission: "process",
    });
    if (permErr || canProcess !== true) {
      throw new Error("Forbidden: your role cannot prepare returns");
    }

    const { data: access } = await supabase
      .from("ca_client_access")
      .select("id")
      .eq("ca_firm_id", data.firm_id)
      .eq("business_id", data.business_id)
      .eq("is_active", true)
      .maybeSingle();
    if (!access) throw new Error("Access denied. This client is not in your portfolio.");

    const { data: extractions, error: exErr } = await supabase
      .from("ca_document_extractions")
      .select("id, classification, confidence, original_filename, extracted, corrected")
      .eq("ca_firm_id", data.firm_id)
      .eq("business_id", data.business_id)
      .eq("review_state", "posted")
      .limit(5000);
    if (exErr) throw new Error(exErr.message);

    const prepared = prepareReturn((extractions ?? []) as unknown as ExtractionRow[], returnType, data.period);
    if (prepared.docCount === 0) {
      throw new Error("No posted documents found for this period");
    }

    const { data: paper, error: wpErr } = await supabase
      .from("ca_working_papers")
      .insert({
        ca_firm_id: data.firm_id,
        business_id: data.business_id,
        title: `${returnType} ${data.period} — Auto-Prepared`,
        paper_type: returnType,
        status: "draft",
        prepared_by: userId,
        content: {
          return_type: returnType,
          period: data.period,
          client_id: data.client_id ?? null,
          line_items: prepared.lineItems,
          totals: prepared.totals,
          prepared_from_doc_count: prepared.docCount,
          data_quality_warnings: prepared.warnings,
          prepared_at: new Date().toISOString(),
        } as never,
      })
      .select("id")
      .single();

    if (wpErr || !paper) throw new Error(wpErr?.message ?? "Failed to create working paper");

    await supabase.from("ca_audit_events").insert({
      ca_firm_id: data.firm_id,
      business_id: data.business_id,
      actor_id: userId,
      entity_type: "working_paper",
      entity_id: paper.id,
      action: "auto_prepare",
      detail: { return_type: returnType, period: data.period, doc_count: prepared.docCount, totals: prepared.totals } as never,
    });

    return {
      working_paper_id: paper.id,
      return_type: returnType,
      period: data.period,
      totals: prepared.totals,
      warnings: prepared.warnings,
      doc_count: prepared.docCount,
    };
  });
