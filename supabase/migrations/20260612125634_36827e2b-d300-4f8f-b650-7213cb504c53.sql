
-- 1. Fix admin_audit_logs INSERT policy
DROP POLICY IF EXISTS "Admins insert own audit logs" ON public.admin_audit_logs;
CREATE POLICY "Senior admins insert own audit logs"
  ON public.admin_audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_senior_admin() AND admin_user_id = auth.uid());

-- 2. Restrict nidhi_conversations to row owner
DROP POLICY IF EXISTS "Business access" ON public.nidhi_conversations;
CREATE POLICY "Owner access"
  ON public.nidhi_conversations
  FOR SELECT
  TO authenticated
  USING (business_id = public.get_user_business_id() AND user_id = auth.uid());

-- 3. Hide OAuth tokens on public.integrations from authenticated users (incl. admins).
--    Only service_role may read access_token / refresh_token.
REVOKE SELECT ON public.integrations FROM authenticated;
REVOKE SELECT ON public.integrations FROM anon;
GRANT SELECT (id, organization_id, provider, expires_at, metadata, created_at, updated_at)
  ON public.integrations TO authenticated;
GRANT ALL ON public.integrations TO service_role;

-- Same treatment for integration_tokens
REVOKE SELECT ON public.integration_tokens FROM authenticated;
REVOKE SELECT ON public.integration_tokens FROM anon;
GRANT SELECT (id, platform, expires_at, config, status, created_at, updated_at)
  ON public.integration_tokens TO authenticated;
GRANT ALL ON public.integration_tokens TO service_role;

-- Align integration_tokens admin policy with is_senior_admin (adds ops_admin)
DROP POLICY IF EXISTS "Senior admins manage integration tokens" ON public.integration_tokens;
CREATE POLICY "Senior admins manage integration tokens"
  ON public.integration_tokens
  FOR ALL
  TO authenticated
  USING (public.is_senior_admin())
  WITH CHECK (public.is_senior_admin());

-- 4. Re-scope every TO public policy on tenant tables to TO authenticated
DO $$
DECLARE
  r record;
  tbls text[] := ARRAY[
    'compliance_events','payables','alerts','csv_uploads','ca_firm_members',
    'ca_report_schedules','cash_flow_trends','tds_filings','gst_notice_risk_scores',
    'ca_access_requests','receivables','businesses','profiles','ca_notifications',
    'payroll_records','bank_accounts','liquidity_metrics','gst_filings','gst_itc_lines',
    'nidhi_briefs','simulations','revenue_breakdowns','hiring_pipeline',
    'compensation_benchmarks','esop_grants','insurance_policies','hsn_master',
    'deferred_revenue','ca_client_access','payroll_snapshots','contract_renewals',
    'vendor_gst_health','subscription_audit','subscriptions','transactions',
    'risk_register','ca_activity_log','ca_firms','eway_bills','tax_planning',
    'cohort_data','customer_acquisition_costs','ai_insights','sales_pipeline',
    'balance_sheet_snapshots','ca_reports_log'
  ];
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY(tbls)
      AND roles = ARRAY['public']::name[]
  LOOP
    EXECUTE format('ALTER POLICY %I ON %I.%I TO authenticated',
                   r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;
