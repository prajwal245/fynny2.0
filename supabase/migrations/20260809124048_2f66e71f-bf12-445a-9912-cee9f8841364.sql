
DROP POLICY IF EXISTS "Admins can upload resource files" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update resource files" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete resource files" ON storage.objects;
DROP POLICY IF EXISTS "Resources: admin insert" ON storage.objects;
DROP POLICY IF EXISTS "Resources: admin update" ON storage.objects;
DROP POLICY IF EXISTS "Resources: admin delete" ON storage.objects;

CREATE POLICY "resources_admin_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'resources' AND (public.is_admin_user() OR public.is_blog_admin() OR public.has_role(auth.uid(),'intern')));
CREATE POLICY "resources_admin_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'resources' AND (public.is_admin_user() OR public.is_blog_admin() OR public.has_role(auth.uid(),'intern')))
  WITH CHECK (bucket_id = 'resources' AND (public.is_admin_user() OR public.is_blog_admin() OR public.has_role(auth.uid(),'intern')));
CREATE POLICY "resources_admin_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'resources' AND (public.is_admin_user() OR public.is_blog_admin() OR public.has_role(auth.uid(),'intern')));

CREATE POLICY "resource_files_admin_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'resource-files' AND (public.is_admin_user() OR public.is_blog_admin() OR public.has_role(auth.uid(),'intern')))
  WITH CHECK (bucket_id = 'resource-files' AND (public.is_admin_user() OR public.is_blog_admin() OR public.has_role(auth.uid(),'intern')));
CREATE POLICY "resource_files_admin_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'resource-files' AND (public.is_admin_user() OR public.is_blog_admin() OR public.has_role(auth.uid(),'intern')));
