-- ============================================================
-- Security fixes batch: write policies, OAuth token lockdown, duplicate SELECT cleanup
-- ============================================================

-- ---------- 1. integrations: revoke token columns from tenants ----------
-- access_token / refresh_token must not be returnable to authenticated users.
-- Row policy stays (tenant scoping for INSERT/UPDATE/DELETE on their own integration row),
-- but column-level privileges block reading the secret material via PostgREST.
REVOKE SELECT (access_token, refresh_token) ON public.integrations FROM authenticated;
REVOKE SELECT (access_token, refresh_token) ON public.integrations FROM anon;
GRANT ALL ON public.integrations TO service_role;

-- ---------- 2. Add tenant ALL policies on tables that only have SELECT ----------
CREATE POLICY "bs tenant w" ON public.balance_sheet_snapshots
  FOR ALL TO authenticated
  USING (business_id = get_user_business_id())
  WITH CHECK (business_id = get_user_business_id());

CREATE POLICY "cohort tenant w" ON public.cohort_data
  FOR ALL TO authenticated
  USING (business_id = get_user_business_id())
  WITH CHECK (business_id = get_user_business_id());

CREATE POLICY "cb tenant w" ON public.compensation_benchmarks
  FOR ALL TO authenticated
  USING (business_id = get_user_business_id())
  WITH CHECK (business_id = get_user_business_id());

CREATE POLICY "cr tenant w" ON public.contract_renewals
  FOR ALL TO authenticated
  USING (business_id = get_user_business_id())
  WITH CHECK (business_id = get_user_business_id());

CREATE POLICY "cac tenant w" ON public.customer_acquisition_costs
  FOR ALL TO authenticated
  USING (business_id = get_user_business_id())
  WITH CHECK (business_id = get_user_business_id());

CREATE POLICY "es tenant w" ON public.esop_grants
  FOR ALL TO authenticated
  USING (business_id = get_user_business_id())
  WITH CHECK (business_id = get_user_business_id());

CREATE POLICY "eway tenant w" ON public.eway_bills
  FOR ALL TO authenticated
  USING (business_id = get_user_business_id())
  WITH CHECK (business_id = get_user_business_id());

CREATE POLICY "hp tenant w" ON public.hiring_pipeline
  FOR ALL TO authenticated
  USING (business_id = get_user_business_id())
  WITH CHECK (business_id = get_user_business_id());

CREATE POLICY "ip tenant w" ON public.insurance_policies
  FOR ALL TO authenticated
  USING (business_id = get_user_business_id())
  WITH CHECK (business_id = get_user_business_id());

CREATE POLICY "rb tenant w" ON public.revenue_breakdowns
  FOR ALL TO authenticated
  USING (business_id = get_user_business_id())
  WITH CHECK (business_id = get_user_business_id());

CREATE POLICY "pipe tenant w" ON public.sales_pipeline
  FOR ALL TO authenticated
  USING (business_id = get_user_business_id())
  WITH CHECK (business_id = get_user_business_id());

CREATE POLICY "sa tenant w" ON public.subscription_audit
  FOR ALL TO authenticated
  USING (business_id = get_user_business_id())
  WITH CHECK (business_id = get_user_business_id());

CREATE POLICY "tp tenant w" ON public.tax_planning
  FOR ALL TO authenticated
  USING (business_id = get_user_business_id())
  WITH CHECK (business_id = get_user_business_id());

-- ---------- 3. Add UPDATE + DELETE on tables that have only SELECT + INSERT ----------
CREATE POLICY "Business update" ON public.gst_notice_risk_scores
  FOR UPDATE TO authenticated
  USING (business_id = get_user_business_id())
  WITH CHECK (business_id = get_user_business_id());
CREATE POLICY "Business delete" ON public.gst_notice_risk_scores
  FOR DELETE TO authenticated
  USING (business_id = get_user_business_id());

CREATE POLICY "Business update" ON public.nidhi_briefs
  FOR UPDATE TO authenticated
  USING (business_id = get_user_business_id())
  WITH CHECK (business_id = get_user_business_id());
CREATE POLICY "Business delete" ON public.nidhi_briefs
  FOR DELETE TO authenticated
  USING (business_id = get_user_business_id());

CREATE POLICY "Chase update" ON public.receivable_chases
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.receivables r
                 WHERE r.id = receivable_chases.receivable_id
                   AND r.business_id = get_user_business_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.receivables r
                      WHERE r.id = receivable_chases.receivable_id
                        AND r.business_id = get_user_business_id()));
CREATE POLICY "Chase delete" ON public.receivable_chases
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.receivables r
                 WHERE r.id = receivable_chases.receivable_id
                   AND r.business_id = get_user_business_id()));

CREATE POLICY "Business update" ON public.simulations
  FOR UPDATE TO authenticated
  USING (business_id = get_user_business_id())
  WITH CHECK (business_id = get_user_business_id());
CREATE POLICY "Business delete" ON public.simulations
  FOR DELETE TO authenticated
  USING (business_id = get_user_business_id());

-- ---------- 4. Drop redundant tenant SELECT policies where an ALL tenant policy already covers SELECT ----------
-- Keep "<x> demo read" (is_demo=true) — that condition is NOT covered by the ALL tenant policy.
-- Drop "<x> tenant" SELECT — fully covered by "<x> tenant w" (FOR ALL).
DROP POLICY IF EXISTS "fx tenant"      ON public.fx_exposure;
DROP POLICY IF EXISTS "tds tenant"     ON public.tds_intelligence;
DROP POLICY IF EXISTS "rq tenant"      ON public.revenue_quality;
DROP POLICY IF EXISTS "pe tenant"      ON public.people_efficiency;
DROP POLICY IF EXISTS "si tenant"      ON public.support_intelligence;
DROP POLICY IF EXISTS "ats tenant"     ON public.advance_tax_schedule;
DROP POLICY IF EXISTS "rc tenant"      ON public.regulatory_compliance;
DROP POLICY IF EXISTS "ps tenant"      ON public.payment_settlements;
DROP POLICY IF EXISTS "cf tenant"      ON public.conversion_funnel;
DROP POLICY IF EXISTS "ra tenant"      ON public.revenue_alerts;
DROP POLICY IF EXISTS "ai tenant"      ON public.action_items;