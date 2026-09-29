// ─── src/lib/postImportCompute.ts ───────────────────────────────────────────
// After any successful import we recompute the pre-computed intelligence
// metrics in the external Supabase project so the dashboards reflect the new
// transactions immediately, without a page refresh.
import { supabase } from "@/integrations/supabase/client";
import { supabaseExternal } from "@/integrations/supabase/external";

export async function recomputeIntelligence(businessId: string): Promise<void> {
  if (!businessId) return;
  const calls: Array<[string, Record<string, unknown>]> = [
    ["compute_and_store_liquidity", { p_business_id: businessId }],
    ["compute_and_store_costs", { p_business_id: businessId }],
  ];
  await Promise.all([
    ...calls.map(async ([fn, args]) => {
      try {
        const { error } = await (supabaseExternal as any).rpc(fn, args);
        if (error) console.warn(`[import] ${fn} failed:`, error.message);
        else console.log(`[import] ${fn} ok`);
      } catch (e) {
        console.warn(`[import] ${fn} threw:`, e);
      }
    }),
    // Revenue intelligence: MRR/ARR/LTV + cohort analysis + churn signals.
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("compute-revenue", {
          body: { business_id: businessId },
        });
        if (error) console.warn("[import] compute-revenue failed:", error.message);
        else console.log("[import] compute-revenue ok", data);
      } catch (e) {
        console.warn("[import] compute-revenue threw:", e);
      }
    })(),
  ]);
}
