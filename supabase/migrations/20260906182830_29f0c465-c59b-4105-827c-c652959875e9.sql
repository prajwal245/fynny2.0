CREATE TABLE IF NOT EXISTS public.ca_mis_signoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id UUID NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL,
  period_id TEXT,
  report_type TEXT NOT NULL DEFAULT 'MIS',
  signed_off_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notes TEXT,
  signed_off_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.ca_mis_signoffs TO authenticated;
GRANT ALL ON public.ca_mis_signoffs TO service_role;

ALTER TABLE public.ca_mis_signoffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Firm members can view their firm's MIS sign-offs"
  ON public.ca_mis_signoffs
  FOR SELECT
  TO authenticated
  USING (ca_firm_id IN (
    SELECT ca_firm_id FROM public.ca_firm_members WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "Firm members can create their firm's MIS sign-offs"
  ON public.ca_mis_signoffs
  FOR INSERT
  TO authenticated
  WITH CHECK (ca_firm_id IN (
    SELECT ca_firm_id FROM public.ca_firm_members WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE TRIGGER update_ca_mis_signoffs_updated_at
  BEFORE UPDATE ON public.ca_mis_signoffs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();