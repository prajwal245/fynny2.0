DROP POLICY IF EXISTS "site_media_admin_read" ON storage.objects;
DROP POLICY IF EXISTS "site_media_admin_write" ON storage.objects;
DROP POLICY IF EXISTS "site_media_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "site_media_admin_delete" ON storage.objects;

CREATE POLICY "site_media_admin_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'site-media' AND (public.is_admin_user() OR public.is_blog_admin() OR public.has_role(auth.uid(), 'intern'::app_role)));

CREATE POLICY "site_media_admin_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'site-media' AND (public.is_admin_user() OR public.is_blog_admin() OR public.has_role(auth.uid(), 'intern'::app_role)));

CREATE POLICY "site_media_admin_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'site-media' AND (public.is_admin_user() OR public.is_blog_admin() OR public.has_role(auth.uid(), 'intern'::app_role)))
  WITH CHECK (bucket_id = 'site-media' AND (public.is_admin_user() OR public.is_blog_admin() OR public.has_role(auth.uid(), 'intern'::app_role)));

CREATE POLICY "site_media_admin_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'site-media' AND (public.is_admin_user() OR public.is_blog_admin() OR public.has_role(auth.uid(), 'intern'::app_role)));