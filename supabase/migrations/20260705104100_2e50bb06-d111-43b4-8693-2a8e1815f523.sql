CREATE TABLE IF NOT EXISTS public.investor_manual_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  metric_name text NOT NULL,
  value text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT investor_manual_metrics_unique UNIQUE (business_id, metric_name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.investor_manual_metrics TO authenticated;
GRANT ALL ON public.investor_manual_metrics TO service_role;

ALTER TABLE public.investor_manual_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own investor metrics"
  ON public.investor_manual_metrics FOR SELECT
  TO authenticated
  USING (business_id = public.get_user_business_id());

CREATE POLICY "Users can insert own investor metrics"
  ON public.investor_manual_metrics FOR INSERT
  TO authenticated
  WITH CHECK (business_id = public.get_user_business_id());

CREATE POLICY "Users can update own investor metrics"
  ON public.investor_manual_metrics FOR UPDATE
  TO authenticated
  USING (business_id = public.get_user_business_id())
  WITH CHECK (business_id = public.get_user_business_id());

CREATE POLICY "Users can delete own investor metrics"
  ON public.investor_manual_metrics FOR DELETE
  TO authenticated
  USING (business_id = public.get_user_business_id());

CREATE TRIGGER update_investor_manual_metrics_updated_at
  BEFORE UPDATE ON public.investor_manual_metrics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();