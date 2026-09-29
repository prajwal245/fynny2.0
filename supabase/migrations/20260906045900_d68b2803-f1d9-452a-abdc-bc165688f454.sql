ALTER TABLE public.ca_client_periods ADD COLUMN IF NOT EXISTS business_id UUID;

DELETE FROM public.ca_client_periods a
USING public.ca_client_periods b
WHERE a.ctid < b.ctid
  AND a.ca_firm_id = b.ca_firm_id
  AND a.client_id = b.client_id
  AND a.period = b.period;

CREATE UNIQUE INDEX IF NOT EXISTS ca_client_periods_firm_client_period_key
  ON public.ca_client_periods (ca_firm_id, client_id, period);