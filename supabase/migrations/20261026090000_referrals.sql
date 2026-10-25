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
