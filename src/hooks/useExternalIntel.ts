/**
 * External intelligence data layer.
 *
 * These hooks read the *computed* financial intelligence tables that live in
 * the external Supabase project (see `src/integrations/supabase/external.ts`),
 * scoped to the authenticated user's `business_id` (from the Lovable Cloud
 * `profiles` table via AuthContext).
 *
 * Rules enforced here:
 *  - Never used in demo mode (demo keeps its own seeded source).
 *  - Every query is failure-tolerant: RLS denials / network errors resolve to
 *    null/[] so the UI renders an empty state instead of crashing.
 *  - Each hook console.logs the business_id + payload on resolve so the wiring
 *    can be verified in browser dev tools.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseExternal, proxyExternalQuery } from "@/integrations/supabase/external";
import { useAuth } from "@/contexts/AuthContext";
import { useMode } from "@/components/intelligence/DataSource";

export type LiquidityMetrics = {
  id: string;
  business_id: string;
  cash_position: number;
  runway_months: number;
  runway_days: number;
  burn_rate_current: number;
  health_score: number;
  health_status: string;
  recorded_at: string;
};

export type RevenueMetrics = {
  id: string;
  org_id: string;
  period_start: string;
  period_end: string;
  period_type: string;
  mrr: number;
  arr: number;
  new_revenue: number;
  churned_revenue: number;
  expansion_revenue: number;
  net_revenue: number;
  revenue_growth_rate: number;
  customer_count: number;
  arpu: number;
  ltv_estimate: number;
  churn_rate: number;
  created_at: string;
};

export type CostAnomaly = {
  id: string;
  org_id: string;
  category: string;
  expected_amount: number;
  actual_amount: number;
  deviation_pct: number;
  severity: "info" | "warning" | "critical" | string;
  explanation: string | null;
  is_acknowledged: boolean;
  detected_at: string;
};

export type ExternalGstFiling = {
  id: string;
  business_id: string;
  return_type: string;
  filing_period: string;
  due_date: string | null;
  filed_date: string | null;
  status: string;
  taxable_sales: number;
  output_tax: number;
  input_tax_credit: number;
  tax_payable: number;
  created_at: string;
};

export type ExternalBankTxn = {
  id: string;
  date: string;
  description: string | null;
  type: string;
  amount: number;
  balance: number;
  category: string | null;
  business_id: string;
};

/** business_id of the signed-in user; null in demo mode or when signed out. */
export function useLiveBusinessId(): string | null {
  const mode = useMode();
  const { businessId } = useAuth();
  return mode === "live" ? businessId ?? null : null;
}

function logMount(label: string, businessId: string | null, payload: unknown) {
  // Verification hook (see task brief step 5) — visible in browser dev tools.
  console.log(`[fyn:external] ${label}`, { business_id: businessId, data: payload });
}

const QUERY_OPTS = {
  staleTime: 60_000,
  gcTime: 5 * 60_000,
  refetchOnWindowFocus: false,
  refetchOnMount: false,
  retry: false,
} as const;

export function useLiquidityMetrics() {
  const businessId = useLiveBusinessId();
  return useQuery({
    queryKey: ["ext", "liquidity_metrics", businessId],
    enabled: !!businessId,
    ...QUERY_OPTS,
    queryFn: async (): Promise<LiquidityMetrics | null> => {
      try {
        const { data, error } = await proxyExternalQuery({
          table: "liquidity_metrics",
          business_id: businessId!,
          order: { column: "recorded_at", ascending: false },
          limit: 1,
        });
        if (error) throw new Error(error);
        logMount("liquidity_metrics", businessId, data);
        return ((data?.[0] as LiquidityMetrics) ?? null);
      } catch (e) {
        console.warn("[fyn:external] liquidity_metrics unavailable", e);
        return null;
      }
    },
  });
}

