
CREATE TABLE IF NOT EXISTS public.generated_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  report_type TEXT NOT NULL,
  report_name TEXT NOT NULL,
  generated_by TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  file_url TEXT,
  file_size BIGINT,
  status TEXT NOT NULL DEFAULT 'generating',
  parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.generated_reports TO authenticated;
GRANT SELECT ON public.generated_reports TO anon;
GRANT ALL ON public.generated_reports TO service_role;

ALTER TABLE public.generated_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Demo reports are publicly readable"
  ON public.generated_reports FOR SELECT
  TO anon, authenticated
  USING (business_id = '4b30494f-4c30-4a74-a6bb-6bf56493a97d'::uuid);

CREATE POLICY "Users can view their business reports"
  ON public.generated_reports FOR SELECT
  TO authenticated
  USING (business_id = public.get_user_business_id());

CREATE POLICY "Users can insert reports for their business or demo"
  ON public.generated_reports FOR INSERT
  TO authenticated
  WITH CHECK (
    business_id = public.get_user_business_id()
    OR business_id = '4b30494f-4c30-4a74-a6bb-6bf56493a97d'::uuid
  );

CREATE POLICY "Anonymous demo inserts"
  ON public.generated_reports FOR INSERT
  TO anon
  WITH CHECK (business_id = '4b30494f-4c30-4a74-a6bb-6bf56493a97d'::uuid);

CREATE POLICY "Users can update their business reports"
  ON public.generated_reports FOR UPDATE
  TO authenticated
  USING (
    business_id = public.get_user_business_id()
    OR business_id = '4b30494f-4c30-4a74-a6bb-6bf56493a97d'::uuid
  );

CREATE POLICY "Anonymous demo updates"
  ON public.generated_reports FOR UPDATE
  TO anon
  USING (business_id = '4b30494f-4c30-4a74-a6bb-6bf56493a97d'::uuid);

CREATE INDEX idx_generated_reports_business_id ON public.generated_reports(business_id, generated_at DESC);

CREATE TRIGGER update_generated_reports_updated_at
  BEFORE UPDATE ON public.generated_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.generated_reports (business_id, report_type, report_name, generated_by, status, generated_at, file_size)
VALUES
  ('4b30494f-4c30-4a74-a6bb-6bf56493a97d', 'profit_loss', 'Profit & Loss', 'Demo User', 'completed', now() - interval '2 days', 245678),
  ('4b30494f-4c30-4a74-a6bb-6bf56493a97d', 'cash_flow', 'Cash Flow', 'Demo User', 'completed', now() - interval '5 days', 198432),
  ('4b30494f-4c30-4a74-a6bb-6bf56493a97d', 'gst_summary', 'GST Summary', 'Demo User', 'completed', now() - interval '8 days', 156890),
  ('4b30494f-4c30-4a74-a6bb-6bf56493a97d', 'burn_rate', 'Burn Rate', 'Demo User', 'completed', now() - interval '12 days', 167234),
  ('4b30494f-4c30-4a74-a6bb-6bf56493a97d', 'board_pack', 'Investor Board Pack', 'Demo User', 'completed', now() - interval '18 days', 412567);
