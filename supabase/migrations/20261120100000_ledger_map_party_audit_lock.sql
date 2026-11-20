-- Foundations for the QC module: the confirmed ledger map and party master per client, the audit log of reads and exports, and the
-- period lock. All four are server-only tables (service role), like ca_file_passwords: signed-in users reach them only through the
-- server functions, which check the firm and the role.

-- What each ledger of a client is, confirmed once by a partner or manager and re-used by every check.
CREATE TABLE IF NOT EXISTS public.ca_ledger_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  ledger text NOT NULL,
  family text NOT NULL,
  gst_head text,
  rate numeric,
  year_in_name text,
  tds_section text,
  rcm_category text,
  itc_eligibility text,
  schedule_head text,
  note text,
  confirmed_by uuid,
  confirmed_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, ledger)
);
CREATE INDEX IF NOT EXISTS ca_ledger_map_firm_business_idx ON public.ca_ledger_map (ca_firm_id, business_id);

-- Parties: aliases, GSTIN, PAN, Udyam and credit terms, for 2B matching, TDS, 43B(h), ageing and related-party checks.
CREATE TABLE IF NOT EXISTS public.ca_party_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  party text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  gstin text,
  pan text,
  udyam text,
  udyam_category text,
  credit_days integer,
  related_party boolean NOT NULL DEFAULT false,
  confirmed_by uuid,
  confirmed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, party)
);
CREATE INDEX IF NOT EXISTS ca_party_master_firm_business_idx ON public.ca_party_master (ca_firm_id, business_id);

-- Who read, downloaded or exported what, and when. Creates were already logged in the activity feed; reads and exports were not.
CREATE TABLE IF NOT EXISTS public.ca_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  user_id uuid,
  business_id uuid,
  action text NOT NULL CHECK (action IN ('read', 'download', 'export')),
  subject text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ca_access_log_firm_at_idx ON public.ca_access_log (ca_firm_id, at DESC);

-- A client-month locked at close, with the fingerprint of every input at that moment. A changed input makes the lock stale.
CREATE TABLE IF NOT EXISTS public.ca_period_lock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  period text NOT NULL,
  input_hash text NOT NULL,
  input_count integer NOT NULL DEFAULT 0,
  locked_by uuid,
  locked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, period)
);

ALTER TABLE public.ca_ledger_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_party_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_period_lock ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ca_ledger_map, public.ca_party_master, public.ca_access_log, public.ca_period_lock FROM anon, authenticated;
GRANT ALL ON public.ca_ledger_map, public.ca_party_master, public.ca_access_log, public.ca_period_lock TO service_role;
