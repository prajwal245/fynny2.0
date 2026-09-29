-- POLICY AUDIT: firm-scoped RLS for every remaining ca_* table.
-- Two invariants applied everywhere:
--   1. membership is checked against THE row's firm  -> public.user_in_ca_firm(ca_firm_id)
--      (get_user_ca_firm_id() returns an arbitrary single firm and is unsafe for multi-firm users)
--   2. client rows require a live access grant       -> public.ca_firm_has_client_access(ca_firm_id, business_id)

-- ca_clients ---------------------------------------------------------------
ALTER TABLE public.ca_clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "CA firm manages own clients" ON public.ca_clients;
CREATE POLICY "ca_clients firm scoped" ON public.ca_clients FOR ALL TO authenticated
USING (public.user_in_ca_firm(ca_firm_id)
       AND (business_id IS NULL OR public.ca_firm_has_client_access(ca_firm_id, business_id)))
WITH CHECK (public.user_in_ca_firm(ca_firm_id)
       AND (business_id IS NULL OR public.ca_firm_has_client_access(ca_firm_id, business_id)));

-- ca_client_documents ------------------------------------------------------
ALTER TABLE public.ca_client_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "CA firm can manage own client documents" ON public.ca_client_documents;
CREATE POLICY "ca_client_documents firm scoped" ON public.ca_client_documents FOR ALL TO authenticated
USING (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id))
WITH CHECK (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id));

-- ca_client_health_scores --------------------------------------------------
ALTER TABLE public.ca_client_health_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "CA firm can manage health scores" ON public.ca_client_health_scores;
CREATE POLICY "ca_client_health_scores firm scoped" ON public.ca_client_health_scores FOR ALL TO authenticated
USING (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id))
WITH CHECK (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id));

-- ca_client_invitations ----------------------------------------------------
ALTER TABLE public.ca_client_invitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "CA firm manages own invitations" ON public.ca_client_invitations;
CREATE POLICY "ca_client_invitations firm scoped" ON public.ca_client_invitations FOR ALL TO authenticated
USING (public.user_in_ca_firm(ca_firm_id)
       AND (business_id IS NULL OR public.ca_firm_has_client_access(ca_firm_id, business_id)))
WITH CHECK (public.user_in_ca_firm(ca_firm_id)
       AND (business_id IS NULL OR public.ca_firm_has_client_access(ca_firm_id, business_id)));

-- ca_client_users ----------------------------------------------------------
ALTER TABLE public.ca_client_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "firm staff manage client users" ON public.ca_client_users;
CREATE POLICY "ca_client_users firm scoped" ON public.ca_client_users FOR ALL TO authenticated
USING (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id))
WITH CHECK (public.ca_can(ca_firm_id, 'manage_clients')
       AND public.ca_firm_has_client_access(ca_firm_id, business_id));

-- ca_close_periods ---------------------------------------------------------
ALTER TABLE public.ca_close_periods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "firm staff read close" ON public.ca_close_periods;
DROP POLICY IF EXISTS "firm staff write close" ON public.ca_close_periods;
DROP POLICY IF EXISTS "firm staff update close" ON public.ca_close_periods;
CREATE POLICY "ca_close_periods read" ON public.ca_close_periods FOR SELECT TO authenticated
USING (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id));
CREATE POLICY "ca_close_periods insert" ON public.ca_close_periods FOR INSERT TO authenticated
WITH CHECK (public.ca_can(ca_firm_id, 'process') AND public.ca_firm_has_client_access(ca_firm_id, business_id));
CREATE POLICY "ca_close_periods update" ON public.ca_close_periods FOR UPDATE TO authenticated
USING (public.ca_can(ca_firm_id, 'process') AND public.ca_firm_has_client_access(ca_firm_id, business_id))
WITH CHECK (public.ca_can(ca_firm_id, 'process') AND public.ca_firm_has_client_access(ca_firm_id, business_id));
CREATE POLICY "ca_close_periods delete" ON public.ca_close_periods FOR DELETE TO authenticated
USING (public.ca_can(ca_firm_id, 'process') AND public.ca_firm_has_client_access(ca_firm_id, business_id));

