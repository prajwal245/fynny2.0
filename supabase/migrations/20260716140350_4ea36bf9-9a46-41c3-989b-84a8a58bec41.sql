
-- ca_client_messages
DROP POLICY IF EXISTS "CA or client can view their thread" ON public.ca_client_messages;
CREATE POLICY "CA or client can view their thread" ON public.ca_client_messages
FOR SELECT TO authenticated
USING (((ca_firm_id = get_user_ca_firm_id()) AND (EXISTS (SELECT 1 FROM ca_client_access cca WHERE cca.ca_firm_id = ca_client_messages.ca_firm_id AND cca.business_id = ca_client_messages.business_id AND cca.is_active = true)))
  OR ((business_id IN (SELECT profiles.business_id FROM profiles WHERE profiles.user_id = auth.uid())) AND (EXISTS (SELECT 1 FROM ca_client_access cca WHERE cca.ca_firm_id = ca_client_messages.ca_firm_id AND cca.business_id = ca_client_messages.business_id AND cca.is_active = true))));

DROP POLICY IF EXISTS "Recipients can mark messages read" ON public.ca_client_messages;
CREATE POLICY "Recipients can mark messages read" ON public.ca_client_messages
FOR UPDATE TO authenticated
USING (((ca_firm_id = get_user_ca_firm_id()) AND (EXISTS (SELECT 1 FROM ca_client_access cca WHERE cca.ca_firm_id = ca_client_messages.ca_firm_id AND cca.business_id = ca_client_messages.business_id AND cca.is_active = true)))
  OR ((business_id IN (SELECT profiles.business_id FROM profiles WHERE profiles.user_id = auth.uid())) AND (EXISTS (SELECT 1 FROM ca_client_access cca WHERE cca.ca_firm_id = ca_client_messages.ca_firm_id AND cca.business_id = ca_client_messages.business_id AND cca.is_active = true))))
WITH CHECK (((ca_firm_id = get_user_ca_firm_id()) AND (EXISTS (SELECT 1 FROM ca_client_access cca WHERE cca.ca_firm_id = ca_client_messages.ca_firm_id AND cca.business_id = ca_client_messages.business_id AND cca.is_active = true)))
  OR ((business_id IN (SELECT profiles.business_id FROM profiles WHERE profiles.user_id = auth.uid())) AND (EXISTS (SELECT 1 FROM ca_client_access cca WHERE cca.ca_firm_id = ca_client_messages.ca_firm_id AND cca.business_id = ca_client_messages.business_id AND cca.is_active = true))));

-- push_tokens
DROP POLICY IF EXISTS "Users can manage own push tokens" ON public.push_tokens;
CREATE POLICY "Users can manage own push tokens" ON public.push_tokens
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ca_itc_records
DROP POLICY IF EXISTS "CA firm can manage ITC records" ON public.ca_itc_records;
CREATE POLICY "CA firm can manage ITC records" ON public.ca_itc_records
FOR ALL TO authenticated
USING (ca_firm_id = get_user_ca_firm_id())
WITH CHECK (ca_firm_id = get_user_ca_firm_id());

-- ca_tds_records
DROP POLICY IF EXISTS "CA firm can manage TDS records" ON public.ca_tds_records;
CREATE POLICY "CA firm can manage TDS records" ON public.ca_tds_records
FOR ALL TO authenticated
USING (ca_firm_id = get_user_ca_firm_id())
WITH CHECK (ca_firm_id = get_user_ca_firm_id());

-- ca_verification_documents
DROP POLICY IF EXISTS "CA firm can manage verification documents" ON public.ca_verification_documents;
CREATE POLICY "CA firm can manage verification documents" ON public.ca_verification_documents
FOR ALL TO authenticated
USING (ca_firm_id = get_user_ca_firm_id())
WITH CHECK (ca_firm_id = get_user_ca_firm_id());

-- ca_bulk_filing_jobs
DROP POLICY IF EXISTS "CA firm can manage bulk filing jobs" ON public.ca_bulk_filing_jobs;
CREATE POLICY "CA firm can manage bulk filing jobs" ON public.ca_bulk_filing_jobs
FOR ALL TO authenticated
USING (ca_firm_id = get_user_ca_firm_id())
WITH CHECK (ca_firm_id = get_user_ca_firm_id());

-- ca_gstr2b_uploads
DROP POLICY IF EXISTS "CA firm can manage GSTR2B uploads" ON public.ca_gstr2b_uploads;
CREATE POLICY "CA firm can manage GSTR2B uploads" ON public.ca_gstr2b_uploads
FOR ALL TO authenticated
USING (ca_firm_id = get_user_ca_firm_id())
WITH CHECK (ca_firm_id = get_user_ca_firm_id());

-- ca_client_health_scores
DROP POLICY IF EXISTS "CA firm can manage health scores" ON public.ca_client_health_scores;
CREATE POLICY "CA firm can manage health scores" ON public.ca_client_health_scores
FOR ALL TO authenticated
USING (ca_firm_id = get_user_ca_firm_id())
WITH CHECK (ca_firm_id = get_user_ca_firm_id());
