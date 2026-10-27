-- FynHelp: everything added in late October 2026, in the order it must run.
-- Safe to run again: every statement checks before it changes anything.
-- Runs as one transaction: if any line fails, nothing is changed. Paste ALL of it in Supabase -> SQL Editor -> Run.
BEGIN;

-- ============================================================
-- 20261026090000_referrals
-- ============================================================
-- Firm-to-firm referrals. Every firm has a referral code. When a firm that joined with someone's code adds its
-- first client, both firms earn one extra month (rewards are recorded once each, so nothing is ever paid twice).

ALTER TABLE public.ca_firms ADD COLUMN IF NOT EXISTS referral_code text;
CREATE UNIQUE INDEX IF NOT EXISTS ca_firms_referral_code_idx ON public.ca_firms (referral_code) WHERE referral_code IS NOT NULL;

-- Days added to a trial by rewards. Applied when the trial clock starts, so a bonus earned before the first upload is not lost.
ALTER TABLE public.ca_billing ADD COLUMN IF NOT EXISTS trial_bonus_days int NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.ca_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  referred_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  code_used text NOT NULL,
  -- signed_up: joined with the code; qualified: added a first client (both rewarded); void: rejected as abuse
  status text NOT NULL DEFAULT 'signed_up' CHECK (status IN ('signed_up', 'qualified', 'void')),
  void_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  qualified_at timestamptz,
  -- A firm can be referred only once, and never by itself.
  UNIQUE (referred_firm_id),
  CHECK (referrer_firm_id <> referred_firm_id)
);
CREATE INDEX IF NOT EXISTS ca_referrals_referrer_idx ON public.ca_referrals (referrer_firm_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ca_referral_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id uuid NOT NULL REFERENCES public.ca_referrals(id) ON DELETE CASCADE,
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('referrer', 'referred')),
  months int NOT NULL DEFAULT 1,
  -- trial_extension: 30 days added to the free trial now. billing_credit: one month's fee credited by our billing team.
  mode text NOT NULL CHECK (mode IN ('trial_extension', 'billing_credit')),
  status text NOT NULL CHECK (status IN ('applied', 'pending_billing', 'done')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  done_at timestamptz,
  -- One reward per side per referral: the guarantee against paying twice.
  UNIQUE (referral_id, role)
);
CREATE INDEX IF NOT EXISTS ca_referral_rewards_firm_idx ON public.ca_referral_rewards (ca_firm_id, created_at DESC);

GRANT SELECT ON public.ca_referrals, public.ca_referral_rewards TO authenticated;
GRANT ALL ON public.ca_referrals, public.ca_referral_rewards TO service_role;
ALTER TABLE public.ca_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_referral_rewards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "firms read their referrals" ON public.ca_referrals;
CREATE POLICY "firms read their referrals" ON public.ca_referrals
  FOR SELECT TO authenticated USING (public.user_in_ca_firm(referrer_firm_id) OR public.user_in_ca_firm(referred_firm_id));
DROP POLICY IF EXISTS "firms read their rewards" ON public.ca_referral_rewards;
CREATE POLICY "firms read their rewards" ON public.ca_referral_rewards
  FOR SELECT TO authenticated USING (public.user_in_ca_firm(ca_firm_id));

-- ============================================================
-- 20261027090000_test_firms
-- ============================================================
-- Tester accounts: a firm flagged is_test is a sandbox. It is invisible to every other firm (the existing
-- firm-scoped row security already does that), and it can never be mixed with real data:
--   * only the platform (service role or a senior admin) can create or change the flag;
--   * a user can never belong to both a test firm and a real firm;
--   * reports for the business read production_firms, which leaves test (and demo) firms out.

ALTER TABLE public.ca_firms ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS ca_firms_is_test_idx ON public.ca_firms (id) WHERE is_test;

-- 1. A firm's own users cannot flag (or unflag) their firm as a test firm.
CREATE OR REPLACE FUNCTION public.guard_ca_firm_test_flag()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') IN ('authenticated', 'anon') AND NOT public.is_senior_admin() THEN
    IF TG_OP = 'INSERT' AND NEW.is_test THEN
      RAISE EXCEPTION 'Only the platform can create a test firm.' USING ERRCODE = '42501';
    ELSIF TG_OP = 'UPDATE' AND NEW.is_test IS DISTINCT FROM OLD.is_test THEN
      RAISE EXCEPTION 'Only the platform can change whether a firm is a test firm.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_ca_firm_test_flag ON public.ca_firms;
CREATE TRIGGER trg_guard_ca_firm_test_flag
  BEFORE INSERT OR UPDATE OF is_test ON public.ca_firms
  FOR EACH ROW EXECUTE FUNCTION public.guard_ca_firm_test_flag();
