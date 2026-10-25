-- FynHelp Credits: one credit pays for one WhatsApp reminder sent from FynHelp's shared number.
-- Credits come in lots (plan allowance each month, trial gift, top-ups). A lot lasts 12 months. Spending takes from
-- the lot that expires first. Every change is written to a ledger, and a refund puts credits back into the lots they
-- came from. All writes go through the functions below (service role only), under a per-firm lock, so two chases
-- running at once can never spend the same credit twice.

CREATE TABLE IF NOT EXISTS public.ca_credit_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('plan', 'trial', 'topup', 'auto_topup', 'bonus')),
  -- plan lots: the month ("2026-10"); trial lot: "trial". With the kind it makes a grant idempotent.
  period text,
  -- topup lots: the payment id; auto_topup lots: "auto:YYYY-MM:n". Unique, so one payment can never add credits twice.
  ref text,
  credits int NOT NULL CHECK (credits > 0),
  remaining int NOT NULL CHECK (remaining >= 0 AND remaining <= credits),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ca_credit_lots_period_idx ON public.ca_credit_lots (ca_firm_id, kind, period) WHERE period IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ca_credit_lots_ref_idx ON public.ca_credit_lots (ref) WHERE ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS ca_credit_lots_live_idx ON public.ca_credit_lots (ca_firm_id, expires_at) WHERE remaining > 0;

