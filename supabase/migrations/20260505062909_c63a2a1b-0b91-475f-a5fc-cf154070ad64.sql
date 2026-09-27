-- Subscriptions
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID,
  user_id UUID,
  plan_type TEXT NOT NULL DEFAULT 'free_trial',
  status TEXT NOT NULL DEFAULT 'active',
  mrr NUMERIC(10,2) NOT NULL DEFAULT 0,
  billing_cycle TEXT NOT NULL DEFAULT 'monthly',
  next_billing_date DATE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at TIMESTAMPTZ,
  payment_method TEXT,
  payment_method_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage subscriptions"
  ON public.subscriptions FOR ALL TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

CREATE POLICY "Users view own subscription"
  ON public.subscriptions FOR SELECT
  USING (business_id = public.get_user_business_id());

CREATE INDEX IF NOT EXISTS idx_subscriptions_business ON public.subscriptions(business_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);

-- Subscription history
CREATE TABLE IF NOT EXISTS public.subscription_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  old_plan TEXT, new_plan TEXT,
  old_mrr NUMERIC(10,2), new_mrr NUMERIC(10,2),
  change_reason TEXT,
  changed_by UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.subscription_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage sub history"
  ON public.subscription_history FOR ALL TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

-- AI usage logs
CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  business_id UUID,
  prompt TEXT NOT NULL,
  response TEXT,
  model TEXT NOT NULL DEFAULT 'google/gemini-2.5-flash',
  tokens_used INTEGER,
  cost_usd NUMERIC(10,4),
  response_time_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read AI logs"
  ON public.ai_usage_logs FOR SELECT TO authenticated
  USING (public.is_admin_user());

CREATE POLICY "Users insert own AI logs"
  ON public.ai_usage_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users view own AI logs"
  ON public.ai_usage_logs FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_ai_logs_user ON public.ai_usage_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_logs_business ON public.ai_usage_logs(business_id, created_at DESC);

-- Feature flags
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_name TEXT UNIQUE NOT NULL,
  display_name TEXT,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT,
  target_segment TEXT NOT NULL DEFAULT 'all',
  rollout_percentage INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone reads feature flags"
  ON public.feature_flags FOR SELECT
  USING (true);

CREATE POLICY "Admins manage feature flags"
  ON public.feature_flags FOR ALL TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

-- Revenue analytics cache
CREATE TABLE IF NOT EXISTS public.revenue_analytics_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name TEXT NOT NULL,
  metric_value NUMERIC(12,2),
  period TEXT,
  date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.revenue_analytics_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read revenue cache"
  ON public.revenue_analytics_cache FOR SELECT TO authenticated
  USING (public.is_admin_user());

CREATE POLICY "Admins write revenue cache"
  ON public.revenue_analytics_cache FOR ALL TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

CREATE INDEX IF NOT EXISTS idx_revenue_cache_metric ON public.revenue_analytics_cache(metric_name, date);

-- Triggers for updated_at
CREATE TRIGGER trg_subscriptions_updated
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_feature_flags_updated
  BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed feature flags
INSERT INTO public.feature_flags (flag_name, display_name, description, enabled, target_segment, rollout_percentage) VALUES
  ('decision_simulator', 'Decision Simulator', 'Allow users to run financial scenario simulations', true, 'pro_users', 100),
  ('gst_intelligence', 'GST Intelligence', 'GST deadline tracking and compliance alerts', true, 'all', 100),
  ('market_intelligence', 'Market Intelligence (Beta)', 'Competitor analysis and market trends', true, 'beta_users', 25),
  ('banking_intelligence', 'Banking Intelligence', 'Bank account aggregation and reconciliation', false, 'enterprise_users', 0),
  ('ca_partner_ecosystem', 'CA Partner Ecosystem', 'CA portal for accountant collaboration', true, 'pro_users', 50),
  ('whatsapp_notifications', 'WhatsApp Notifications', 'Send alerts via WhatsApp', false, 'all', 0),
  ('advanced_analytics', 'Advanced Analytics', 'Deep financial analytics and forecasting', true, 'pro_users', 100),
  ('multi_currency', 'Multi-currency Support', 'Support for USD, EUR, GBP', false, 'enterprise_users', 0)
ON CONFLICT (flag_name) DO NOTHING;