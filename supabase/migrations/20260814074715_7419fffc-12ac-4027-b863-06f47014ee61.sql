DROP POLICY IF EXISTS "Intern admin manage videos" ON public.resource_videos;
CREATE POLICY "Admin team manage videos" ON public.resource_videos
  FOR ALL TO authenticated
  USING (public.is_admin_user() OR public.has_role(auth.uid(), 'intern'::public.app_role) OR public.has_role(auth.uid(), 'blog_admin'::public.app_role))
  WITH CHECK (public.is_admin_user() OR public.has_role(auth.uid(), 'intern'::public.app_role) OR public.has_role(auth.uid(), 'blog_admin'::public.app_role));