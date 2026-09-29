-- FynHelp CA Learning Brain — firm/client-scoped statistical intelligence.
-- These tables store STATISTICAL PATTERNS only, never raw client values.
-- provision_weights: {"80JJAA": 0.3} — relevance score, not amounts
-- match_preferences: {"tolerance_pct": 1.5, "date_window_days": 4} — thresholds, not values
-- avg_response_days: 4.2 — a number, never a client name or invoice number

CREATE TABLE IF NOT EXISTS public.ca_firm_intelligence (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  confidence_overrides jsonb NOT NULL DEFAULT '{}',
  provision_weights jsonb NOT NULL DEFAULT '{}',
  last_ocr_learning_at timestamptz,
  last_deduction_learning_at timestamptz,
  last_filing_learning_at timestamptz,
  computed_at timestamptz DEFAULT now(),
  CONSTRAINT uq_firm_intelligence UNIQUE (ca_firm_id)
);

GRANT SELECT ON public.ca_firm_intelligence TO authenticated;
GRANT ALL ON public.ca_firm_intelligence TO service_role;
ALTER TABLE public.ca_firm_intelligence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "firm members read own intelligence" ON public.ca_firm_intelligence;
CREATE POLICY "firm members read own intelligence" ON public.ca_firm_intelligence
  FOR SELECT TO authenticated USING (public.user_in_ca_firm(ca_firm_id));

CREATE TABLE IF NOT EXISTS public.ca_client_intelligence (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ca_firm_id uuid NOT NULL,
  business_id uuid NOT NULL,
  match_preferences jsonb NOT NULL DEFAULT '{}',
  avg_response_days numeric DEFAULT NULL,
  preferred_channel text DEFAULT NULL,
  best_chase_day int DEFAULT NULL,
  typical_docs_late text[] NOT NULL DEFAULT '{}',
  avg_days_before_due numeric DEFAULT NULL,
  filing_risk_score numeric DEFAULT 0,
  computed_at timestamptz DEFAULT now(),
  CONSTRAINT uq_client_intelligence UNIQUE (ca_firm_id, business_id)
);

GRANT SELECT ON public.ca_client_intelligence TO authenticated;
GRANT ALL ON public.ca_client_intelligence TO service_role;
ALTER TABLE public.ca_client_intelligence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "firm members read client intelligence" ON public.ca_client_intelligence;
CREATE POLICY "firm members read client intelligence" ON public.ca_client_intelligence
  FOR SELECT TO authenticated USING (
    public.user_in_ca_firm(ca_firm_id)
    AND public.ca_firm_has_client_access(ca_firm_id, business_id)
  );

-- Intelligence columns on existing tables
ALTER TABLE public.ca_firms ADD COLUMN IF NOT EXISTS brain_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.ca_firms ADD COLUMN IF NOT EXISTS brain_last_run_at timestamptz;

ALTER TABLE public.ca_document_extractions ADD COLUMN IF NOT EXISTS was_corrected boolean NOT NULL DEFAULT false;
ALTER TABLE public.ca_document_extractions ADD COLUMN IF NOT EXISTS correction_delta jsonb;

-- Stores field NAMES only, never extracted values.
CREATE OR REPLACE FUNCTION public.track_extraction_correction()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.corrected IS DISTINCT FROM OLD.corrected AND NEW.corrected IS NOT NULL THEN
    NEW.was_corrected := true;
    NEW.correction_delta := (
      SELECT COALESCE(jsonb_object_agg(k, true), '{}'::jsonb)
      FROM jsonb_object_keys(NEW.corrected) AS k
      WHERE NEW.corrected -> k IS DISTINCT FROM COALESCE(OLD.extracted, '{}'::jsonb) -> k
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_track_correction ON public.ca_document_extractions;
CREATE TRIGGER trg_track_correction
  BEFORE UPDATE ON public.ca_document_extractions
  FOR EACH ROW EXECUTE FUNCTION public.track_extraction_correction();

-- Nightly orchestrator trigger (02:00 IST = 20:30 UTC)
CREATE OR REPLACE FUNCTION public.trigger_ca_brain_master()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://project--db6d6d57-efdb-48fa-b792-71162354b2f8.lovable.app/api/public/ca-brain-master',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','fyn_cron_7bd41e9a2c6f4835ab90d7c15e28f463'),
    body := '{}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_ca_brain_master() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('ca-brain-master') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ca-brain-master');
SELECT cron.schedule('ca-brain-master', '30 20 * * *', 'SELECT public.trigger_ca_brain_master()');