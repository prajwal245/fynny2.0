-- FynHelp: Tally posting and page credits. Safe to run more than once, and self-contained.
-- Needs the practice backend tables (ca_firms, ca_txns, user_in_ca_firm), which every live project already has.
DO $$
BEGIN
  IF to_regclass('public.ca_firms') IS NULL OR to_regclass('public.ca_txns') IS NULL THEN
    RAISE EXCEPTION 'The practice backend tables (ca_firms, ca_txns) are missing. Apply the earlier migrations first, then run this file again.';
  END IF;
  IF to_regprocedure('public.user_in_ca_firm(uuid)') IS NULL THEN
    RAISE EXCEPTION 'The function user_in_ca_firm(uuid) is missing. Apply the earlier migrations first, then run this file again.';
  END IF;
END $$;

-- ===== Part 0: the Tally connector tables (already there if the connector was set up; skipped if so) =====
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

-- ===== Part 1: Tally posting =====
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

-- ===== Part 2: Tally posting pages (credits) =====
-- FynHelp Tally posting pages (separate from WhatsApp credits, same design): one credit is one page of a document posted to Tally.
-- Credits come in lots (plan allowance each month, trial gift, top-ups). A lot lasts 12 months. Spending takes from
-- the lot that expires first. Every change is written to a ledger, and a refund puts credits back into the lots they
-- came from. All writes go through the functions below (service role only), under a per-firm lock, so two chases
-- running at once can never spend the same credit twice.

CREATE TABLE IF NOT EXISTS public.ca_page_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('plan', 'trial', 'topup', 'bonus')),
  -- plan lots: the month ("2026-10"); trial lot: "trial". With the kind it makes a grant idempotent.
  period text,
  -- topup lots: the payment id. Unique, so one payment can never add credits twice.
  ref text,
  credits int NOT NULL CHECK (credits > 0),
  remaining int NOT NULL CHECK (remaining >= 0 AND remaining <= credits),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ca_page_lots_period_idx ON public.ca_page_lots (ca_firm_id, kind, period) WHERE period IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ca_page_lots_ref_idx ON public.ca_page_lots (ref) WHERE ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS ca_page_lots_live_idx ON public.ca_page_lots (ca_firm_id, expires_at) WHERE remaining > 0;

