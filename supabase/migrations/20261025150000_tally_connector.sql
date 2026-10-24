-- Live TallyPrime connection. A small FynHelp Connector runs on the PC that has Tally open, reads
-- Tally's local XML server and sends each month's Day Book to FynHelp over HTTPS (outbound only).
-- The connector proves who it is with a secret token; only its SHA-256 hash is stored.
CREATE TABLE IF NOT EXISTS public.ca_tally_connectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  name text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  agent_version text,
  host_name text,
  last_error text,
  -- A person pressed "Sync now": the connector picks this up on its next check and clears it.
  sync_requested_at timestamptz
);
CREATE INDEX IF NOT EXISTS ca_tally_connectors_firm_idx ON public.ca_tally_connectors (ca_firm_id);

-- The companies open in Tally, as reported by the connector, and the FynHelp client each one belongs to.
CREATE TABLE IF NOT EXISTS public.ca_tally_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  connector_id uuid NOT NULL REFERENCES public.ca_tally_connectors(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  business_id uuid,
  last_synced_at timestamptz,
  last_sync_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connector_id, company_name)
);
CREATE INDEX IF NOT EXISTS ca_tally_companies_firm_idx ON public.ca_tally_companies (ca_firm_id);

GRANT SELECT ON public.ca_tally_connectors, public.ca_tally_companies TO authenticated;
GRANT ALL ON public.ca_tally_connectors, public.ca_tally_companies TO service_role;
ALTER TABLE public.ca_tally_connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_tally_companies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "firm reads tally connectors" ON public.ca_tally_connectors;
CREATE POLICY "firm reads tally connectors" ON public.ca_tally_connectors
  FOR SELECT TO authenticated USING (public.user_in_ca_firm(ca_firm_id));
DROP POLICY IF EXISTS "firm reads tally companies" ON public.ca_tally_companies;
CREATE POLICY "firm reads tally companies" ON public.ca_tally_companies
  FOR SELECT TO authenticated USING (public.user_in_ca_firm(ca_firm_id));