-- ca_compliance_events -----------------------------------------------------
ALTER TABLE public.ca_compliance_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "CA firm compliance events access" ON public.ca_compliance_events;
CREATE POLICY "ca_compliance_events firm scoped" ON public.ca_compliance_events FOR ALL TO authenticated
USING (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id))
WITH CHECK (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id));

-- ca_document_extractions --------------------------------------------------
ALTER TABLE public.ca_document_extractions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "firm staff manage extractions" ON public.ca_document_extractions;
CREATE POLICY "ca_document_extractions firm scoped" ON public.ca_document_extractions FOR ALL TO authenticated
USING (public.user_in_ca_firm(ca_firm_id)
       AND (business_id IS NULL OR public.ca_firm_has_client_access(ca_firm_id, business_id)))
WITH CHECK (public.user_in_ca_firm(ca_firm_id)
       AND (business_id IS NULL OR public.ca_firm_has_client_access(ca_firm_id, business_id)));

-- ca_document_requests -----------------------------------------------------
ALTER TABLE public.ca_document_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "firm staff manage requests" ON public.ca_document_requests;
CREATE POLICY "ca_document_requests firm scoped" ON public.ca_document_requests FOR ALL TO authenticated
USING (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id))
WITH CHECK (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id));

-- ca_engagements -----------------------------------------------------------
ALTER TABLE public.ca_engagements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "firm staff read engagements" ON public.ca_engagements;
DROP POLICY IF EXISTS "firm managers write engagements" ON public.ca_engagements;
CREATE POLICY "ca_engagements read" ON public.ca_engagements FOR SELECT TO authenticated
USING (public.user_in_ca_firm(ca_firm_id)
       AND (business_id IS NULL OR public.ca_firm_has_client_access(ca_firm_id, business_id)));
CREATE POLICY "ca_engagements write" ON public.ca_engagements FOR ALL TO authenticated
USING (public.ca_can(ca_firm_id, 'manage_clients')
       AND (business_id IS NULL OR public.ca_firm_has_client_access(ca_firm_id, business_id)))
WITH CHECK (public.ca_can(ca_firm_id, 'manage_clients')
       AND (business_id IS NULL OR public.ca_firm_has_client_access(ca_firm_id, business_id)));

-- ca_gstr2b_uploads --------------------------------------------------------
ALTER TABLE public.ca_gstr2b_uploads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "CA firm gstr2b access" ON public.ca_gstr2b_uploads;
CREATE POLICY "ca_gstr2b_uploads firm scoped" ON public.ca_gstr2b_uploads FOR ALL TO authenticated
USING (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id))
WITH CHECK (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id));

-- ca_itc_records -----------------------------------------------------------
ALTER TABLE public.ca_itc_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "CA firm itc access" ON public.ca_itc_records;
CREATE POLICY "ca_itc_records firm scoped" ON public.ca_itc_records FOR ALL TO authenticated
USING (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id))
WITH CHECK (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id));

-- ca_tds_records -----------------------------------------------------------
ALTER TABLE public.ca_tds_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "CA firm tds access" ON public.ca_tds_records;
CREATE POLICY "ca_tds_records firm scoped" ON public.ca_tds_records FOR ALL TO authenticated
USING (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id))
WITH CHECK (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id));

-- ca_notifications ---------------------------------------------------------
ALTER TABLE public.ca_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "CA firm notifications access" ON public.ca_notifications;
CREATE POLICY "ca_notifications firm scoped" ON public.ca_notifications FOR ALL TO authenticated
USING (public.user_in_ca_firm(ca_firm_id)
       AND (business_id IS NULL OR public.ca_firm_has_client_access(ca_firm_id, business_id)))
WITH CHECK (public.user_in_ca_firm(ca_firm_id)
       AND (business_id IS NULL OR public.ca_firm_has_client_access(ca_firm_id, business_id)));

-- ca_reports_log -----------------------------------------------------------
ALTER TABLE public.ca_reports_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "CA firm reports select" ON public.ca_reports_log;
DROP POLICY IF EXISTS "CA firm reports insert" ON public.ca_reports_log;
DROP POLICY IF EXISTS "CA firm reports update" ON public.ca_reports_log;
DROP POLICY IF EXISTS "CA firm reports delete" ON public.ca_reports_log;
CREATE POLICY "ca_reports_log firm scoped" ON public.ca_reports_log FOR ALL TO authenticated
USING (public.user_in_ca_firm(ca_firm_id)
       AND (business_id IS NULL OR public.ca_firm_has_client_access(ca_firm_id, business_id)))