CREATE TABLE IF NOT EXISTS public.ca_page_ledger (
  id bigserial PRIMARY KEY,
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  lot_id uuid REFERENCES public.ca_page_lots(id) ON DELETE SET NULL,
  delta int NOT NULL,
  reason text NOT NULL CHECK (reason IN ('grant', 'spend', 'refund')),
  -- spend / refund: what it was for (the chase being sent), so each can happen once.
  ref text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ca_page_ledger_firm_idx ON public.ca_page_ledger (ca_firm_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ca_page_ledger_ref_idx ON public.ca_page_ledger (ca_firm_id, reason, ref, lot_id) WHERE ref IS NOT NULL;

-- A top-up order started in Checkout. The credits are granted from this row, never from what the browser says.
CREATE TABLE IF NOT EXISTS public.ca_page_orders (
  order_id text PRIMARY KEY,
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  pack text NOT NULL,
  credits int NOT NULL CHECK (credits > 0),
  amount_paise int NOT NULL CHECK (amount_paise > 0),
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid')),
  payment_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
CREATE INDEX IF NOT EXISTS ca_page_orders_firm_idx ON public.ca_page_orders (ca_firm_id, created_at DESC);

GRANT SELECT ON public.ca_page_lots, public.ca_page_ledger, public.ca_page_orders TO authenticated;
GRANT ALL ON public.ca_page_lots, public.ca_page_ledger, public.ca_page_orders TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.ca_page_ledger_id_seq TO service_role;
ALTER TABLE public.ca_page_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_page_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_page_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "firms read their credit lots" ON public.ca_page_lots;
CREATE POLICY "firms read their credit lots" ON public.ca_page_lots FOR SELECT TO authenticated USING (public.user_in_ca_firm(ca_firm_id));
DROP POLICY IF EXISTS "firms read their credit ledger" ON public.ca_page_ledger;
CREATE POLICY "firms read their credit ledger" ON public.ca_page_ledger FOR SELECT TO authenticated USING (public.user_in_ca_firm(ca_firm_id));
DROP POLICY IF EXISTS "firms read their credit orders" ON public.ca_page_orders;
CREATE POLICY "firms read their credit orders" ON public.ca_page_orders FOR SELECT TO authenticated USING (public.user_in_ca_firm(ca_firm_id));

-- Credits a firm can spend now.
CREATE OR REPLACE FUNCTION public.ca_pages_balance(p_firm uuid)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT coalesce(sum(remaining), 0)::int FROM public.ca_page_lots WHERE ca_firm_id = p_firm AND expires_at > now(); $$;

-- Adds a lot. Returns false when the same grant (plan month, trial, payment) was already made.
CREATE OR REPLACE FUNCTION public.ca_pages_grant(
  p_firm uuid, p_kind text, p_credits int, p_period text, p_ref text, p_months int DEFAULT 12, p_note text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE lot uuid;
BEGIN
  IF p_credits <= 0 THEN RAISE EXCEPTION 'credits must be positive'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('pages:' || p_firm::text));
  INSERT INTO public.ca_page_lots (ca_firm_id, kind, period, ref, credits, remaining, expires_at)
  VALUES (p_firm, p_kind, p_period, p_ref, p_credits, p_credits, now() + make_interval(months => p_months))
  ON CONFLICT DO NOTHING
  RETURNING id INTO lot;
  IF lot IS NULL THEN RETURN false; END IF;
  INSERT INTO public.ca_page_ledger (ca_firm_id, lot_id, delta, reason, note) VALUES (p_firm, lot, p_credits, 'grant', coalesce(p_note, p_kind));
  RETURN true;
END;
$$;

-- Spends credits, oldest-expiring lot first. Returns the balance left, or -1 (and spends nothing) when there are not
-- enough. Spending the same ref twice does nothing the second time (each send attempt uses its own ref).
CREATE OR REPLACE FUNCTION public.ca_pages_spend(p_firm uuid, p_amount int, p_ref text)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE need int := p_amount; take int; l record;
BEGIN
  IF p_amount <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('pages:' || p_firm::text));
  IF p_ref IS NOT NULL AND EXISTS (SELECT 1 FROM public.ca_page_ledger WHERE ca_firm_id = p_firm AND reason = 'spend' AND ref = p_ref)
     AND NOT EXISTS (SELECT 1 FROM public.ca_page_ledger s WHERE s.ca_firm_id = p_firm AND s.reason = 'refund' AND s.ref = p_ref)
  THEN RETURN public.ca_pages_balance(p_firm); END IF;
  IF public.ca_pages_balance(p_firm) < p_amount THEN RETURN -1; END IF;
  FOR l IN SELECT id, remaining FROM public.ca_page_lots
           WHERE ca_firm_id = p_firm AND remaining > 0 AND expires_at > now()
           ORDER BY expires_at, created_at FOR UPDATE
  LOOP
    EXIT WHEN need = 0;
    take := least(l.remaining, need);
    UPDATE public.ca_page_lots SET remaining = remaining - take WHERE id = l.id;
    INSERT INTO public.ca_page_ledger (ca_firm_id, lot_id, delta, reason, ref, note) VALUES (p_firm, l.id, -take, 'spend', p_ref, 'Tally posting pages');
    need := need - take;
  END LOOP;
  RETURN public.ca_pages_balance(p_firm);
END;
$$;

-- Puts a spend back (the message could not be sent). Credits return to the lots they came from; a lot that has since
-- expired stays expired. Safe to call twice.
CREATE OR REPLACE FUNCTION public.ca_pages_refund(p_firm uuid, p_ref text)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE s record; back int := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('pages:' || p_firm::text));
  IF EXISTS (SELECT 1 FROM public.ca_page_ledger WHERE ca_firm_id = p_firm AND reason = 'refund' AND ref = p_ref) THEN RETURN 0; END IF;
  FOR s IN SELECT lot_id, -delta AS n FROM public.ca_page_ledger WHERE ca_firm_id = p_firm AND reason = 'spend' AND ref = p_ref AND lot_id IS NOT NULL
  LOOP
    UPDATE public.ca_page_lots SET remaining = remaining + s.n WHERE id = s.lot_id;
    INSERT INTO public.ca_page_ledger (ca_firm_id, lot_id, delta, reason, ref, note) VALUES (p_firm, s.lot_id, s.n, 'refund', p_ref, 'Not used: page credit returned');
    back := back + s.n;
  END LOOP;
  RETURN back;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ca_pages_balance(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ca_pages_grant(uuid, text, int, text, text, int, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ca_pages_spend(uuid, int, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ca_pages_refund(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ca_pages_balance(uuid), public.ca_pages_grant(uuid, text, int, text, text, int, text),
  public.ca_pages_spend(uuid, int, text), public.ca_pages_refund(uuid, text) TO service_role;

-- Posting options: Contra, split over several ledgers (a charge and its GST), and a note when a person confirms by hand.
ALTER TABLE public.ca_tally_postings ADD COLUMN IF NOT EXISTS voucher_kind text CHECK (voucher_kind IS NULL OR voucher_kind IN ('Contra'));
ALTER TABLE public.ca_tally_postings ADD COLUMN IF NOT EXISTS splits jsonb;
ALTER TABLE public.ca_tally_postings ADD COLUMN IF NOT EXISTS pages_spent int NOT NULL DEFAULT 0;
ALTER TABLE public.ca_tally_postings ADD COLUMN IF NOT EXISTS resolved_note text;
