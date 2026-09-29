
-- ── 1. customer_acquisition_costs ─────────────────────────
CREATE TABLE public.customer_acquisition_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  period_start date NOT NULL,
  cac numeric NOT NULL DEFAULT 0,
  ltv_cac_ratio numeric NOT NULL DEFAULT 0,
  payback_months numeric NOT NULL DEFAULT 0,
  magic_number numeric NOT NULL DEFAULT 0,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.customer_acquisition_costs TO anon, authenticated;
GRANT ALL ON public.customer_acquisition_costs TO service_role;
ALTER TABLE public.customer_acquisition_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cac demo read" ON public.customer_acquisition_costs FOR SELECT USING (is_demo = true);
CREATE POLICY "cac tenant" ON public.customer_acquisition_costs FOR SELECT USING (business_id = public.get_user_business_id());

-- ── 2. cohort_data ────────────────────────────────────────
CREATE TABLE public.cohort_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  cohort_month date NOT NULL,
  month_number int NOT NULL,
  retention_rate numeric NOT NULL DEFAULT 0,
  revenue_current numeric NOT NULL DEFAULT 0,
  customers_churned int NOT NULL DEFAULT 0,
  nrr numeric NOT NULL DEFAULT 0,
  is_demo boolean NOT NULL DEFAULT false
);
GRANT SELECT ON public.cohort_data TO anon, authenticated;
GRANT ALL ON public.cohort_data TO service_role;
ALTER TABLE public.cohort_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cohort demo read" ON public.cohort_data FOR SELECT USING (is_demo = true);
CREATE POLICY "cohort tenant" ON public.cohort_data FOR SELECT USING (business_id = public.get_user_business_id());

-- ── 3. sales_pipeline ─────────────────────────────────────
CREATE TABLE public.sales_pipeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  deal_name text NOT NULL,
  customer_name text NOT NULL,
  stage text NOT NULL,
  deal_value numeric NOT NULL DEFAULT 0,
  probability numeric NOT NULL DEFAULT 0,
  close_date date,
  owner_name text,
  is_won boolean NOT NULL DEFAULT false,
  is_lost boolean NOT NULL DEFAULT false,
  is_demo boolean NOT NULL DEFAULT false
);
GRANT SELECT ON public.sales_pipeline TO anon, authenticated;
GRANT ALL ON public.sales_pipeline TO service_role;
ALTER TABLE public.sales_pipeline ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pipe demo read" ON public.sales_pipeline FOR SELECT USING (is_demo = true);
CREATE POLICY "pipe tenant" ON public.sales_pipeline FOR SELECT USING (business_id = public.get_user_business_id());

-- ── 4. revenue_breakdowns ─────────────────────────────────
CREATE TABLE public.revenue_breakdowns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  breakdown_type text NOT NULL,
  category_name text NOT NULL,
  revenue_amount numeric NOT NULL DEFAULT 0,
  is_demo boolean NOT NULL DEFAULT false
);
GRANT SELECT ON public.revenue_breakdowns TO anon, authenticated;
GRANT ALL ON public.revenue_breakdowns TO service_role;
ALTER TABLE public.revenue_breakdowns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rb demo read" ON public.revenue_breakdowns FOR SELECT USING (is_demo = true);
CREATE POLICY "rb tenant" ON public.revenue_breakdowns FOR SELECT USING (business_id = public.get_user_business_id());

-- ── 5. deferred_revenue ───────────────────────────────────
CREATE TABLE public.deferred_revenue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  customer_name text NOT NULL,
  contract_value numeric NOT NULL DEFAULT 0,
  collected numeric NOT NULL DEFAULT 0,
  recognized numeric NOT NULL DEFAULT 0,
  deferred_balance numeric NOT NULL DEFAULT 0,
  unbilled_revenue numeric NOT NULL DEFAULT 0,
  monthly_recognition numeric NOT NULL DEFAULT 0,
  recognition_method text,
  is_demo boolean NOT NULL DEFAULT false
);
GRANT SELECT ON public.deferred_revenue TO anon, authenticated;
GRANT ALL ON public.deferred_revenue TO service_role;
ALTER TABLE public.deferred_revenue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dr demo read" ON public.deferred_revenue FOR SELECT USING (is_demo = true);
CREATE POLICY "dr tenant" ON public.deferred_revenue FOR SELECT USING (business_id = public.get_user_business_id());

