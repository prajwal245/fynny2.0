/**
 * CA Learning Brain — read hooks.
 *
 * Everything here is read through RLS: `ca_firm_intelligence` is visible only
 * to members of that firm, `ca_client_intelligence` only to firm members with
 * access to that client. The rows themselves hold statistics only — no names,
 * amounts, GSTINs or invoice numbers ever reach the browser.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tone } from "@/components/ca/portalUi";

// Generated Database types lag behind the intelligence tables.
const db = supabase as unknown as { from: (t: string) => any };

export interface FirmIntelligence {
  confidence_overrides: Record<string, number>;
  provision_weights: Record<string, Record<string, number>>;
  last_ocr_learning_at: string | null;
  last_deduction_learning_at: string | null;
  last_filing_learning_at: string | null;
  computed_at: string | null;
  /** Lives on ca_firms, joined here so every consumer sees one shape. */
  brain_last_run_at: string | null;
}

export interface ClientIntelligence {
  business_id: string;
  match_preferences: Record<string, number>;
  avg_response_days: number | null;
  preferred_channel: string | null;
  best_chase_day: number | null;
  typical_docs_late: string[];
  avg_days_before_due: number | null;
  filing_risk_score: number | null;
  computed_at: string | null;
}

const CLIENT_COLS =
  "business_id, match_preferences, avg_response_days, preferred_channel, best_chase_day, typical_docs_late, avg_days_before_due, filing_risk_score, computed_at";

export function useFirmIntelligence(firmId: string | null) {
  const [data, setData] = useState<FirmIntelligence | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!firmId) { setData(null); setLoading(false); return; }
    setLoading(true);
    (async () => {
      const [{ data: row }, { data: firm }] = await Promise.all([
        db
          .from("ca_firm_intelligence")
          .select("confidence_overrides, provision_weights, last_ocr_learning_at, last_deduction_learning_at, last_filing_learning_at, computed_at")
          .eq("ca_firm_id", firmId)
          .maybeSingle(),
        db.from("ca_firms").select("brain_last_run_at").eq("id", firmId).maybeSingle(),
      ]);
      if (cancelled) return;
      setData({
        ...((row as FirmIntelligence) ?? {}),
        brain_last_run_at:
          (firm as { brain_last_run_at: string | null } | null)?.brain_last_run_at ?? null,
      } as FirmIntelligence);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [firmId]);

  return { data, loading };
}

export function useClientIntelligence(firmId: string | null, businessId: string | null) {
  const [data, setData] = useState<ClientIntelligence | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!firmId || !businessId) { setData(null); setLoading(false); return; }
    setLoading(true);
    const { data: row } = await db
      .from("ca_client_intelligence")
      .select(CLIENT_COLS)
      .eq("ca_firm_id", firmId)
      .eq("business_id", businessId)
      .maybeSingle();
    setData((row as ClientIntelligence) ?? null);
    setLoading(false);
  }, [firmId, businessId]);

  useEffect(() => { void load(); }, [load]);

  return { data, loading, reload: load };
}

/** All client intelligence rows for the firm's own portfolio, keyed by business_id. */
export function useFirmClientIntelligence(firmId: string | null) {
  const [rows, setRows] = useState<ClientIntelligence[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!firmId) { setRows([]); setLoading(false); return; }
    setLoading(true);
    (async () => {
      const { data } = await db.from("ca_client_intelligence").select(CLIENT_COLS).eq("ca_firm_id", firmId);
      if (cancelled) return;
      setRows((data ?? []) as ClientIntelligence[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [firmId]);

  const byBusiness = useMemo(() => {
    const m = new Map<string, ClientIntelligence>();
    for (const r of rows) m.set(r.business_id, r);
    return m;
  }, [rows]);

  return { byBusiness, loading };
}

/* ---------------------------------------------------------------- */
/* Presentation helpers                                              */
/* ---------------------------------------------------------------- */

export interface RiskBand { label: string; tone: Tone }

export function filingRiskBand(score: number | null | undefined): RiskBand | null {
  if (score === null || score === undefined) return null;
  if (score > 0.7) return { label: "HIGH RISK", tone: "red" };
  if (score >= 0.4) return { label: "WATCH", tone: "amber" };
  return { label: "ON TRACK", tone: "green" };
}

/** Share of past filings that were late, derived from the risk score band. */
export const lateSharePct = (score: number | null | undefined) =>
  score === null || score === undefined ? 0 : Math.round(Math.min(1, Math.max(0, score)) * 100);

export const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.round(hrs / 24)} d ago`;
}
