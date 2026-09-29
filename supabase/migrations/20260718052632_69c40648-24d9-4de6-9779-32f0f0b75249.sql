
-- Helper: does this CA firm currently have active + approved access to this business?
CREATE OR REPLACE FUNCTION public.ca_firm_has_client_access(_firm_id uuid, _business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _firm_id IS NOT NULL
     AND _business_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.ca_client_access cca
       WHERE cca.ca_firm_id = _firm_id
         AND cca.business_id = _business_id
         AND cca.is_active = true
     )
     AND EXISTS (
       SELECT 1 FROM public.ca_access_requests r
       WHERE r.ca_firm_id = _firm_id
         AND r.business_id = _business_id
         AND r.status = 'approved'
     );
$$;

-- Helper: does firm have access to EVERY business_id in the array (and array non-empty)?
CREATE OR REPLACE FUNCTION public.ca_firm_has_all_client_access(_firm_id uuid, _business_ids uuid[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _firm_id IS NOT NULL
     AND _business_ids IS NOT NULL
     AND array_length(_business_ids, 1) IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM unnest(_business_ids) AS b(business_id)
       WHERE NOT public.ca_firm_has_client_access(_firm_id, b.business_id)
     );
$$;

-- ============================================================
-- ca_bulk_filing_jobs: require access to every client in client_ids
-- ============================================================
DROP POLICY IF EXISTS "CA firm can manage bulk filing jobs" ON public.ca_bulk_filing_jobs;
CREATE POLICY "CA firm can manage bulk filing jobs"
ON public.ca_bulk_filing_jobs
FOR ALL TO authenticated
USING (
  ca_firm_id = public.get_user_ca_firm_id()
  AND public.ca_firm_has_all_client_access(ca_firm_id, client_ids)
)
WITH CHECK (
  ca_firm_id = public.get_user_ca_firm_id()
  AND public.ca_firm_has_all_client_access(ca_firm_id, client_ids)
);

-- ============================================================
-- ca_reports_log: require access to business_id when set
-- ============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='ca_reports_log' LOOP
    EXECUTE format('DROP POLICY %I ON public.ca_reports_log', r.policyname);
  END LOOP;
END$$;
CREATE POLICY "CA firm reports select"
ON public.ca_reports_log
FOR SELECT TO authenticated
USING (
  ca_firm_id = public.get_user_ca_firm_id()
  AND (business_id IS NULL OR public.ca_firm_has_client_access(ca_firm_id, business_id))
);
CREATE POLICY "CA firm reports insert"
ON public.ca_reports_log
FOR INSERT TO authenticated
WITH CHECK (
  ca_firm_id = public.get_user_ca_firm_id()
  AND (business_id IS NULL OR public.ca_firm_has_client_access(ca_firm_id, business_id))
);
CREATE POLICY "CA firm reports update"
ON public.ca_reports_log
FOR UPDATE TO authenticated
USING (
  ca_firm_id = public.get_user_ca_firm_id()
  AND (business_id IS NULL OR public.ca_firm_has_client_access(ca_firm_id, business_id))
)
WITH CHECK (
  ca_firm_id = public.get_user_ca_firm_id()
  AND (business_id IS NULL OR public.ca_firm_has_client_access(ca_firm_id, business_id))
);
CREATE POLICY "CA firm reports delete"
ON public.ca_reports_log
FOR DELETE TO authenticated
USING (
  ca_firm_id = public.get_user_ca_firm_id()
  AND (business_id IS NULL OR public.ca_firm_has_client_access(ca_firm_id, business_id))
);

-- ============================================================
-- ca_activity_log: business_id nullable
-- ============================================================
DROP POLICY IF EXISTS "CA activity insert" ON public.ca_activity_log;
DROP POLICY IF EXISTS "CA activity select" ON public.ca_activity_log;
CREATE POLICY "CA activity select"
ON public.ca_activity_log
FOR SELECT TO authenticated
USING (
  ca_firm_id = public.get_user_ca_firm_id()
  AND (business_id IS NULL OR public.ca_firm_has_client_access(ca_firm_id, business_id))
);
CREATE POLICY "CA activity insert"
ON public.ca_activity_log
FOR INSERT TO authenticated
WITH CHECK (
  ca_firm_id = public.get_user_ca_firm_id()
  AND (business_id IS NULL OR public.ca_firm_has_client_access(ca_firm_id, business_id))
);

-- ============================================================
-- ca_compliance_events
-- ============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='ca_compliance_events' LOOP
    EXECUTE format('DROP POLICY %I ON public.ca_compliance_events', r.policyname);
  END LOOP;
END$$;
CREATE POLICY "CA firm compliance events access"
ON public.ca_compliance_events
FOR ALL TO authenticated
USING (
  ca_firm_id = public.get_user_ca_firm_id()
  AND public.ca_firm_has_client_access(ca_firm_id, business_id)
)
WITH CHECK (
  ca_firm_id = public.get_user_ca_firm_id()
  AND public.ca_firm_has_client_access(ca_firm_id, business_id)
);

-- ============================================================
-- ca_client_health_scores
-- ============================================================
DROP POLICY IF EXISTS "CA firm can manage health scores" ON public.ca_client_health_scores;
CREATE POLICY "CA firm can manage health scores"
ON public.ca_client_health_scores
FOR ALL TO authenticated
USING (
  ca_firm_id = public.get_user_ca_firm_id()
  AND public.ca_firm_has_client_access(ca_firm_id, business_id)
)
WITH CHECK (
  ca_firm_id = public.get_user_ca_firm_id()
  AND public.ca_firm_has_client_access(ca_firm_id, business_id)
);

-- ============================================================
-- ca_notifications: business_id nullable
-- ============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='ca_notifications' LOOP
    EXECUTE format('DROP POLICY %I ON public.ca_notifications', r.policyname);
  END LOOP;
END$$;
CREATE POLICY "CA firm notifications access"
ON public.ca_notifications
FOR ALL TO authenticated
USING (
  ca_firm_id = public.get_user_ca_firm_id()
  AND (business_id IS NULL OR public.ca_firm_has_client_access(ca_firm_id, business_id))
)
WITH CHECK (
  ca_firm_id = public.get_user_ca_firm_id()
  AND (business_id IS NULL OR public.ca_firm_has_client_access(ca_firm_id, business_id))
);

-- ============================================================
-- ca_itc_records
-- ============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='ca_itc_records' LOOP
    EXECUTE format('DROP POLICY %I ON public.ca_itc_records', r.policyname);
  END LOOP;
END$$;
CREATE POLICY "CA firm itc access"
ON public.ca_itc_records
FOR ALL TO authenticated
USING (
  ca_firm_id = public.get_user_ca_firm_id()
  AND public.ca_firm_has_client_access(ca_firm_id, business_id)
)
WITH CHECK (
  ca_firm_id = public.get_user_ca_firm_id()
  AND public.ca_firm_has_client_access(ca_firm_id, business_id)
);

-- ============================================================
-- ca_tds_records
-- ============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='ca_tds_records' LOOP
    EXECUTE format('DROP POLICY %I ON public.ca_tds_records', r.policyname);
  END LOOP;
END$$;
CREATE POLICY "CA firm tds access"
ON public.ca_tds_records
FOR ALL TO authenticated
USING (
  ca_firm_id = public.get_user_ca_firm_id()
  AND public.ca_firm_has_client_access(ca_firm_id, business_id)
)
WITH CHECK (
  ca_firm_id = public.get_user_ca_firm_id()
  AND public.ca_firm_has_client_access(ca_firm_id, business_id)
);

-- ============================================================
-- ca_gstr2b_uploads
-- ============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='ca_gstr2b_uploads' LOOP
    EXECUTE format('DROP POLICY %I ON public.ca_gstr2b_uploads', r.policyname);
  END LOOP;
END$$;
CREATE POLICY "CA firm gstr2b access"
ON public.ca_gstr2b_uploads
FOR ALL TO authenticated
USING (
  ca_firm_id = public.get_user_ca_firm_id()
  AND public.ca_firm_has_client_access(ca_firm_id, business_id)
)
WITH CHECK (
  ca_firm_id = public.get_user_ca_firm_id()
  AND public.ca_firm_has_client_access(ca_firm_id, business_id)
);

-- ============================================================
-- ca_client_messages: strengthen to also require approved access request
-- ============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='ca_client_messages' LOOP
    EXECUTE format('DROP POLICY %I ON public.ca_client_messages', r.policyname);
  END LOOP;
END$$;
CREATE POLICY "CA or client can view their thread"
ON public.ca_client_messages
FOR SELECT TO authenticated
USING (
  (
    ca_firm_id = public.get_user_ca_firm_id()
    AND public.ca_firm_has_client_access(ca_firm_id, business_id)
  )
  OR (
    business_id IN (SELECT p.business_id FROM public.profiles p WHERE p.user_id = auth.uid())
    AND public.ca_firm_has_client_access(ca_firm_id, business_id)
  )
);
CREATE POLICY "CA or client can send messages"
ON public.ca_client_messages
FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND public.ca_firm_has_client_access(ca_firm_id, business_id)
  AND (
    ca_firm_id IN (SELECT f.id FROM public.ca_firms f WHERE f.user_id = auth.uid())
    OR business_id IN (SELECT p.business_id FROM public.profiles p WHERE p.user_id = auth.uid())
  )
);
CREATE POLICY "Recipients can mark messages read"
ON public.ca_client_messages
FOR UPDATE TO authenticated
USING (
  public.ca_firm_has_client_access(ca_firm_id, business_id)
  AND (
    ca_firm_id = public.get_user_ca_firm_id()
    OR business_id IN (SELECT p.business_id FROM public.profiles p WHERE p.user_id = auth.uid())
  )
)
WITH CHECK (
  public.ca_firm_has_client_access(ca_firm_id, business_id)
  AND (
    ca_firm_id = public.get_user_ca_firm_id()
    OR business_id IN (SELECT p.business_id FROM public.profiles p WHERE p.user_id = auth.uid())
  )
);