-- ── 6. subscription_audit ─────────────────────────────────
CREATE TABLE public.subscription_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  vendor text NOT NULL,
  product text NOT NULL,
  monthly_cost numeric NOT NULL DEFAULT 0,
  licenses_used int NOT NULL DEFAULT 0,
  licenses_purchased int NOT NULL DEFAULT 0,
  utilization_pct numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  action text,
  potential_savings numeric NOT NULL DEFAULT 0,
  is_duplicate boolean NOT NULL DEFAULT false,
  is_demo boolean NOT NULL DEFAULT false
);
GRANT SELECT ON public.subscription_audit TO anon, authenticated;
GRANT ALL ON public.subscription_audit TO service_role;
ALTER TABLE public.subscription_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sa demo read" ON public.subscription_audit FOR SELECT USING (is_demo = true);
CREATE POLICY "sa tenant" ON public.subscription_audit FOR SELECT USING (business_id = public.get_user_business_id());

-- ── 7. contract_renewals ──────────────────────────────────
CREATE TABLE public.contract_renewals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  vendor_name text NOT NULL,
  annual_value numeric NOT NULL DEFAULT 0,
  renewal_date date,
  end_date date,
  auto_renew boolean NOT NULL DEFAULT false,
  is_demo boolean NOT NULL DEFAULT false
);
GRANT SELECT ON public.contract_renewals TO anon, authenticated;
GRANT ALL ON public.contract_renewals TO service_role;
ALTER TABLE public.contract_renewals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cr demo read" ON public.contract_renewals FOR SELECT USING (is_demo = true);
CREATE POLICY "cr tenant" ON public.contract_renewals FOR SELECT USING (business_id = public.get_user_business_id());

-- ── 8. eway_bills ─────────────────────────────────────────
CREATE TABLE public.eway_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  bill_number text NOT NULL,
  invoice_number text,
  document_date date NOT NULL,
  from_location text,
  to_location text,
  value numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  is_compliant boolean NOT NULL DEFAULT true,
  is_demo boolean NOT NULL DEFAULT false
);
GRANT SELECT ON public.eway_bills TO anon, authenticated;
GRANT ALL ON public.eway_bills TO service_role;
ALTER TABLE public.eway_bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "eway demo read" ON public.eway_bills FOR SELECT USING (is_demo = true);
CREATE POLICY "eway tenant" ON public.eway_bills FOR SELECT USING (business_id = public.get_user_business_id());

-- ── 9. hsn_master ─────────────────────────────────────────
CREATE TABLE public.hsn_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  code text NOT NULL,
  description text NOT NULL,
  code_type text NOT NULL DEFAULT 'goods',
  gst_rate numeric NOT NULL DEFAULT 0,
  usage_count int NOT NULL DEFAULT 0,
  validation_status text NOT NULL DEFAULT 'valid',
  is_demo boolean NOT NULL DEFAULT false
);
GRANT SELECT ON public.hsn_master TO anon, authenticated;
GRANT ALL ON public.hsn_master TO service_role;
ALTER TABLE public.hsn_master ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hsn demo read" ON public.hsn_master FOR SELECT USING (is_demo = true);
CREATE POLICY "hsn tenant" ON public.hsn_master FOR SELECT USING (business_id = public.get_user_business_id());

-- ── 10. tax_planning ──────────────────────────────────────
CREATE TABLE public.tax_planning (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  financial_year text NOT NULL,
  effective_tax_rate numeric NOT NULL DEFAULT 0,
  section_80iac_status text,
  section_80iac_year int,
  carry_forward_losses numeric NOT NULL DEFAULT 0,
  depreciation numeric NOT NULL DEFAULT 0,
  depreciation_method text,
  strategies jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_demo boolean NOT NULL DEFAULT false
);
GRANT SELECT ON public.tax_planning TO anon, authenticated;
GRANT ALL ON public.tax_planning TO service_role;
ALTER TABLE public.tax_planning ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tp demo read" ON public.tax_planning FOR SELECT USING (is_demo = true);
CREATE POLICY "tp tenant" ON public.tax_planning FOR SELECT USING (business_id = public.get_user_business_id());

-- ── 11. balance_sheet_snapshots ───────────────────────────
CREATE TABLE public.balance_sheet_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  snapshot_date date NOT NULL,
  total_assets numeric NOT NULL DEFAULT 0,
  total_liabilities numeric NOT NULL DEFAULT 0,
  total_equity numeric NOT NULL DEFAULT 0,
  debt_to_equity numeric NOT NULL DEFAULT 0,
  cash numeric NOT NULL DEFAULT 0,
  accounts_receivable numeric NOT NULL DEFAULT 0,
  inventory numeric NOT NULL DEFAULT 0,
  fixed_assets numeric NOT NULL DEFAULT 0,
  other_assets numeric NOT NULL DEFAULT 0,
  accounts_payable numeric NOT NULL DEFAULT 0,
  short_term_debt numeric NOT NULL DEFAULT 0,
  accrued numeric NOT NULL DEFAULT 0,
  long_term_debt numeric NOT NULL DEFAULT 0,
  is_demo boolean NOT NULL DEFAULT false
);
GRANT SELECT ON public.balance_sheet_snapshots TO anon, authenticated;
GRANT ALL ON public.balance_sheet_snapshots TO service_role;
ALTER TABLE public.balance_sheet_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bs demo read" ON public.balance_sheet_snapshots FOR SELECT USING (is_demo = true);
CREATE POLICY "bs tenant" ON public.balance_sheet_snapshots FOR SELECT USING (business_id = public.get_user_business_id());

