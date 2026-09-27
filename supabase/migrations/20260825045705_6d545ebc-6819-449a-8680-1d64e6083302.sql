CREATE TABLE IF NOT EXISTS public.ca_recon_runs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  recon_type text NOT NULL,
  period text NOT NULL,
  run_at timestamptz NOT NULL DEFAULT now(),
  total_items int NOT NULL DEFAULT 0,
  matched int NOT NULL DEFAULT 0,
  mismatched int NOT NULL DEFAULT 0,
  unmatched int NOT NULL DEFAULT 0,
  total_matched_value numeric NOT NULL DEFAULT 0,
  total_at_risk numeric NOT NULL DEFAULT 0,
  run_by uuid,
  snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_recon_runs TO authenticated;
GRANT ALL ON public.ca_recon_runs TO service_role;

ALTER TABLE public.ca_recon_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "firm access recon runs" ON public.ca_recon_runs
  FOR ALL TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id))
  WITH CHECK (public.user_in_ca_firm(ca_firm_id));

CREATE INDEX IF NOT EXISTS idx_ca_recon_runs_client
  ON public.ca_recon_runs(ca_firm_id, business_id, run_at DESC);