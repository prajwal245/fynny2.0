import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  gstFilingPeriod,
  periodRange,
  priorPeriod,
  runAllChecks,
  type BankTxn,
  type ClientRow,
  type ItcRow,
  type WorkingPaperRow,
} from "./caDeductions.server";

export interface DetectDeductionsInput {
  firm_id: string;
  client_id?: string | null;
  business_id: string;
  /** "YYYY-MM" */
  period: string;
}

export interface DeductionFinding {
  id: string;
  provision: string;
  provision_label: string;
  estimated_benefit: number;
  confidence: string;
  explanation: string;
}

export interface DetectDeductionsResult {
  findings: DeductionFinding[];
  total_benefit: number;
  client_name: string;
  period: string;
  checks_run: number;
}

/**
 * Scans one client's real financial data for unclaimed deductions and
 * exemptions, writing every hit to `ca_deduction_findings` with its evidence
 * trail and an append-only audit event.
 */
export const detectDeductions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: DetectDeductionsInput) => {
    if (!input?.firm_id || !input?.business_id || !input?.period?.trim()) {
      throw new Error("firm_id, business_id and period are required");
    }
    if (!/^\d{4}-\d{2}$/.test(input.period.trim())) {
      throw new Error("period must be in YYYY-MM format");
    }
    return { ...input, period: input.period.trim() };
  })
  .handler(async ({ data, context }): Promise<DetectDeductionsResult> => {
    const { supabase, userId } = context;

    // Firm membership (RLS enforces it too — fail fast with a clear message).
    const { data: member } = await supabase
      .from("ca_firm_members")
      .select("id")
      .eq("ca_firm_id", data.firm_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!member) throw new Error("Access denied. You are not a member of this firm.");

    const { data: access } = await supabase
      .from("ca_client_access")
      .select("id")
      .eq("ca_firm_id", data.firm_id)
      .eq("business_id", data.business_id)
      .eq("is_active", true)
      .maybeSingle();
    if (!access) throw new Error("Access denied. This client is not in your portfolio.");

    const cur = periodRange(data.period);
    const prev = periodRange(priorPeriod(data.period));

    const [clientRes, curTxnRes, prevTxnRes, itcRes, paperRes] = await Promise.all([
      supabase
        .from("ca_clients")
        .select("client_name, entity_type, dpiit_number, incorporation_date")
        .eq("ca_firm_id", data.firm_id)
        .eq("business_id", data.business_id)
        .maybeSingle(),
      supabase
        .from("bank_transactions")
        .select("id, date, description, category, amount, type")
        .eq("business_id", data.business_id)
        .gte("date", cur.from)
        .lte("date", cur.to)
        .limit(5000),
      supabase
        .from("bank_transactions")
        .select("id, date, description, category, amount, type")
        .eq("business_id", data.business_id)
        .gte("date", prev.from)
        .lte("date", prev.to)
        .limit(5000),
      supabase
        .from("ca_itc_records")
        .select("id, supplier_name, invoice_number, total_itc, itc_blocked, block_reason")
        .eq("ca_firm_id", data.firm_id)
        .eq("business_id", data.business_id)
        .eq("filing_period", gstFilingPeriod(data.period))
        .limit(5000),
      supabase
        .from("ca_working_papers")
        .select("content")
        .eq("ca_firm_id", data.firm_id)
        .eq("business_id", data.business_id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const client = (clientRes.data ?? {
      client_name: "Client",
      entity_type: null,
      dpiit_number: null,
      incorporation_date: null,
    }) as ClientRow;

    const candidates = runAllChecks({
      client,
      current: (curTxnRes.data ?? []) as unknown as BankTxn[],
      prior: (prevTxnRes.data ?? []) as unknown as BankTxn[],
      itc: (itcRes.data ?? []) as unknown as ItcRow[],
      papers: (paperRes.data ?? []) as unknown as WorkingPaperRow[],
    });

    // Skip provisions that already have an open finding for this period.
    const { data: openRows } = await supabase
      .from("ca_deduction_findings")
      .select("provision")
      .eq("ca_firm_id", data.firm_id)
      .eq("business_id", data.business_id)
      .eq("period", data.period)
      .eq("status", "open");
    const alreadyOpen = new Set((openRows ?? []).map((r) => String(r.provision)));

    const findings: DeductionFinding[] = [];

    for (const c of candidates) {
      if (alreadyOpen.has(c.provision)) continue;
      const { data: row, error } = await supabase
        .from("ca_deduction_findings")
        .insert({
          ca_firm_id: data.firm_id,
          business_id: data.business_id,
          period: data.period,
          provision: c.provision,
          provision_label: c.provision_label,
          category: c.category,
          estimated_benefit: c.estimated_benefit,
          confidence: c.confidence,
          status: "open",
          evidence: c.evidence as never,
          explanation: c.explanation,
          action_required: c.action_required,
        })
        .select("id, provision, provision_label, estimated_benefit, confidence, explanation")
        .maybeSingle();
      if (error || !row) continue;

      findings.push({
        id: row.id as string,
        provision: row.provision as string,
        provision_label: row.provision_label as string,
        estimated_benefit: Number(row.estimated_benefit ?? 0),
        confidence: String(row.confidence),
        explanation: String(row.explanation),
      });

      await supabase.from("ca_audit_events").insert({
        ca_firm_id: data.firm_id,
        business_id: data.business_id,
        actor_id: userId,
        entity_type: "deduction_finding",
        entity_id: row.id as string,
        action: "deduction_detected",
        detail: {
          provision: c.provision,
          estimated_benefit: c.estimated_benefit,
          period: data.period,
        } as never,
      });
    }

    return {
      findings,
      total_benefit: Math.round(findings.reduce((s, f) => s + f.estimated_benefit, 0) * 100) / 100,
      client_name: client.client_name,
      period: data.period,
      checks_run: 6,
    };
  });
