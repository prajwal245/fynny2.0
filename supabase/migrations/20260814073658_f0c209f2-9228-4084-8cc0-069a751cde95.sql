DROP POLICY IF EXISTS "blog images insert by editors" ON storage.objects;
DROP POLICY IF EXISTS "blog images update by editors" ON storage.objects;
DROP POLICY IF EXISTS "blog images delete by editors" ON storage.objects;

CREATE POLICY "blog images insert by admin team"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'blog-images' AND (public.is_blog_editor() OR public.is_admin_user() OR public.has_role(auth.uid(), 'intern'::public.app_role)));

CREATE POLICY "blog images update by admin team"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'blog-images' AND (public.is_blog_editor() OR public.is_admin_user() OR public.has_role(auth.uid(), 'intern'::public.app_role)))
WITH CHECK (bucket_id = 'blog-images' AND (public.is_blog_editor() OR public.is_admin_user() OR public.has_role(auth.uid(), 'intern'::public.app_role)));

CREATE POLICY "blog images delete by admin team"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'blog-images' AND (public.is_blog_editor() OR public.is_admin_user() OR public.has_role(auth.uid(), 'intern'::public.app_role)));