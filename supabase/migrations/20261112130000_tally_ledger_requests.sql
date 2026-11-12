-- Creating a ledger in Tally from FynHelp. One row per request; nothing is written to Tally until a partner or
-- manager asks, and the connector reads the ledger back from Tally before the row counts as created.
CREATE TABLE IF NOT EXISTS public.ca_tally_ledger_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES public.ca_tally_companies(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 99),
  parent text NOT NULL CHECK (length(parent) BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','created','failed','cancelled')),
  attempts int NOT NULL DEFAULT 0,
  claimed_at timestamptz,
  last_error text,
  tally_reply text,
  requested_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_in_tally_at timestamptz
);
-- A ledger is asked for once per company and spelling. A cancelled or failed request may be asked for again.
CREATE UNIQUE INDEX IF NOT EXISTS ca_tally_ledger_requests_live_uidx ON public.ca_tally_ledger_requests (company_id, lower(name)) WHERE status IN ('queued','sent','created');
CREATE INDEX IF NOT EXISTS ca_tally_ledger_requests_firm_idx ON public.ca_tally_ledger_requests (ca_firm_id, company_id, status);

GRANT SELECT ON public.ca_tally_ledger_requests TO authenticated;
GRANT ALL ON public.ca_tally_ledger_requests TO service_role;
ALTER TABLE public.ca_tally_ledger_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "firm reads tally ledger requests" ON public.ca_tally_ledger_requests;
CREATE POLICY "firm reads tally ledger requests" ON public.ca_tally_ledger_requests FOR SELECT TO authenticated USING (public.user_in_ca_firm(ca_firm_id));
NOTIFY pgrst, 'reload schema';