WITH CHECK (public.user_in_ca_firm(ca_firm_id)
       AND (business_id IS NULL OR public.ca_firm_has_client_access(ca_firm_id, business_id)));

-- ca_activity_log ----------------------------------------------------------
ALTER TABLE public.ca_activity_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "CA activity select" ON public.ca_activity_log;
DROP POLICY IF EXISTS "CA activity insert" ON public.ca_activity_log;
CREATE POLICY "ca_activity_log select" ON public.ca_activity_log FOR SELECT TO authenticated
USING (public.user_in_ca_firm(ca_firm_id)
       AND (business_id IS NULL OR public.ca_firm_has_client_access(ca_firm_id, business_id)));
CREATE POLICY "ca_activity_log insert" ON public.ca_activity_log FOR INSERT TO authenticated
WITH CHECK (public.user_in_ca_firm(ca_firm_id)
       AND (business_id IS NULL OR public.ca_firm_has_client_access(ca_firm_id, business_id)));

-- ca_audit_events (append-only) --------------------------------------------
ALTER TABLE public.ca_audit_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "firm staff read audit" ON public.ca_audit_events;
DROP POLICY IF EXISTS "firm staff append audit" ON public.ca_audit_events;
CREATE POLICY "ca_audit_events read" ON public.ca_audit_events FOR SELECT TO authenticated
USING (public.user_in_ca_firm(ca_firm_id)
       AND (business_id IS NULL OR public.ca_firm_has_client_access(ca_firm_id, business_id)));
CREATE POLICY "ca_audit_events append" ON public.ca_audit_events FOR INSERT TO authenticated
WITH CHECK (
  (public.user_in_ca_firm(ca_firm_id)
   AND (business_id IS NULL OR public.ca_firm_has_client_access(ca_firm_id, business_id)))
  OR (business_id IS NOT NULL AND business_id = public.client_portal_business_id())
);

-- ca_bulk_filing_jobs ------------------------------------------------------
ALTER TABLE public.ca_bulk_filing_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "CA firm can manage bulk filing jobs" ON public.ca_bulk_filing_jobs;
CREATE POLICY "ca_bulk_filing_jobs firm scoped" ON public.ca_bulk_filing_jobs FOR ALL TO authenticated
USING (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_all_client_access(ca_firm_id, client_ids))
WITH CHECK (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_all_client_access(ca_firm_id, client_ids));

-- ca_verification_documents ------------------------------------------------
ALTER TABLE public.ca_verification_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "CA firm can manage verification documents" ON public.ca_verification_documents;
CREATE POLICY "ca_verification_documents firm scoped" ON public.ca_verification_documents FOR ALL TO authenticated
USING (public.user_in_ca_firm(ca_firm_id))
WITH CHECK (public.user_in_ca_firm(ca_firm_id));

-- ca_access_requests (firm side only; business-owner policies unchanged) ----
ALTER TABLE public.ca_access_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "CA firm can view own requests" ON public.ca_access_requests;
DROP POLICY IF EXISTS "CA firm can create requests" ON public.ca_access_requests;
DROP POLICY IF EXISTS "CA firm can cancel own pending requests" ON public.ca_access_requests;
CREATE POLICY "ca_access_requests firm select" ON public.ca_access_requests FOR SELECT TO authenticated
USING (public.user_in_ca_firm(ca_firm_id));
CREATE POLICY "ca_access_requests firm insert" ON public.ca_access_requests FOR INSERT TO authenticated
WITH CHECK (public.user_in_ca_firm(ca_firm_id));
CREATE POLICY "ca_access_requests firm cancel" ON public.ca_access_requests FOR UPDATE TO authenticated
USING (public.user_in_ca_firm(ca_firm_id) AND status = 'pending')
WITH CHECK (public.user_in_ca_firm(ca_firm_id) AND status = 'cancelled');
