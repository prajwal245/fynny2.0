DROP POLICY IF EXISTS "Admin can manage all blog posts" ON public.blog_posts;

CREATE POLICY "Admin and blog admin can manage blog posts"
  ON public.blog_posts FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin'::public.app_role, 'admin'::public.app_role, 'blog_admin'::public.app_role)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin'::public.app_role, 'admin'::public.app_role, 'blog_admin'::public.app_role)
    )
  );

CREATE OR REPLACE FUNCTION public.is_blog_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('super_admin'::public.app_role, 'admin'::public.app_role, 'blog_admin'::public.app_role)
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_blog_admin() TO authenticated;