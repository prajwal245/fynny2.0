CREATE OR REPLACE FUNCTION public.is_demo_viewer()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = auth.uid()
      AND lower(u.email) = 'adireddytarun@fynhelp.com'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_demo_viewer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_demo_viewer() TO authenticated, service_role;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND coalesce(qual,'') LIKE '%4b30494f-4c30-4a74-a6bb-6bf56493a97d%'
      AND coalesce(qual,'') NOT LIKE '%is_demo_viewer%'
  LOOP
    IF r.with_check IS NULL THEN
      EXECUTE format('ALTER POLICY %I ON public.%I USING ((%s) AND public.is_demo_viewer())',
                     r.policyname, r.tablename, r.qual);
    ELSE
      EXECUTE format('ALTER POLICY %I ON public.%I USING ((%s) AND public.is_demo_viewer()) WITH CHECK ((%s) AND public.is_demo_viewer())',
                     r.policyname, r.tablename, r.qual, r.with_check);
    END IF;
  END LOOP;
END $$;