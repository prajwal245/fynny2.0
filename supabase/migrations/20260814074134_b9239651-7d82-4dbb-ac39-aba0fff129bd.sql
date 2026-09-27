DROP POLICY IF EXISTS "Intern admin manage glossary" ON public.resource_glossary;

CREATE POLICY "Admin team manages resource glossary"
ON public.resource_glossary
FOR ALL
TO authenticated
USING (public.is_admin_user() OR public.is_blog_admin() OR public.has_role(auth.uid(), 'intern'::public.app_role))
WITH CHECK (public.is_admin_user() OR public.is_blog_admin() OR public.has_role(auth.uid(), 'intern'::public.app_role));

GRANT SELECT ON public.resource_glossary TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resource_glossary TO authenticated;
GRANT ALL ON public.resource_glossary TO service_role;

GRANT SELECT ON public.resources TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resources TO authenticated;
GRANT ALL ON public.resources TO service_role;