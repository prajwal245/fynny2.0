-- What a client has handed over for each input a review needs, marked by a person (received elsewhere, or not applicable for this client),
-- per client and period. Documents the product itself has read are detected from the documents and need no row here.
-- Server-only table (service role), like ca_ledger_map.
CREATE TABLE IF NOT EXISTS public.ca_input_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  input_key text NOT NULL,
  period text NOT NULL,
  status text NOT NULL CHECK (status IN ('received', 'not_applicable', 'missing')),
  note text,
  marked_by uuid,
  marked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, input_key, period)
);
CREATE INDEX IF NOT EXISTS ca_input_status_firm_business_idx ON public.ca_input_status (ca_firm_id, business_id);
ALTER TABLE public.ca_input_status ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ca_input_status FROM anon, authenticated;
GRANT ALL ON public.ca_input_status TO service_role;