export function useRevenueMetrics() {
  const businessId = useLiveBusinessId();
  return useQuery({
    queryKey: ["ext", "revenue_metrics", businessId],
    enabled: !!businessId,
    ...QUERY_OPTS,
    queryFn: async (): Promise<RevenueMetrics | null> => {
      try {
        const { data, error } = await proxyExternalQuery({
          table: "revenue_metrics",
          business_id: businessId!,
          order: { column: "created_at", ascending: false },
          limit: 1,
        });
        if (error) throw new Error(error);
        logMount("revenue_metrics", businessId, data);
        return ((data?.[0] as RevenueMetrics) ?? null);
      } catch (e) {
        console.warn("[fyn:external] revenue_metrics unavailable", e);
        return null;
      }
    },
  });
}

export function useCostAnomalies() {
  const businessId = useLiveBusinessId();
  return useQuery({
    queryKey: ["ext", "cost_anomalies", businessId],
    enabled: !!businessId,
    ...QUERY_OPTS,
    queryFn: async (): Promise<CostAnomaly[]> => {
      try {
        const { data, error } = await proxyExternalQuery({
          table: "cost_anomalies",
          business_id: businessId!,
          order: { column: "detected_at", ascending: false },
        });
        if (error) throw new Error(error);
        logMount("cost_anomalies", businessId, data);
        return (data as CostAnomaly[]) ?? [];
      } catch (e) {
        console.warn("[fyn:external] cost_anomalies unavailable", e);
        return [];
      }
    },
  });
}

export function useAcknowledgeAnomaly() {
  const qc = useQueryClient();
  const businessId = useLiveBusinessId();
  return async (id: string) => {
    try {
      const { error } = await supabaseExternal
        .from("cost_anomalies")
        .update({ is_acknowledged: true })
        .eq("id", id);
      if (error) throw error;
    } catch (e) {
      console.warn("[fyn:external] acknowledge failed", e);
    } finally {
      qc.invalidateQueries({ queryKey: ["ext", "cost_anomalies", businessId] });
    }
  };
}

export function useExternalGstFilings() {
  const businessId = useLiveBusinessId();
  return useQuery({
    queryKey: ["ext", "gst_filings", businessId],
    enabled: !!businessId,
    ...QUERY_OPTS,
    queryFn: async (): Promise<ExternalGstFiling[]> => {
      try {
        const { data, error } = await proxyExternalQuery({
          table: "gst_filings",
          business_id: businessId!,
          order: { column: "due_date", ascending: true },
        });
        if (error) throw new Error(error);
        logMount("gst_filings", businessId, data);
        return (data as ExternalGstFiling[]) ?? [];
      } catch (e) {
        console.warn("[fyn:external] gst_filings unavailable", e);
        return [];
      }
    },
  });
}

export function useExternalBankTxns() {
  const businessId = useLiveBusinessId();
  return useQuery({
    queryKey: ["ext", "bank_transactions", businessId],
    enabled: !!businessId,
    ...QUERY_OPTS,
    queryFn: async (): Promise<ExternalBankTxn[]> => {
      try {
        const { data, error } = await proxyExternalQuery({
          table: "bank_transactions",
          business_id: businessId!,
          order: { column: "date", ascending: false },
          limit: 500,
        });
        if (error) throw new Error(error);
        logMount("bank_transactions", businessId, data);
        return (data as ExternalBankTxn[]) ?? [];
      } catch (e) {
        console.warn("[fyn:external] bank_transactions unavailable", e);
        return [];
      }
    },
  });
}

/* ── Task 5: alerts generated from real data ───────────────────────────── */
export type LiveAlert = {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail?: string;
};

