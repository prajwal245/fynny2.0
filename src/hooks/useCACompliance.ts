import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCAAuth } from "@/contexts/CAAuthContext";
import { track } from "@/lib/analytics";

export interface ComplianceEvent {
  id: string;
  event_type: string;
  filing_period: string;
  due_date: string;
  filing_date: string | null;
  status: string;
  penalty_amount: number;
  late_fee_amount: number;
  notes: string | null;
}

export function useCACompliance(business_id: string | null) {
  const { caFirm } = useCAAuth();
  const [events, setEvents] = useState<ComplianceEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!caFirm?.id || !business_id) { setLoading(false); return; }
    let cancelled = false;

    (async () => {
      setLoading(true);
      const { data, error: err } = await supabase
        .from("ca_compliance_events")
        .select("id, event_type, filing_period, due_date, filing_date, status, penalty_amount, late_fee_amount, notes")
        .eq("ca_firm_id", caFirm.id)
        .eq("business_id", business_id)
        .order("due_date", { ascending: true });

      if (!cancelled) {
        if (err) { setError(err.message); }
        else { setEvents((data ?? []) as ComplianceEvent[]); setError(null); }
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [caFirm?.id, business_id]);

  const markFiled = async (event_id: string, filing_date: string) => {
    const { error } = await supabase
      .from("ca_compliance_events")
      .update({ status: "filed", filing_date, updated_at: new Date().toISOString() })
      .eq("id", event_id)
      .eq("ca_firm_id", caFirm?.id ?? "");
    if (!error) {
      const ev = events.find((e) => e.id === event_id);
      track("gst_filing_marked_filed", { event_type: ev?.event_type, filing_period: ev?.filing_period });
      setEvents((prev) => prev.map((e) => e.id === event_id ? { ...e, status: "filed", filing_date } : e));
    }
    return { error };
  };

  return { events, loading, error, markFiled };
}
