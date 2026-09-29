
-- Add columns to alerts
ALTER TABLE public.alerts
  ADD COLUMN IF NOT EXISTS resolved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS details text,
  ADD COLUMN IF NOT EXISTS impact text,
  ADD COLUMN IF NOT EXISTS suggested_action text;

-- Add columns to bank_accounts
ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS connected boolean NOT NULL DEFAULT true;

-- Add columns to transactions
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS transaction_date date,
  ADD COLUMN IF NOT EXISTS transaction_time time,
  ADD COLUMN IF NOT EXISTS balance_after numeric;

-- Backfill transaction_date from existing date column
UPDATE public.transactions SET transaction_date = date WHERE transaction_date IS NULL AND date IS NOT NULL;

-- ============ liquidity_metrics ============
CREATE TABLE IF NOT EXISTS public.liquidity_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  cash_position numeric NOT NULL DEFAULT 0,
  burn_rate_current numeric NOT NULL DEFAULT 0,
  runway_months numeric NOT NULL DEFAULT 0,
  runway_days integer NOT NULL DEFAULT 0,
  health_score integer NOT NULL DEFAULT 0,
  health_status text NOT NULL DEFAULT 'unknown',
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.liquidity_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Business access" ON public.liquidity_metrics FOR SELECT USING (business_id = get_user_business_id());
CREATE POLICY "Business insert" ON public.liquidity_metrics FOR INSERT WITH CHECK (business_id = get_user_business_id());
CREATE POLICY "Business update" ON public.liquidity_metrics FOR UPDATE USING (business_id = get_user_business_id());
CREATE POLICY "Business delete" ON public.liquidity_metrics FOR DELETE USING (business_id = get_user_business_id());

CREATE INDEX IF NOT EXISTS idx_liquidity_metrics_business ON public.liquidity_metrics(business_id, recorded_at DESC);

-- ============ cash_flow_trends ============
CREATE TABLE IF NOT EXISTS public.cash_flow_trends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  period_type text NOT NULL DEFAULT 'month',
  period_start date NOT NULL,
  period_label text NOT NULL,
  money_in numeric NOT NULL DEFAULT 0,
  money_out numeric NOT NULL DEFAULT 0,
  net_cash numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cash_flow_trends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Business access" ON public.cash_flow_trends FOR SELECT USING (business_id = get_user_business_id());
CREATE POLICY "Business insert" ON public.cash_flow_trends FOR INSERT WITH CHECK (business_id = get_user_business_id());
CREATE POLICY "Business update" ON public.cash_flow_trends FOR UPDATE USING (business_id = get_user_business_id());
CREATE POLICY "Business delete" ON public.cash_flow_trends FOR DELETE USING (business_id = get_user_business_id());

CREATE INDEX IF NOT EXISTS idx_cash_flow_trends_business ON public.cash_flow_trends(business_id, period_type, period_start DESC);

-- ============ ai_insights ============
CREATE TABLE IF NOT EXISTS public.ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  module text NOT NULL,
  message text NOT NULL,
  confidence_score integer NOT NULL DEFAULT 0,
  data_quality text NOT NULL DEFAULT 'unknown',
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Business access" ON public.ai_insights FOR SELECT USING (business_id = get_user_business_id());
CREATE POLICY "Business insert" ON public.ai_insights FOR INSERT WITH CHECK (business_id = get_user_business_id());
CREATE POLICY "Business update" ON public.ai_insights FOR UPDATE USING (business_id = get_user_business_id());
CREATE POLICY "Business delete" ON public.ai_insights FOR DELETE USING (business_id = get_user_business_id());

CREATE INDEX IF NOT EXISTS idx_ai_insights_business ON public.ai_insights(business_id, module, generated_at DESC);
