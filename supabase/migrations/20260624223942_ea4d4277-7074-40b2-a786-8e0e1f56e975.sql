DROP POLICY IF EXISTS "CA access insert" ON public.ca_client_access;

CREATE POLICY "CA access insert"
ON public.ca_client_access
FOR INSERT
TO authenticated
WITH CHECK (
  ca_firm_id = get_user_ca_firm_id()
  AND EXISTS (
    SELECT 1 FROM public.ca_access_requests r
    WHERE r.ca_firm_id = ca_client_access.ca_firm_id
      AND r.business_id = ca_client_access.business_id
      AND r.status = 'approved'
  )
);