
CREATE TABLE IF NOT EXISTS public.fynny_briefs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  brief_date date NOT NULL DEFAULT CURRENT_DATE,
  content text NOT NULL,
  delivered boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fynny_briefs TO authenticated;
GRANT ALL ON public.fynny_briefs TO service_role;

ALTER TABLE public.fynny_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Business access" ON public.fynny_briefs FOR SELECT
  TO authenticated USING (business_id = get_user_business_id());
CREATE POLICY "Business insert" ON public.fynny_briefs FOR INSERT
  TO authenticated WITH CHECK (business_id = get_user_business_id());
CREATE POLICY "Business update" ON public.fynny_briefs FOR UPDATE
  TO authenticated USING (business_id = get_user_business_id())
  WITH CHECK (business_id = get_user_business_id());
CREATE POLICY "Business delete" ON public.fynny_briefs FOR DELETE
  TO authenticated USING (business_id = get_user_business_id());
