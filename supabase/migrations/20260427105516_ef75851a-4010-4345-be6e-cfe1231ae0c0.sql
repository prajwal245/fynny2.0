-- Fix get_user_ca_firm_id to also recognize active firm members
CREATE OR REPLACE FUNCTION public.get_user_ca_firm_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT firm_id FROM (
    SELECT id AS firm_id FROM public.ca_firms WHERE user_id = auth.uid()
    UNION
    SELECT ca_firm_id AS firm_id FROM public.ca_firm_members
      WHERE user_id = auth.uid() AND status = 'active'
  ) t
  LIMIT 1
$$;

-- Lock down SECURITY DEFINER helpers: revoke from anon, allow only authenticated
REVOKE EXECUTE ON FUNCTION public.get_user_business_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_ca_firm_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_business_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_ca_firm_id() TO authenticated;

-- Add DELETE policies for business-scoped tables that should support deletion
CREATE POLICY "Business delete" ON public.compliance_events
  FOR DELETE USING (business_id = public.get_user_business_id());

CREATE POLICY "Business delete" ON public.gst_itc_lines
  FOR DELETE USING (business_id = public.get_user_business_id());

CREATE POLICY "Business delete" ON public.payroll_records
  FOR DELETE USING (business_id = public.get_user_business_id());

CREATE POLICY "Business delete" ON public.vendor_gst_health
  FOR DELETE USING (business_id = public.get_user_business_id());

CREATE POLICY "Business delete" ON public.alerts
  FOR DELETE USING (business_id = public.get_user_business_id());
