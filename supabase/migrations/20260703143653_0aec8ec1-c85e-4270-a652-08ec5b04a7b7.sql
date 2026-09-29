
-- Fix 1: prevent CA self-approval via cancel policy — add WITH CHECK restricting to 'cancelled'
DROP POLICY IF EXISTS "CA firm can cancel own pending requests" ON public.ca_access_requests;
CREATE POLICY "CA firm can cancel own pending requests"
ON public.ca_access_requests
FOR UPDATE
TO authenticated
USING (ca_firm_id = public.get_user_ca_firm_id() AND status = 'pending')
WITH CHECK (ca_firm_id = public.get_user_ca_firm_id() AND status = 'cancelled');

-- Fix 2: scope public-role policies on CA tables to authenticated

-- ca_bulk_filing_jobs
DROP POLICY IF EXISTS "CA firm can manage bulk filing jobs" ON public.ca_bulk_filing_jobs;
CREATE POLICY "CA firm can manage bulk filing jobs"
ON public.ca_bulk_filing_jobs
FOR ALL
TO authenticated
USING (ca_firm_id IN (SELECT id FROM public.ca_firms WHERE user_id = auth.uid()))
WITH CHECK (ca_firm_id IN (SELECT id FROM public.ca_firms WHERE user_id = auth.uid()));

-- ca_client_health_scores
DROP POLICY IF EXISTS "CA firm can manage health scores" ON public.ca_client_health_scores;
CREATE POLICY "CA firm can manage health scores"
ON public.ca_client_health_scores
FOR ALL
TO authenticated
USING (ca_firm_id IN (SELECT id FROM public.ca_firms WHERE user_id = auth.uid()))
WITH CHECK (ca_firm_id IN (SELECT id FROM public.ca_firms WHERE user_id = auth.uid()));

-- ca_gstr2b_uploads
DROP POLICY IF EXISTS "CA firm can manage GSTR2B uploads" ON public.ca_gstr2b_uploads;
CREATE POLICY "CA firm can manage GSTR2B uploads"
ON public.ca_gstr2b_uploads
FOR ALL
TO authenticated
USING (ca_firm_id IN (SELECT id FROM public.ca_firms WHERE user_id = auth.uid()))
WITH CHECK (ca_firm_id IN (SELECT id FROM public.ca_firms WHERE user_id = auth.uid()));

-- ca_itc_records
DROP POLICY IF EXISTS "CA firm can manage ITC records" ON public.ca_itc_records;
CREATE POLICY "CA firm can manage ITC records"
ON public.ca_itc_records
FOR ALL
TO authenticated
USING (ca_firm_id IN (SELECT id FROM public.ca_firms WHERE user_id = auth.uid()))
WITH CHECK (ca_firm_id IN (SELECT id FROM public.ca_firms WHERE user_id = auth.uid()));

-- ca_tds_records
DROP POLICY IF EXISTS "CA firm can manage TDS records" ON public.ca_tds_records;
CREATE POLICY "CA firm can manage TDS records"
ON public.ca_tds_records
FOR ALL
TO authenticated
USING (ca_firm_id IN (SELECT id FROM public.ca_firms WHERE user_id = auth.uid()))
WITH CHECK (ca_firm_id IN (SELECT id FROM public.ca_firms WHERE user_id = auth.uid()));

-- ca_compliance_events (three separate policies)
DROP POLICY IF EXISTS "CA firm can insert compliance events" ON public.ca_compliance_events;
CREATE POLICY "CA firm can insert compliance events"
ON public.ca_compliance_events
FOR INSERT
TO authenticated
WITH CHECK (ca_firm_id IN (SELECT id FROM public.ca_firms WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "CA firm can update own compliance events" ON public.ca_compliance_events;
CREATE POLICY "CA firm can update own compliance events"
ON public.ca_compliance_events
FOR UPDATE
TO authenticated
USING (ca_firm_id IN (SELECT id FROM public.ca_firms WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "CA firm can view own client compliance events" ON public.ca_compliance_events;
CREATE POLICY "CA firm can view own client compliance events"
ON public.ca_compliance_events
FOR SELECT
TO authenticated
USING (ca_firm_id IN (SELECT id FROM public.ca_firms WHERE user_id = auth.uid()));
