CREATE TABLE public.demo_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.demo_organizations(id) ON DELETE CASCADE,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_demo_insights_org_id ON public.demo_insights(org_id);
CREATE INDEX idx_demo_insights_created_at ON public.demo_insights(created_at DESC);

ALTER TABLE public.demo_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read demo insights"
ON public.demo_insights FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Anyone can create demo insights"
ON public.demo_insights FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Admins can delete demo insights"
ON public.demo_insights FOR DELETE
TO authenticated
USING (is_admin_user());