CREATE TABLE IF NOT EXISTS public.ca_credit_ledger (
  id bigserial PRIMARY KEY,
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  lot_id uuid REFERENCES public.ca_credit_lots(id) ON DELETE SET NULL,
  delta int NOT NULL,
  reason text NOT NULL CHECK (reason IN ('grant', 'spend', 'refund')),
  -- spend / refund: what it was for (the chase being sent), so each can happen once.
  ref text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ca_credit_ledger_firm_idx ON public.ca_credit_ledger (ca_firm_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ca_credit_ledger_ref_idx ON public.ca_credit_ledger (ca_firm_id, reason, ref, lot_id) WHERE ref IS NOT NULL;

-- A top-up order started in Checkout. The credits are granted from this row, never from what the browser says.
CREATE TABLE IF NOT EXISTS public.ca_credit_orders (
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
CREATE INDEX IF NOT EXISTS ca_credit_orders_firm_idx ON public.ca_credit_orders (ca_firm_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ca_credit_settings (
  ca_firm_id uuid PRIMARY KEY REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  auto_topup boolean NOT NULL DEFAULT false,
  auto_pack text NOT NULL DEFAULT 'c500',
  -- Most automatic packs in a calendar month: the spend cap.
  auto_max_per_month int NOT NULL DEFAULT 2 CHECK (auto_max_per_month BETWEEN 1 AND 10),
  low_notified_month text,
  out_notified_month text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ca_credit_lots, public.ca_credit_ledger, public.ca_credit_orders, public.ca_credit_settings TO authenticated;
GRANT ALL ON public.ca_credit_lots, public.ca_credit_ledger, public.ca_credit_orders, public.ca_credit_settings TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.ca_credit_ledger_id_seq TO service_role;
ALTER TABLE public.ca_credit_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_credit_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_credit_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "firms read their credit lots" ON public.ca_credit_lots;
CREATE POLICY "firms read their credit lots" ON public.ca_credit_lots FOR SELECT TO authenticated USING (public.user_in_ca_firm(ca_firm_id));
DROP POLICY IF EXISTS "firms read their credit ledger" ON public.ca_credit_ledger;
CREATE POLICY "firms read their credit ledger" ON public.ca_credit_ledger FOR SELECT TO authenticated USING (public.user_in_ca_firm(ca_firm_id));
DROP POLICY IF EXISTS "firms read their credit orders" ON public.ca_credit_orders;
CREATE POLICY "firms read their credit orders" ON public.ca_credit_orders FOR SELECT TO authenticated USING (public.user_in_ca_firm(ca_firm_id));
DROP POLICY IF EXISTS "firms read their credit settings" ON public.ca_credit_settings;
CREATE POLICY "firms read their credit settings" ON public.ca_credit_settings FOR SELECT TO authenticated USING (public.user_in_ca_firm(ca_firm_id));

-- Credits a firm can spend now.
CREATE OR REPLACE FUNCTION public.ca_credits_balance(p_firm uuid)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT coalesce(sum(remaining), 0)::int FROM public.ca_credit_lots WHERE ca_firm_id = p_firm AND expires_at > now(); $$;

-- Adds a lot. Returns false when the same grant (plan month, trial, payment) was already made.
CREATE OR REPLACE FUNCTION public.ca_credits_grant(
  p_firm uuid, p_kind text, p_credits int, p_period text, p_ref text, p_months int DEFAULT 12, p_note text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE lot uuid;
BEGIN
  IF p_credits <= 0 THEN RAISE EXCEPTION 'credits must be positive'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('credits:' || p_firm::text));
  INSERT INTO public.ca_credit_lots (ca_firm_id, kind, period, ref, credits, remaining, expires_at)
  VALUES (p_firm, p_kind, p_period, p_ref, p_credits, p_credits, now() + make_interval(months => p_months))
  ON CONFLICT DO NOTHING
  RETURNING id INTO lot;
  IF lot IS NULL THEN RETURN false; END IF;
  INSERT INTO public.ca_credit_ledger (ca_firm_id, lot_id, delta, reason, note) VALUES (p_firm, lot, p_credits, 'grant', coalesce(p_note, p_kind));
  RETURN true;
END;
$$;

-- Spends credits, oldest-expiring lot first. Returns the balance left, or -1 (and spends nothing) when there are not
-- enough. Spending the same ref twice does nothing the second time (each send attempt uses its own ref).
CREATE OR REPLACE FUNCTION public.ca_credits_spend(p_firm uuid, p_amount int, p_ref text)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE need int := p_amount; take int; l record;
BEGIN
  IF p_amount <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('credits:' || p_firm::text));
  IF p_ref IS NOT NULL AND EXISTS (SELECT 1 FROM public.ca_credit_ledger WHERE ca_firm_id = p_firm AND reason = 'spend' AND ref = p_ref)
     AND NOT EXISTS (SELECT 1 FROM public.ca_credit_ledger s WHERE s.ca_firm_id = p_firm AND s.reason = 'refund' AND s.ref = p_ref)
  THEN RETURN public.ca_credits_balance(p_firm); END IF;
  IF public.ca_credits_balance(p_firm) < p_amount THEN RETURN -1; END IF;
  FOR l IN SELECT id, remaining FROM public.ca_credit_lots
           WHERE ca_firm_id = p_firm AND remaining > 0 AND expires_at > now()
           ORDER BY expires_at, created_at FOR UPDATE
  LOOP
    EXIT WHEN need = 0;
    take := least(l.remaining, need);
    UPDATE public.ca_credit_lots SET remaining = remaining - take WHERE id = l.id;
    INSERT INTO public.ca_credit_ledger (ca_firm_id, lot_id, delta, reason, ref, note) VALUES (p_firm, l.id, -take, 'spend', p_ref, 'WhatsApp reminder');
    need := need - take;
  END LOOP;
  RETURN public.ca_credits_balance(p_firm);
END;
$$;

-- Puts a spend back (the message could not be sent). Credits return to the lots they came from; a lot that has since
-- expired stays expired. Safe to call twice.
CREATE OR REPLACE FUNCTION public.ca_credits_refund(p_firm uuid, p_ref text)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE s record; back int := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('credits:' || p_firm::text));
  IF EXISTS (SELECT 1 FROM public.ca_credit_ledger WHERE ca_firm_id = p_firm AND reason = 'refund' AND ref = p_ref) THEN RETURN 0; END IF;
  FOR s IN SELECT lot_id, -delta AS n FROM public.ca_credit_ledger WHERE ca_firm_id = p_firm AND reason = 'spend' AND ref = p_ref AND lot_id IS NOT NULL
  LOOP
    UPDATE public.ca_credit_lots SET remaining = remaining + s.n WHERE id = s.lot_id;
    INSERT INTO public.ca_credit_ledger (ca_firm_id, lot_id, delta, reason, ref, note) VALUES (p_firm, s.lot_id, s.n, 'refund', p_ref, 'Not sent: credit returned');
    back := back + s.n;
  END LOOP;
  RETURN back;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ca_credits_balance(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ca_credits_grant(uuid, text, int, text, text, int, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ca_credits_spend(uuid, int, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ca_credits_refund(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ca_credits_balance(uuid), public.ca_credits_grant(uuid, text, int, text, text, int, text),
  public.ca_credits_spend(uuid, int, text), public.ca_credits_refund(uuid, text) TO service_role;
