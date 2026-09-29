CREATE TABLE IF NOT EXISTS public.glossary_terms (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  term text NOT NULL,
  definition text NOT NULL,
  category text NOT NULL DEFAULT 'General',
  is_published boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.glossary_terms TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.glossary_terms TO authenticated;
GRANT ALL ON public.glossary_terms TO service_role;

ALTER TABLE public.glossary_terms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read glossary" ON public.glossary_terms FOR SELECT USING (true);
CREATE POLICY "admin write glossary" ON public.glossary_terms FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_glossary_terms_updated_at
BEFORE UPDATE ON public.glossary_terms
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();