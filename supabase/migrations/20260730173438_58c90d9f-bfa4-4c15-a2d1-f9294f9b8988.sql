ALTER TABLE public.ca_approval_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_only" ON public.ca_approval_log;
CREATE POLICY "service_role_only"
ON public.ca_approval_log
FOR ALL
USING (false)
WITH CHECK (false);

REVOKE ALL ON public.ca_approval_log FROM anon, authenticated;
GRANT ALL ON public.ca_approval_log TO service_role;

DROP POLICY IF EXISTS "CA access insert" ON public.ca_client_access;
CREATE POLICY "CA access insert"
ON public.ca_client_access
FOR INSERT
TO authenticated
WITH CHECK (
  ca_firm_id = public.get_user_ca_firm_id()
  AND business_id = public.get_user_business_id()
);