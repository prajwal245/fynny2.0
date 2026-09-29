import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCAAuth } from "@/contexts/CAAuthContext";
import { track } from "@/lib/analytics";

export interface ITCRecord {
  id: string;
  gstin_supplier: string;
  supplier_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  taxable_value: number;
  total_itc: number;
  match_status: string;
  gstr2b_matched: boolean;
  mismatch_amount: number | null;
  itc_eligible: boolean;
  itc_blocked: boolean;
  block_reason: string | null;
  source: string;
}

export function useCAITC(business_id: string | null, filing_period: string | null) {
  const { caFirm } = useCAAuth();
  const [records, setRecords] = useState<ITCRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const summary = {
    total: records.reduce((s, r) => s + r.total_itc, 0),
    matched: records.filter((r) => r.match_status === "matched").reduce((s, r) => s + r.total_itc, 0),
    mismatch: records.filter((r) => r.match_status === "mismatch").reduce((s, r) => s + r.total_itc, 0),
    missing: records.filter((r) => r.match_status === "missing_in_2b").reduce((s, r) => s + r.total_itc, 0),
    matchRate: records.length > 0
      ? Math.round((records.filter((r) => r.match_status === "matched").length / records.length) * 100)
      : 0,
  };

  useEffect(() => {
    if (!caFirm?.id || !business_id || !filing_period) { setLoading(false); return; }
    let cancelled = false;

    (async () => {
      setLoading(true);
      const { data, error: err } = await supabase
        .from("ca_itc_records")
        .select("id, gstin_supplier, supplier_name, invoice_number, invoice_date, taxable_value, total_itc, match_status, gstr2b_matched, mismatch_amount, itc_eligible, itc_blocked, block_reason, source")
        .eq("ca_firm_id", caFirm.id)
        .eq("business_id", business_id)
        .eq("filing_period", filing_period)
        .order("match_status", { ascending: true });

      if (!cancelled) {
        if (err) { setError(err.message); }
        else { setRecords((data ?? []) as ITCRecord[]); setError(null); }
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [caFirm?.id, business_id, filing_period]);

  const processGSTR2B = async (file_name: string, records: Array<{
    gstin: string; trade_name?: string; invoice_no?: string;
    invoice_date?: string; taxable_value: number;
    igst?: number; cgst?: number; sgst?: number;
  }>) => {
    track("ca_gstr2b_uploaded", { filing_period, record_count: records.length });
    const { data, error } = await supabase.functions.invoke("ca-process-gstr2b", {
      body: { business_id, filing_period, file_name, records },
    });
    return { data, error };
  };

  return { records, loading, error, summary, processGSTR2B };
}
