CREATE TABLE IF NOT EXISTS public.ca_client_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id UUID NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.ca_clients(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'archived')),
  close_step_1 BOOLEAN NOT NULL DEFAULT FALSE,
  close_step_2 BOOLEAN NOT NULL DEFAULT FALSE,
  close_step_3 BOOLEAN NOT NULL DEFAULT FALSE,
  close_step_4 BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ca_client_periods_firm_client_period_idx
  ON public.ca_client_periods (ca_firm_id, client_id, period);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_client_periods TO authenticated;
GRANT ALL ON public.ca_client_periods TO service_role;

ALTER TABLE public.ca_client_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "firm members can manage their client periods"
ON public.ca_client_periods
FOR ALL
TO authenticated
USING (public.user_in_ca_firm(ca_firm_id))
WITH CHECK (public.user_in_ca_firm(ca_firm_id));

CREATE TRIGGER update_ca_client_periods_updated_at
BEFORE UPDATE ON public.ca_client_periods
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();