export function useGeneratedAlerts(): LiveAlert[] {
  const { data: liq } = useLiquidityMetrics();
  const { data: filings } = useExternalGstFilings();
  const { data: anomalies } = useCostAnomalies();

  const alerts: LiveAlert[] = [];

  const runway = Number(liq?.runway_months ?? NaN);
  if (Number.isFinite(runway)) {
    if (runway < 3) {
      alerts.push({
        id: "runway-critical",
        severity: "critical",
        title: "Cash runway below 3 months",
        detail: `${runway.toFixed(1)} months of runway remaining.`,
      });
    } else if (runway < 6) {
      alerts.push({
        id: "runway-warning",
        severity: "warning",
        title: "Cash runway below 6 months",
        detail: `${runway.toFixed(1)} months of runway remaining.`,
      });
    }
  }

  const now = Date.now();
  (filings ?? []).forEach((f) => {
    if (!f.due_date || f.status === "filed") return;
    const days = Math.ceil((new Date(f.due_date).getTime() - now) / 86400000);
    if (days <= 7) {
      alerts.push({
        id: `gst-${f.id}`,
        severity: "warning",
        title: `${f.return_type} due for ${f.filing_period}`,
        detail: days < 0 ? `Overdue by ${Math.abs(days)} days.` : `Due in ${days} day${days === 1 ? "" : "s"}.`,
      });
    }
  });

  (anomalies ?? [])
    .filter((a) => a.severity === "critical" && !a.is_acknowledged)
    .forEach((a) => {
      alerts.push({
        id: `anomaly-${a.id}`,
        severity: "critical",
        title: `Cost anomaly — ${a.category}`,
        detail: a.explanation ?? undefined,
      });
    });

  return alerts;
}

/* ────────────────────────────────────────────────────────────────────────
 * Cohort analysis + churn signals (revenue intelligence, external store)
 * ──────────────────────────────────────────────────────────────────────── */

export type CohortRow = {
  id: string;
  business_id: string;
  cohort_month: string;
  cohort_size: number;
  retained_m1: number | null;
  retained_m2: number | null;
  retained_m3: number | null;
  retained_m4: number | null;
  retained_m5: number | null;
  retained_m6: number | null;
  revenue_m1: number | null;
  revenue_m2: number | null;
  revenue_m3: number | null;
  revenue_m4: number | null;
  revenue_m5: number | null;
  revenue_m6: number | null;
  created_at: string;
};

export type ChurnSignal = {
  id: string;
  business_id: string;
  customer_id: string;
  customer_name: string | null;
  last_invoice_date: string | null;
  days_since_invoice: number;
  signal_type: string;
  severity: "warning" | "critical" | string;
  detected_at: string;
  is_acknowledged: boolean;
};

export function useCohortAnalysis() {
  const businessId = useLiveBusinessId();
  return useQuery({
    queryKey: ["ext", "cohort_analysis", businessId],
    enabled: !!businessId,
    ...QUERY_OPTS,
    queryFn: async (): Promise<CohortRow[]> => {
      try {
        const { data, error } = await proxyExternalQuery({
          table: "cohort_analysis",
          business_id: businessId!,
          order: { column: "cohort_month", ascending: true },
        });
        if (error) throw new Error(error);
        logMount("cohort_analysis", businessId, data);
        return (data as CohortRow[]) ?? [];
      } catch (e) {
        console.warn("[fyn:external] cohort_analysis unavailable", e);
        return [];
      }
    },
  });
}

export function useChurnSignals() {
  const businessId = useLiveBusinessId();
  return useQuery({
    queryKey: ["ext", "churn_signals", businessId],
    enabled: !!businessId,
    ...QUERY_OPTS,
    queryFn: async (): Promise<ChurnSignal[]> => {
      try {
        const { data, error } = await proxyExternalQuery({
          table: "churn_signals",
          business_id: businessId!,
          filters: { is_acknowledged: "false" },
          order: { column: "days_since_invoice", ascending: false },
        });
        if (error) throw new Error(error);
        logMount("churn_signals", businessId, data);
        return (data as ChurnSignal[]) ?? [];
      } catch (e) {
        console.warn("[fyn:external] churn_signals unavailable", e);
        return [];
      }
    },
  });
}

/** Acknowledge a churn signal in the external store and drop it from cache. */
export function useAcknowledgeChurnSignal() {
  const businessId = useLiveBusinessId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabaseExternal
        .from("churn_signals")
        .update({ is_acknowledged: true })
        .eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      qc.setQueryData<ChurnSignal[]>(["ext", "churn_signals", businessId], (prev) =>
        (prev ?? []).filter((s) => s.id !== id)
      );
    },
  });
}
