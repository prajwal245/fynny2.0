import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/analytics";

export interface BulkFilingJob {
  job_id: string;
  filing_type: string;
  filing_period: string;
  total: number;
  processed: number;
  failed: number;
  status: string;
  output: Array<{
    business_id: string;
    business_name: string;
    gstin: string;
    filing_type: string;
    filing_period: string;
    itc_records?: { matched: number; mismatch: number; missing: number };
    compliance_status?: string;
    note: string;
  }>;
}

export function useCABulkFiling() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastJob, setLastJob] = useState<BulkFilingJob | null>(null);

  const runBulkFiling = async (
    client_ids: string[],
    filing_type: "GSTR1" | "GSTR3B" | "TDS_CHALLAN",
    filing_period: string
  ): Promise<BulkFilingJob | null> => {
    setLoading(true);
    setError(null);
    try {
      track("ca_bulk_filing_started", { client_count: client_ids.length, filing_type });
      const { data, error: fnErr } = await supabase.functions.invoke("ca-bulk-filing-queue", {
        body: { client_ids, filing_type, filing_period },
      });
      if (fnErr) { setError(fnErr.message); return null; }
      if (!data?.success) { setError(data?.error ?? "Filing job failed"); return null; }
      setLastJob(data);
      return data;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const downloadPayload = (job: BulkFilingJob) => {
    const blob = new Blob([JSON.stringify(job.output, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${job.filing_type}_${job.filing_period.replace(/\s/g, "_")}_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return { runBulkFiling, downloadPayload, loading, error, lastJob };
}
