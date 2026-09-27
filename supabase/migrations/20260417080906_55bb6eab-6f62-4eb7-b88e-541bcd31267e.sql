CREATE POLICY "CA can view client businesses"
ON public.businesses FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.ca_client_access
    WHERE ca_client_access.business_id = businesses.id
      AND ca_client_access.ca_firm_id = public.get_user_ca_firm_id()
      AND ca_client_access.is_active = true
  )
);