import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCAAuth } from "@/contexts/CAAuthContext";

export interface CAClientRow {
  id: string;
  business_id: string;
  name: string;
  industry: string;
  turnover: string;
  health: number;
  cash: "Safe" | "Watch" | "Critical";
  filing: number;
  nextFilingType: string;
  nextFilingDate: string | null;
  itcAtRisk: number;
  overdueFiliings: number;
  report: string;
  notes: string | null;
  granted_at: string | null;
  gstin: string | null;
  client_reference_code: string | null;
  storage_namespace: string | null;
}

const reportLabel = (granted_at: string | null) => {
  if (!granted_at) return "Never";
  const days = Math.floor((Date.now() - new Date(granted_at).getTime()) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(granted_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
};

const cashFromStatus = (status: string | null): "Safe" | "Watch" | "Critical" => {
  if (status === "safe") return "Safe";
  if (status === "watch") return "Watch";
  if (status === "critical") return "Critical";
  return "Watch";
};

export function useCAClients() {
  const { caFirm } = useCAAuth();
  const [clients, setClients] = useState<CAClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!caFirm?.id) { setLoading(false); return; }
    let cancelled = false;

    (async () => {
      setLoading(true);

      const { data: access, error: e1 } = await supabase
        .from("ca_client_access")
        .select("id, business_id, notes, granted_at, is_active, client_reference_code, storage_namespace")
        .eq("ca_firm_id", caFirm.id)
        .eq("is_active", true);

      if (e1) { if (!cancelled) { setError(e1.message); setLoading(false); } return; }

      const ids = (access ?? []).map((a) => a.business_id);
      if (ids.length === 0) { if (!cancelled) { setClients([]); setLoading(false); } return; }

      const [bizResult, healthResult, complianceResult, itcResult] = await Promise.all([
        supabase
          .from("businesses")
          .select("id, business_name, industry, turnover_range, gstin")
          .in("id", ids),
        supabase
          .from("ca_client_health_scores")
          .select("business_id, overall_score, cash_status, itc_risk_amount, overdue_filings")
          .eq("ca_firm_id", caFirm.id)
          .in("business_id", ids),
        supabase
          .from("ca_compliance_events")
          .select("business_id, event_type, due_date, status")
          .eq("ca_firm_id", caFirm.id)
          .in("business_id", ids)
          .in("status", ["pending", "overdue"])
          .gte("due_date", new Date().toISOString().split("T")[0])
          .order("due_date", { ascending: true }),
        supabase
          .from("ca_itc_records")
          .select("business_id, total_itc, match_status")
          .eq("ca_firm_id", caFirm.id)
          .in("business_id", ids)
          .in("match_status", ["mismatch", "missing_in_2b"]),
      ]);

      if (cancelled) return;

      const bizMap = new Map((bizResult.data ?? []).map((b) => [b.id, b]));
      const healthMap = new Map((healthResult.data ?? []).map((h) => [h.business_id, h]));

      const nextFilingMap = new Map<string, { event_type: string; due_date: string; days: number }>();
      for (const ev of complianceResult.data ?? []) {
        if (!nextFilingMap.has(ev.business_id)) {
          const days = Math.max(0, Math.floor(
            (new Date(ev.due_date).getTime() - Date.now()) / 86400000
          ));
          nextFilingMap.set(ev.business_id, { event_type: ev.event_type, due_date: ev.due_date, days });
        }
      }

      const itcRiskMap = new Map<string, number>();
      for (const rec of itcResult.data ?? []) {
        itcRiskMap.set(
          rec.business_id,
          (itcRiskMap.get(rec.business_id) ?? 0) + (rec.total_itc ?? 0)
        );
      }

      const rows: CAClientRow[] = (access ?? []).map((a) => {
        const b = bizMap.get(a.business_id);
        const h = healthMap.get(a.business_id);
        const nf = nextFilingMap.get(a.business_id);
        return {
          id: a.id,
          business_id: a.business_id,
          name: b?.business_name ?? "Access pending",
          industry: b?.industry ?? "-",
          turnover: b?.turnover_range ?? "-",
          health: h?.overall_score ?? 0,
          cash: cashFromStatus(h?.cash_status ?? null),
          filing: nf?.days ?? 999,
          nextFilingType: nf?.event_type ?? "-",
          nextFilingDate: nf?.due_date ?? null,
          itcAtRisk: itcRiskMap.get(a.business_id) ?? 0,
          overdueFiliings: h?.overdue_filings ?? 0,
          report: reportLabel(a.granted_at),
          notes: a.notes,
          granted_at: a.granted_at,
          gstin: (b as any)?.gstin ?? null,
          client_reference_code: (a as any).client_reference_code ?? null,
          storage_namespace: (a as any).storage_namespace ?? null,
        };
      });

      if (!cancelled) {
        setClients(rows);
        setError(null);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [caFirm?.id]);

  return { clients, loading, error };
}
