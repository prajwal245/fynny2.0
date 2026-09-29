ALTER TABLE public.ca_reports_log
  ADD COLUMN IF NOT EXISTS signed_off_by uuid,
  ADD COLUMN IF NOT EXISTS signed_off_at timestamptz;

DROP POLICY IF EXISTS "Firm partners and managers can sign off reports" ON public.ca_reports_log;
CREATE POLICY "Firm partners and managers can sign off reports"
ON public.ca_reports_log
FOR UPDATE
TO authenticated
USING (public.ca_member_role(ca_firm_id) IN ('partner','manager'))
WITH CHECK (public.ca_member_role(ca_firm_id) IN ('partner','manager'));