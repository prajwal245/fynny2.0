-- 1. Media assets table (Media Library backend)
CREATE TABLE IF NOT EXISTS public.media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  file_path text NOT NULL UNIQUE,
  public_url text NOT NULL,
  folder text NOT NULL DEFAULT 'uploads',
  size_bytes bigint,
  width integer,
  height integer,
  mime_type text,
  file_hash text,
  version integer NOT NULL DEFAULT 1,
  used_in text[] NOT NULL DEFAULT '{}',
  alt_text text,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS media_assets_folder_idx ON public.media_assets(folder);
CREATE INDEX IF NOT EXISTS media_assets_hash_idx ON public.media_assets(file_hash);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_assets TO authenticated;
GRANT ALL ON public.media_assets TO service_role;

ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin team manages media assets" ON public.media_assets;
CREATE POLICY "Admin team manages media assets"
  ON public.media_assets FOR ALL TO authenticated
  USING (public.is_admin_user() OR public.is_blog_admin() OR public.has_role(auth.uid(), 'intern'::app_role))
  WITH CHECK (public.is_admin_user() OR public.is_blog_admin() OR public.has_role(auth.uid(), 'intern'::app_role));

DROP TRIGGER IF EXISTS update_media_assets_updated_at ON public.media_assets;
CREATE TRIGGER update_media_assets_updated_at
  BEFORE UPDATE ON public.media_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Glossary: remove blanket authenticated write access
DROP POLICY IF EXISTS "admin write glossary" ON public.glossary_terms;
CREATE POLICY "Admin team manages glossary"
  ON public.glossary_terms FOR ALL TO authenticated
  USING (public.is_admin_user() OR public.is_blog_admin() OR public.has_role(auth.uid(), 'intern'::app_role))
  WITH CHECK (public.is_admin_user() OR public.is_blog_admin() OR public.has_role(auth.uid(), 'intern'::app_role));

-- 3. Resources: ops admins / support content team were locked out of writes
DROP POLICY IF EXISTS "Intern admin manage resources" ON public.resources;
DROP POLICY IF EXISTS "Admins can insert resources" ON public.resources;
DROP POLICY IF EXISTS "Admins can update resources" ON public.resources;
DROP POLICY IF EXISTS "Admins can delete resources" ON public.resources;
DROP POLICY IF EXISTS "Admins can view all resources" ON public.resources;
CREATE POLICY "Admin team manages resources"
  ON public.resources FOR ALL TO authenticated
  USING (public.is_admin_user() OR public.is_blog_admin() OR public.has_role(auth.uid(), 'intern'::app_role))
  WITH CHECK (public.is_admin_user() OR public.is_blog_admin() OR public.has_role(auth.uid(), 'intern'::app_role));