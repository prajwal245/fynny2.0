-- Writing approved bank lines into Tally. Nothing here posts by itself: a row is created only
-- when a partner or manager approves one line and one existing ledger. All access is through
-- the service role (server functions check the firm and role); clients can only read their firm's rows.

-- Ledger names read from each Tally company, so a line can only be sent to a ledger that exists.
CREATE TABLE IF NOT EXISTS public.ca_tally_ledgers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.ca_tally_companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  parent text,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);
CREATE INDEX IF NOT EXISTS ca_tally_ledgers_firm_idx ON public.ca_tally_ledgers (ca_firm_id, company_id);

-- One approved line to write. line_key is the id sent to Tally as the voucher's REMOTEID.
CREATE TABLE IF NOT EXISTS public.ca_tally_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES public.ca_tally_companies(id) ON DELETE CASCADE,
  txn_id uuid NOT NULL REFERENCES public.ca_txns(id) ON DELETE CASCADE,
  line_key text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  amount numeric(16,2) NOT NULL CHECK (amount > 0),
  txn_date date NOT NULL,
  bank_ledger text NOT NULL,
  party_ledger text NOT NULL,
  narration text NOT NULL DEFAULT '',
  reference text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','posted','failed','cancelled')),
  attempts int NOT NULL DEFAULT 0,
  claimed_at timestamptz,
  last_error text,
  tally_reply text,
  approved_by uuid NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- A bank line can be written once. A cancelled or failed row may be replaced by a new approval.
CREATE UNIQUE INDEX IF NOT EXISTS ca_tally_postings_live_uidx ON public.ca_tally_postings (txn_id) WHERE status IN ('queued','sent','posted');
CREATE UNIQUE INDEX IF NOT EXISTS ca_tally_postings_key_uidx ON public.ca_tally_postings (line_key);
CREATE INDEX IF NOT EXISTS ca_tally_postings_firm_idx ON public.ca_tally_postings (ca_firm_id, company_id, status);

GRANT SELECT ON public.ca_tally_ledgers, public.ca_tally_postings TO authenticated;
GRANT ALL ON public.ca_tally_ledgers, public.ca_tally_postings TO service_role;
ALTER TABLE public.ca_tally_ledgers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_tally_postings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "firm reads tally ledgers" ON public.ca_tally_ledgers;
CREATE POLICY "firm reads tally ledgers" ON public.ca_tally_ledgers FOR SELECT TO authenticated USING (public.user_in_ca_firm(ca_firm_id));
DROP POLICY IF EXISTS "firm reads tally postings" ON public.ca_tally_postings;
CREATE POLICY "firm reads tally postings" ON public.ca_tally_postings FOR SELECT TO authenticated USING (public.user_in_ca_firm(ca_firm_id));
