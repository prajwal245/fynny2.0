
-- 1) Standardize CA-scoped policies to use get_user_ca_firm_id()
DROP POLICY IF EXISTS "CA firm can manage ITC records" ON public.ca_itc_records;
CREATE POLICY "CA firm can manage ITC records" ON public.ca_itc_records
  FOR ALL USING (ca_firm_id = public.get_user_ca_firm_id())
  WITH CHECK (ca_firm_id = public.get_user_ca_firm_id());

DROP POLICY IF EXISTS "CA firm can manage TDS records" ON public.ca_tds_records;
CREATE POLICY "CA firm can manage TDS records" ON public.ca_tds_records
  FOR ALL USING (ca_firm_id = public.get_user_ca_firm_id())
  WITH CHECK (ca_firm_id = public.get_user_ca_firm_id());

DROP POLICY IF EXISTS "CA firm can manage health scores" ON public.ca_client_health_scores;
CREATE POLICY "CA firm can manage health scores" ON public.ca_client_health_scores
  FOR ALL USING (ca_firm_id = public.get_user_ca_firm_id())
  WITH CHECK (ca_firm_id = public.get_user_ca_firm_id());

DROP POLICY IF EXISTS "CA firm can manage bulk filing jobs" ON public.ca_bulk_filing_jobs;
CREATE POLICY "CA firm can manage bulk filing jobs" ON public.ca_bulk_filing_jobs
  FOR ALL USING (ca_firm_id = public.get_user_ca_firm_id())
  WITH CHECK (ca_firm_id = public.get_user_ca_firm_id());

DROP POLICY IF EXISTS "CA firm can manage GSTR2B uploads" ON public.ca_gstr2b_uploads;
CREATE POLICY "CA firm can manage GSTR2B uploads" ON public.ca_gstr2b_uploads
  FOR ALL USING (ca_firm_id = public.get_user_ca_firm_id())
  WITH CHECK (ca_firm_id = public.get_user_ca_firm_id());

-- ca_verification_documents: keep existing admin policy; standardize firm-owner policy
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='ca_verification_documents'
  LOOP
    -- Only drop the firm-owner policies; leave admin ones intact by name pattern
    IF r.policyname ILIKE '%firm%' OR r.policyname ILIKE '%own%' OR r.policyname ILIKE '%manage%' THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.ca_verification_documents', r.policyname);
    END IF;
  END LOOP;
END $$;

CREATE POLICY "CA firm can manage verification documents"
  ON public.ca_verification_documents
  FOR ALL
  USING (ca_firm_id = public.get_user_ca_firm_id())
  WITH CHECK (ca_firm_id = public.get_user_ca_firm_id());

-- 2) ca_client_messages: enforce active access on SELECT and UPDATE
DROP POLICY IF EXISTS "CA or client can view their thread" ON public.ca_client_messages;
CREATE POLICY "CA or client can view their thread"
  ON public.ca_client_messages
  FOR SELECT
  USING (
    (
      ca_firm_id = public.get_user_ca_firm_id()
      AND EXISTS (
        SELECT 1 FROM public.ca_client_access cca
        WHERE cca.ca_firm_id = ca_client_messages.ca_firm_id
          AND cca.business_id = ca_client_messages.business_id
          AND cca.is_active = true
      )
    )
    OR (
      business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.ca_client_access cca
        WHERE cca.ca_firm_id = ca_client_messages.ca_firm_id
          AND cca.business_id = ca_client_messages.business_id
          AND cca.is_active = true
      )
    )
  );

DROP POLICY IF EXISTS "Recipients can mark messages read" ON public.ca_client_messages;
CREATE POLICY "Recipients can mark messages read"
  ON public.ca_client_messages
  FOR UPDATE
  USING (
    (
      ca_firm_id = public.get_user_ca_firm_id()
      AND EXISTS (
        SELECT 1 FROM public.ca_client_access cca
        WHERE cca.ca_firm_id = ca_client_messages.ca_firm_id
          AND cca.business_id = ca_client_messages.business_id
          AND cca.is_active = true
      )
    )
    OR (
      business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.ca_client_access cca
        WHERE cca.ca_firm_id = ca_client_messages.ca_firm_id
          AND cca.business_id = ca_client_messages.business_id
          AND cca.is_active = true
      )
    )
  )
  WITH CHECK (
    (
      ca_firm_id = public.get_user_ca_firm_id()
      AND EXISTS (
        SELECT 1 FROM public.ca_client_access cca
        WHERE cca.ca_firm_id = ca_client_messages.ca_firm_id
          AND cca.business_id = ca_client_messages.business_id
          AND cca.is_active = true
      )
    )
    OR (
      business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.ca_client_access cca
        WHERE cca.ca_firm_id = ca_client_messages.ca_firm_id
          AND cca.business_id = ca_client_messages.business_id
          AND cca.is_active = true
      )
    )
  );