REVOKE EXECUTE ON FUNCTION public.guard_ca_firm_test_flag() FROM PUBLIC, anon, authenticated;

-- 2. One user, one world: test firms and real firms never share a person. Holds for everyone, service role included.
CREATE OR REPLACE FUNCTION public.assert_no_test_mixing(_user uuid, _firm uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE target_is_test boolean;
BEGIN
  IF _user IS NULL OR _firm IS NULL THEN RETURN; END IF;
  SELECT f.is_test INTO target_is_test FROM public.ca_firms f WHERE f.id = _firm;
  IF target_is_test IS NULL THEN RETURN; END IF;
  IF EXISTS (
    SELECT 1 FROM public.ca_firms f
    WHERE f.id <> _firm AND f.is_test <> target_is_test
      AND (f.user_id = _user
           OR EXISTS (SELECT 1 FROM public.ca_firm_members m
                      WHERE m.ca_firm_id = f.id AND m.user_id = _user AND m.status <> 'revoked'))
  ) THEN
    RAISE EXCEPTION 'A tester account cannot be part of a real firm, and a real account cannot be part of a test firm.'
      USING ERRCODE = '23514';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.assert_no_test_mixing(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_firm_owner_no_test_mixing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN PERFORM public.assert_no_test_mixing(NEW.user_id, NEW.id); RETURN NEW; END; $$;
CREATE OR REPLACE FUNCTION public.trg_member_no_test_mixing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN PERFORM public.assert_no_test_mixing(NEW.user_id, NEW.ca_firm_id); RETURN NEW; END; $$;
REVOKE EXECUTE ON FUNCTION public.trg_firm_owner_no_test_mixing() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_member_no_test_mixing() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_firm_owner_no_test_mixing ON public.ca_firms;
CREATE TRIGGER trg_firm_owner_no_test_mixing
  AFTER INSERT OR UPDATE OF user_id, is_test ON public.ca_firms
  FOR EACH ROW EXECUTE FUNCTION public.trg_firm_owner_no_test_mixing();
DROP TRIGGER IF EXISTS trg_member_no_test_mixing ON public.ca_firm_members;
CREATE TRIGGER trg_member_no_test_mixing
  AFTER INSERT OR UPDATE OF user_id, ca_firm_id, status ON public.ca_firm_members
  FOR EACH ROW EXECUTE FUNCTION public.trg_member_no_test_mixing();

-- 3. The firms that count in reports, billing runs and dashboards: no test firms, no demo firms.
-- Read with the service role only; it is not exposed to the browser.
CREATE OR REPLACE VIEW public.production_firms WITH (security_invoker = true) AS
  SELECT * FROM public.ca_firms WHERE NOT is_test AND NOT is_demo;
REVOKE ALL ON public.production_firms FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.production_firms TO service_role;

-- ============================================================
-- 20261028090000_credits
-- ============================================================
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

-- ============================================================
-- 20261029090000_upload_links
-- ============================================================
-- Upload links: a client taps "Upload documents" in a WhatsApp reminder and lands on a page that needs no login.
-- The link carries a random token; only its SHA-256 hash is stored, so a database leak does not expose live links.
-- A link belongs to one chase (and so one client), expires, and takes a limited number of files.

CREATE TABLE IF NOT EXISTS public.ca_upload_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  business_id uuid,
  request_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  files_uploaded int NOT NULL DEFAULT 0,
  max_files int NOT NULL DEFAULT 25 CHECK (max_files BETWEEN 1 AND 100),
  last_used_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS ca_upload_links_firm_idx ON public.ca_upload_links (ca_firm_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ca_upload_links_request_idx ON public.ca_upload_links (request_id) WHERE request_id IS NOT NULL;

-- Only the server (service role) reads or writes links. Nothing here is reachable from the browser.
ALTER TABLE public.ca_upload_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ca_upload_links FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ca_upload_links TO service_role;

-- Counts one more file against a link, but only while the link is live and under its limit. Returns true if taken.
CREATE OR REPLACE FUNCTION public.ca_upload_link_take(p_link uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE n int;
BEGIN
  UPDATE public.ca_upload_links
     SET files_uploaded = files_uploaded + 1, last_used_at = now()
   WHERE id = p_link AND revoked_at IS NULL AND expires_at > now() AND files_uploaded < max_files;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n = 1;
END;
$$;
-- Gives a file slot back when the file could not be kept.
CREATE OR REPLACE FUNCTION public.ca_upload_link_give_back(p_link uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ UPDATE public.ca_upload_links SET files_uploaded = greatest(files_uploaded - 1, 0) WHERE id = p_link; $$;

REVOKE EXECUTE ON FUNCTION public.ca_upload_link_take(uuid), public.ca_upload_link_give_back(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ca_upload_link_take(uuid), public.ca_upload_link_give_back(uuid) TO service_role;

-- ============================================================
-- 20261030090000_touchpoints
-- ============================================================
-- Follow-ups for people who stall on the way to a working, paying firm ("abandoned cart" recovery).
-- A row is a person who needs a human touch (a call or a WhatsApp), why, and how it ended. The system opens a
-- row when a stall is detected, closes it by itself when the person moves on (and notes whether our nudge came
-- first), and a person at FynHelp closes the rest with an outcome. Server only: nothing here is readable by a browser.

CREATE TABLE IF NOT EXISTS public.ca_touchpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- What stalled: signup_unfinished, no_client, no_upload, trial_stalled, checkout_abandoned,
  -- trial_ending_unpaid, trial_ended_unpaid, payment_failed, paid_quiet.
  kind text NOT NULL,
  -- Makes a follow-up once-only per stall: "" for once ever, or a month / plan for repeatable ones.
  key text NOT NULL DEFAULT '',
  user_id uuid,
  ca_firm_id uuid REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  email text,
  name text,
  phone text,
  whatsapp_ok boolean NOT NULL DEFAULT false,
  -- A plain sentence for the person doing the follow-up, and the figures behind it.
  headline text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- hot: money is at stake or the trial is about to end.
  hot boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'auto_resolved', 'dismissed')),
  due_at timestamptz NOT NULL DEFAULT now(),
  snoozed_until timestamptz,
  email_sent_at timestamptz,
  -- Who did what: reached, no_answer, not_interested, needs_demo, wrong_number, other.
  outcome text,
  note text,
  done_by text,
  done_at timestamptz,
  -- Closed by the person moving on by themselves. recovered: that happened after we reached out (email or person).
  resolved_at timestamptz,
  recovered boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One follow-up per stall and person (a firm, or a sign-up with no firm yet).
CREATE UNIQUE INDEX IF NOT EXISTS ca_touchpoints_once_idx
  ON public.ca_touchpoints (kind, key, (coalesce(ca_firm_id::text, user_id::text)));
CREATE INDEX IF NOT EXISTS ca_touchpoints_open_idx ON public.ca_touchpoints (status, due_at) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS ca_touchpoints_firm_idx ON public.ca_touchpoints (ca_firm_id);

ALTER TABLE public.ca_touchpoints ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ca_touchpoints FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ca_touchpoints TO service_role;

-- ============================================================
-- 20261031090000_touch_whatsapp
-- ============================================================
-- WhatsApp for follow-ups: what was sent, what the person answered, and who asked us to stop.
ALTER TABLE public.ca_touchpoints
  ADD COLUMN IF NOT EXISTS whatsapp_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_wamid text,
  ADD COLUMN IF NOT EXISTS whatsapp_template text,
  ADD COLUMN IF NOT EXISTS whatsapp_error text,
  -- The person tapped "Call me" or wrote back: a human should act today.
  ADD COLUMN IF NOT EXISTS callback_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS replied_at timestamptz;

-- Numbers that said "Stop messages". Keyed by the last 10 digits, the same key everywhere else uses.
CREATE TABLE IF NOT EXISTS public.ca_touch_optout (
  phone_key text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ca_touch_optout ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ca_touch_optout FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ca_touch_optout TO service_role;

-- ============================================================
-- 20261101090000_coupon_auto
-- ============================================================
-- Money coupons no longer need an Offer made by hand in Razorpay. FynHelp creates the discounted Razorpay plan itself
-- (Razorpay lets plans be created through its API, but not offers) and, for "first payment only" codes, moves the
-- subscription back to the normal plan after the first period. Older coupons that carry a Razorpay offer keep working.
ALTER TABLE public.ca_coupons DROP CONSTRAINT IF EXISTS ca_coupons_offer;

-- first: the discount applies to the first payment only. forever: to every payment of the plan.
ALTER TABLE public.ca_coupons ADD COLUMN IF NOT EXISTS duration text NOT NULL DEFAULT 'first';
ALTER TABLE public.ca_coupons DROP CONSTRAINT IF EXISTS ca_coupons_duration;
ALTER TABLE public.ca_coupons ADD CONSTRAINT ca_coupons_duration CHECK (duration IN ('first', 'forever'));

-- The firm paid on a discounted plan that still has to be moved back to the normal one after the first period.
ALTER TABLE public.ca_billing ADD COLUMN IF NOT EXISTS coupon_revert_pending boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS ca_billing_coupon_revert_idx ON public.ca_billing (ca_firm_id) WHERE coupon_revert_pending;

COMMIT;
