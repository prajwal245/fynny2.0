CREATE TABLE IF NOT EXISTS public.ca_deduction_findings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ca_firm_id uuid NOT NULL,
  business_id uuid NOT NULL,
  period text NOT NULL,
  provision text NOT NULL,
  provision_label text NOT NULL,
  category text NOT NULL,
  estimated_benefit numeric NOT NULL DEFAULT 0,
  confidence text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  explanation text NOT NULL,
  action_required text NOT NULL,
  dismissed_at timestamptz,
  dismissed_by uuid,
  actioned_at timestamptz,
  actioned_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_deduction_findings TO authenticated;
GRANT ALL ON public.ca_deduction_findings TO service_role;

ALTER TABLE public.ca_deduction_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "firm access deduction findings" ON public.ca_deduction_findings;
CREATE POLICY "firm access deduction findings" ON public.ca_deduction_findings
  FOR ALL
  TO authenticated
  USING (
    public.user_in_ca_firm(ca_firm_id)
    AND public.ca_firm_has_client_access(ca_firm_id, business_id)
  )
  WITH CHECK (
    public.user_in_ca_firm(ca_firm_id)
    AND public.ca_firm_has_client_access(ca_firm_id, business_id)
  );

CREATE INDEX IF NOT EXISTS ca_deduction_findings_scope_idx
  ON public.ca_deduction_findings (ca_firm_id, business_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS ca_deduction_findings_open_unique_idx
  ON public.ca_deduction_findings (business_id, provision, period)
  WHERE status = 'open';

DROP TRIGGER IF EXISTS ca_deduction_findings_set_updated_at ON public.ca_deduction_findings;
CREATE TRIGGER ca_deduction_findings_set_updated_at
  BEFORE UPDATE ON public.ca_deduction_findings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.ca_deduction_findings;