-- ── 12. risk_register ─────────────────────────────────────
CREATE TABLE public.risk_register (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  risk_name text NOT NULL,
  risk_category text NOT NULL,
  likelihood int NOT NULL DEFAULT 0,
  impact int NOT NULL DEFAULT 0,
  risk_score numeric NOT NULL DEFAULT 0,
  current_exposure numeric NOT NULL DEFAULT 0,
  mitigation_status text NOT NULL DEFAULT 'open',
  is_active boolean NOT NULL DEFAULT true,
  is_demo boolean NOT NULL DEFAULT false
);
GRANT SELECT ON public.risk_register TO anon, authenticated;
GRANT ALL ON public.risk_register TO service_role;
ALTER TABLE public.risk_register ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rr demo read" ON public.risk_register FOR SELECT USING (is_demo = true);
CREATE POLICY "rr tenant" ON public.risk_register FOR SELECT USING (business_id = public.get_user_business_id());

-- ── 13. insurance_policies ────────────────────────────────
CREATE TABLE public.insurance_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  policy_type text NOT NULL,
  provider text NOT NULL,
  coverage_amount numeric NOT NULL DEFAULT 0,
  annual_premium numeric NOT NULL DEFAULT 0,
  expiry_date date,
  status text NOT NULL DEFAULT 'active',
  is_adequate boolean NOT NULL DEFAULT true,
  is_demo boolean NOT NULL DEFAULT false
);
GRANT SELECT ON public.insurance_policies TO anon, authenticated;
GRANT ALL ON public.insurance_policies TO service_role;
ALTER TABLE public.insurance_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ip demo read" ON public.insurance_policies FOR SELECT USING (is_demo = true);
CREATE POLICY "ip tenant" ON public.insurance_policies FOR SELECT USING (business_id = public.get_user_business_id());

-- ── 14. esop_grants ───────────────────────────────────────
CREATE TABLE public.esop_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  employee_name text NOT NULL,
  grant_date date NOT NULL,
  total_options int NOT NULL DEFAULT 0,
  vested_options int NOT NULL DEFAULT 0,
  strike_price numeric NOT NULL DEFAULT 0,
  current_fair_value numeric NOT NULL DEFAULT 0,
  cliff_date date,
  status text NOT NULL DEFAULT 'active',
  is_demo boolean NOT NULL DEFAULT false
);
GRANT SELECT ON public.esop_grants TO anon, authenticated;
GRANT ALL ON public.esop_grants TO service_role;
ALTER TABLE public.esop_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "es demo read" ON public.esop_grants FOR SELECT USING (is_demo = true);
CREATE POLICY "es tenant" ON public.esop_grants FOR SELECT USING (business_id = public.get_user_business_id());

-- ── 15. hiring_pipeline ───────────────────────────────────
CREATE TABLE public.hiring_pipeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  position text NOT NULL,
  department text,
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  budget numeric NOT NULL DEFAULT 0,
  candidates_count int NOT NULL DEFAULT 0,
  target_join_date date,
  is_demo boolean NOT NULL DEFAULT false
);
GRANT SELECT ON public.hiring_pipeline TO anon, authenticated;
GRANT ALL ON public.hiring_pipeline TO service_role;
ALTER TABLE public.hiring_pipeline ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hp demo read" ON public.hiring_pipeline FOR SELECT USING (is_demo = true);
CREATE POLICY "hp tenant" ON public.hiring_pipeline FOR SELECT USING (business_id = public.get_user_business_id());

-- ── 16. compensation_benchmarks ───────────────────────────
CREATE TABLE public.compensation_benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  role text NOT NULL,
  department text,
  internal_ctc numeric NOT NULL DEFAULT 0,
  market_25th numeric NOT NULL DEFAULT 0,
  market_50th numeric NOT NULL DEFAULT 0,
  market_75th numeric NOT NULL DEFAULT 0,
  market_90th numeric NOT NULL DEFAULT 0,
  percentile_position numeric NOT NULL DEFAULT 50,
  competitiveness text NOT NULL DEFAULT 'at_market',
  is_demo boolean NOT NULL DEFAULT false
);
GRANT SELECT ON public.compensation_benchmarks TO anon, authenticated;
GRANT ALL ON public.compensation_benchmarks TO service_role;
ALTER TABLE public.compensation_benchmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cb demo read" ON public.compensation_benchmarks FOR SELECT USING (is_demo = true);
CREATE POLICY "cb tenant" ON public.compensation_benchmarks FOR SELECT USING (business_id = public.get_user_business_id());
