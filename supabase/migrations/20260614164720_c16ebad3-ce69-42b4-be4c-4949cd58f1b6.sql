CREATE TABLE IF NOT EXISTS public.payment_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  is_demo boolean NOT NULL DEFAULT false,
  gateway text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  expected_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_settlements TO authenticated;
GRANT ALL ON public.payment_settlements TO service_role;
ALTER TABLE public.payment_settlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ps demo read" ON public.payment_settlements FOR SELECT TO authenticated USING (is_demo = true);
CREATE POLICY "ps tenant"    ON public.payment_settlements FOR SELECT TO authenticated USING (business_id = public.get_user_business_id());
CREATE POLICY "ps tenant w"  ON public.payment_settlements FOR ALL    TO authenticated USING (business_id = public.get_user_business_id()) WITH CHECK (business_id = public.get_user_business_id());

CREATE TABLE IF NOT EXISTS public.fx_exposure (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  is_demo boolean NOT NULL DEFAULT false,
  exposure_type text NOT NULL,
  vendor_or_client text,
  currency text NOT NULL DEFAULT 'USD',
  monthly_amount_inr numeric NOT NULL DEFAULT 0,
  exchange_rate numeric NOT NULL DEFAULT 83.50,
  hedged boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fx_exposure TO authenticated;
GRANT ALL ON public.fx_exposure TO service_role;
ALTER TABLE public.fx_exposure ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fx demo read" ON public.fx_exposure FOR SELECT TO authenticated USING (is_demo = true);
CREATE POLICY "fx tenant"    ON public.fx_exposure FOR SELECT TO authenticated USING (business_id = public.get_user_business_id());
CREATE POLICY "fx tenant w"  ON public.fx_exposure FOR ALL    TO authenticated USING (business_id = public.get_user_business_id()) WITH CHECK (business_id = public.get_user_business_id());

CREATE TABLE IF NOT EXISTS public.action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  is_demo boolean NOT NULL DEFAULT false,
  category text NOT NULL,
  title text NOT NULL,
  due_date date,
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.action_items TO authenticated;
GRANT ALL ON public.action_items TO service_role;
ALTER TABLE public.action_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai demo read"   ON public.action_items FOR SELECT TO authenticated USING (is_demo = true);
CREATE POLICY "ai demo update" ON public.action_items FOR UPDATE TO authenticated USING (is_demo = true) WITH CHECK (is_demo = true);
CREATE POLICY "ai tenant"      ON public.action_items FOR SELECT TO authenticated USING (business_id = public.get_user_business_id());
CREATE POLICY "ai tenant w"    ON public.action_items FOR ALL    TO authenticated USING (business_id = public.get_user_business_id()) WITH CHECK (business_id = public.get_user_business_id());

CREATE TABLE IF NOT EXISTS public.revenue_quality (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  is_demo boolean NOT NULL DEFAULT false,
  period_start date NOT NULL,
  recurring_revenue numeric NOT NULL DEFAULT 0,
  total_revenue numeric NOT NULL DEFAULT 0,
  top3_client_pct numeric NOT NULL DEFAULT 0,
  bookings_total numeric NOT NULL DEFAULT 0,
  revenue_at_risk numeric NOT NULL DEFAULT 0,
  recurring_pct numeric NOT NULL DEFAULT 0,
  project_pct numeric NOT NULL DEFAULT 0,
  onetime_pct numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.revenue_quality TO authenticated;
GRANT ALL ON public.revenue_quality TO service_role;
ALTER TABLE public.revenue_quality ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rq demo read" ON public.revenue_quality FOR SELECT TO authenticated USING (is_demo = true);
CREATE POLICY "rq tenant"    ON public.revenue_quality FOR SELECT TO authenticated USING (business_id = public.get_user_business_id());
CREATE POLICY "rq tenant w"  ON public.revenue_quality FOR ALL    TO authenticated USING (business_id = public.get_user_business_id()) WITH CHECK (business_id = public.get_user_business_id());

CREATE TABLE IF NOT EXISTS public.conversion_funnel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  is_demo boolean NOT NULL DEFAULT false,
  period_start date NOT NULL,
  leads_total int NOT NULL DEFAULT 0,
  trials_started int NOT NULL DEFAULT 0,
  activated int NOT NULL DEFAULT 0,
  converted_to_paid int NOT NULL DEFAULT 0,
  retained_90d int NOT NULL DEFAULT 0,
  activation_rate numeric NOT NULL DEFAULT 0,
  trial_to_paid_rate numeric NOT NULL DEFAULT 0,
  avg_days_to_convert int NOT NULL DEFAULT 0,
  best_channel text,
  worst_channel text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversion_funnel TO authenticated;
GRANT ALL ON public.conversion_funnel TO service_role;
ALTER TABLE public.conversion_funnel ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cf demo read" ON public.conversion_funnel FOR SELECT TO authenticated USING (is_demo = true);
CREATE POLICY "cf tenant"    ON public.conversion_funnel FOR SELECT TO authenticated USING (business_id = public.get_user_business_id());
CREATE POLICY "cf tenant w"  ON public.conversion_funnel FOR ALL    TO authenticated USING (business_id = public.get_user_business_id()) WITH CHECK (business_id = public.get_user_business_id());

CREATE TABLE IF NOT EXISTS public.revenue_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  is_demo boolean NOT NULL DEFAULT false,
  severity text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  description text,
  recommended_action text,
  is_active boolean NOT NULL DEFAULT true,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.revenue_alerts TO authenticated;
GRANT ALL ON public.revenue_alerts TO service_role;
ALTER TABLE public.revenue_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ra demo read"   ON public.revenue_alerts FOR SELECT TO authenticated USING (is_demo = true);
CREATE POLICY "ra demo update" ON public.revenue_alerts FOR UPDATE TO authenticated USING (is_demo = true) WITH CHECK (is_demo = true);
CREATE POLICY "ra tenant"      ON public.revenue_alerts FOR SELECT TO authenticated USING (business_id = public.get_user_business_id());
CREATE POLICY "ra tenant w"    ON public.revenue_alerts FOR ALL    TO authenticated USING (business_id = public.get_user_business_id()) WITH CHECK (business_id = public.get_user_business_id());

CREATE TABLE IF NOT EXISTS public.people_efficiency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  is_demo boolean NOT NULL DEFAULT false,
  period_start date NOT NULL,
  utilisation_rate numeric NOT NULL DEFAULT 0,
  revenue_per_billable_hour numeric NOT NULL DEFAULT 0,
  overtime_hours numeric NOT NULL DEFAULT 0,
  overtime_cost numeric NOT NULL DEFAULT 0,
  training_spend numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.people_efficiency TO authenticated;
GRANT ALL ON public.people_efficiency TO service_role;
ALTER TABLE public.people_efficiency ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pe demo read" ON public.people_efficiency FOR SELECT TO authenticated USING (is_demo = true);
CREATE POLICY "pe tenant"    ON public.people_efficiency FOR SELECT TO authenticated USING (business_id = public.get_user_business_id());
CREATE POLICY "pe tenant w"  ON public.people_efficiency FOR ALL    TO authenticated USING (business_id = public.get_user_business_id()) WITH CHECK (business_id = public.get_user_business_id());

CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  is_demo boolean NOT NULL DEFAULT false,
  project_name text NOT NULL,
  client_name text,
  quoted_amount numeric NOT NULL DEFAULT 0,
  actual_cost numeric NOT NULL DEFAULT 0,
  gross_margin_pct numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  start_date date,
  end_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "proj demo read" ON public.projects FOR SELECT TO authenticated USING (is_demo = true);
CREATE POLICY "proj tenant"    ON public.projects FOR SELECT TO authenticated USING (business_id = public.get_user_business_id());
CREATE POLICY "proj tenant w"  ON public.projects FOR ALL    TO authenticated USING (business_id = public.get_user_business_id()) WITH CHECK (business_id = public.get_user_business_id());

CREATE TABLE IF NOT EXISTS public.support_intelligence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  is_demo boolean NOT NULL DEFAULT false,
  period_start date NOT NULL,
  total_tickets int NOT NULL DEFAULT 0,
  avg_resolution_hours numeric NOT NULL DEFAULT 0,
  cost_per_ticket numeric NOT NULL DEFAULT 0,
  satisfaction_score numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_intelligence TO authenticated;
GRANT ALL ON public.support_intelligence TO service_role;
ALTER TABLE public.support_intelligence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "si demo read" ON public.support_intelligence FOR SELECT TO authenticated USING (is_demo = true);
CREATE POLICY "si tenant"    ON public.support_intelligence FOR SELECT TO authenticated USING (business_id = public.get_user_business_id());
CREATE POLICY "si tenant w"  ON public.support_intelligence FOR ALL    TO authenticated USING (business_id = public.get_user_business_id()) WITH CHECK (business_id = public.get_user_business_id());

CREATE TABLE IF NOT EXISTS public.tds_intelligence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  is_demo boolean NOT NULL DEFAULT false,
  financial_year text NOT NULL,
  section_code text NOT NULL,
  description text,
  amount_deducted numeric NOT NULL DEFAULT 0,
  amount_deposited numeric NOT NULL DEFAULT 0,
  rate numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  matched_26as boolean NOT NULL DEFAULT false,
  return_filed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tds_intelligence TO authenticated;
GRANT ALL ON public.tds_intelligence TO service_role;
ALTER TABLE public.tds_intelligence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tds demo read" ON public.tds_intelligence FOR SELECT TO authenticated USING (is_demo = true);
CREATE POLICY "tds tenant"    ON public.tds_intelligence FOR SELECT TO authenticated USING (business_id = public.get_user_business_id());
CREATE POLICY "tds tenant w"  ON public.tds_intelligence FOR ALL    TO authenticated USING (business_id = public.get_user_business_id()) WITH CHECK (business_id = public.get_user_business_id());

CREATE TABLE IF NOT EXISTS public.advance_tax_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  is_demo boolean NOT NULL DEFAULT false,
  financial_year text NOT NULL DEFAULT 'FY 2026-27',
  instalment_number int NOT NULL,
  due_date date NOT NULL,
  cumulative_pct numeric NOT NULL DEFAULT 0,
  amount_due numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'upcoming',
  section_80iac_exempt boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.advance_tax_schedule TO authenticated;
GRANT ALL ON public.advance_tax_schedule TO service_role;
ALTER TABLE public.advance_tax_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ats demo read" ON public.advance_tax_schedule FOR SELECT TO authenticated USING (is_demo = true);
CREATE POLICY "ats tenant"    ON public.advance_tax_schedule FOR SELECT TO authenticated USING (business_id = public.get_user_business_id());
CREATE POLICY "ats tenant w"  ON public.advance_tax_schedule FOR ALL    TO authenticated USING (business_id = public.get_user_business_id()) WITH CHECK (business_id = public.get_user_business_id());

CREATE TABLE IF NOT EXISTS public.regulatory_compliance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  is_demo boolean NOT NULL DEFAULT false,
  requirement_name text NOT NULL,
  status text NOT NULL DEFAULT 'compliant',
  due_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.regulatory_compliance TO authenticated;
GRANT ALL ON public.regulatory_compliance TO service_role;
ALTER TABLE public.regulatory_compliance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rc demo read" ON public.regulatory_compliance FOR SELECT TO authenticated USING (is_demo = true);
CREATE POLICY "rc tenant"    ON public.regulatory_compliance FOR SELECT TO authenticated USING (business_id = public.get_user_business_id());
CREATE POLICY "rc tenant w"  ON public.regulatory_compliance FOR ALL    TO authenticated USING (business_id = public.get_user_business_id()) WITH CHECK (business_id = public.get_user_business_id());

WITH biz AS (SELECT '4b30494f-4c30-4a74-a6bb-6bf56493a97d'::uuid AS id)
INSERT INTO public.payment_settlements (business_id, is_demo, gateway, amount, status, expected_date) SELECT id, true, g, a, s, d::date FROM biz, (VALUES
  ('razorpay', 234000, 'pending', CURRENT_DATE + 1),
  ('razorpay', 87000,  'pending', CURRENT_DATE),
  ('upi',      45000,  'pending', CURRENT_DATE + 2),
  ('stripe',   120000, 'pending', CURRENT_DATE + 3),
  ('razorpay', 65000,  'settled', CURRENT_DATE - 1)
) v(g, a, s, d);

WITH biz AS (SELECT '4b30494f-4c30-4a74-a6bb-6bf56493a97d'::uuid AS id)
INSERT INTO public.fx_exposure (business_id, is_demo, exposure_type, vendor_or_client, currency, monthly_amount_inr, exchange_rate, hedged) SELECT id, true, t, vc, c, a, r, h FROM biz, (VALUES
  ('expense', 'AWS Inc',       'USD', 425000, 83.50, false),
  ('expense', 'Stripe Atlas',  'USD', 87000,  83.50, false),
  ('expense', 'Vercel',        'USD', 38000,  83.50, false),
  ('revenue', 'Acme Corp (US)','USD', 680000, 83.50, false)
) v(t, vc, c, a, r, h);

WITH biz AS (SELECT '4b30494f-4c30-4a74-a6bb-6bf56493a97d'::uuid AS id)
INSERT INTO public.action_items (business_id, is_demo, category, title, due_date, priority) SELECT id, true, c, t, d::date, p FROM biz, (VALUES
  ('gst',            'File GSTR-3B for May 2026',                CURRENT_DATE + 3,  'critical'),
  ('collection',     'Chase Acme Corp - 2.4L 45 days overdue',   CURRENT_DATE + 1,  'high'),
  ('payment',        'Approve AWS invoice 4.25L',                CURRENT_DATE + 2,  'high'),
  ('reconciliation', 'Reconcile 3 vendor GSTINs missing in 2A',  CURRENT_DATE + 5,  'medium'),
  ('ca_task',        'Send Q4 books to CA for review',           CURRENT_DATE + 7,  'medium'),
  ('compliance',     'PF return filing due',                     CURRENT_DATE + 4,  'high'),
  ('gst',            'E-way bill validation for top 5 vendors',  CURRENT_DATE + 10, 'low')
) v(c, t, d, p);

WITH biz AS (SELECT '4b30494f-4c30-4a74-a6bb-6bf56493a97d'::uuid AS id)
INSERT INTO public.revenue_quality (business_id, is_demo, period_start, recurring_revenue, total_revenue, top3_client_pct, bookings_total, revenue_at_risk, recurring_pct, project_pct, onetime_pct)
SELECT id, true, date_trunc('month', CURRENT_DATE)::date, 4200000, 6800000, 38.5, 7400000, 850000, 62, 26, 12 FROM biz;

WITH biz AS (SELECT '4b30494f-4c30-4a74-a6bb-6bf56493a97d'::uuid AS id)
INSERT INTO public.conversion_funnel (business_id, is_demo, period_start, leads_total, trials_started, activated, converted_to_paid, retained_90d, activation_rate, trial_to_paid_rate, avg_days_to_convert, best_channel, worst_channel)
SELECT id, true, date_trunc('month', CURRENT_DATE)::date, 1240, 380, 245, 84, 71, 64.5, 22.1, 18, 'Organic Search', 'Paid Display' FROM biz;

WITH biz AS (SELECT '4b30494f-4c30-4a74-a6bb-6bf56493a97d'::uuid AS id)
INSERT INTO public.revenue_alerts (business_id, is_demo, severity, title, description, recommended_action) SELECT id, true, s, t, d, a FROM biz, (VALUES
  ('critical',   'Top customer concentration at 38%',     'Acme Corp represents 2.6Cr of 6.8Cr revenue. Concentration risk rising.', 'Diversify pipeline - focus on mid-market accounts'),
  ('warning',    'Trial-to-paid rate dropped 4.2%',       'Conversion fell from 26.3% to 22.1% this month.',                          'Audit onboarding email sequence and trial activation flow'),
  ('opportunity','MRR growth accelerating',               'Recurring revenue grew 8.4% MoM, above 6-mo average.',                     'Increase sales hiring to capture momentum'),
  ('info',       'Q1 bookings tracking +12% vs plan',     'Bookings of 74L vs 66L target.',                                           'Update revenue forecast for FY 2026-27')
) v(s, t, d, a);

WITH biz AS (SELECT '4b30494f-4c30-4a74-a6bb-6bf56493a97d'::uuid AS id)
INSERT INTO public.people_efficiency (business_id, is_demo, period_start, utilisation_rate, revenue_per_billable_hour, overtime_hours, overtime_cost, training_spend)
SELECT id, true, date_trunc('month', CURRENT_DATE)::date, 72.4, 4250, 184, 145000, 280000 FROM biz;

WITH biz AS (SELECT '4b30494f-4c30-4a74-a6bb-6bf56493a97d'::uuid AS id)
INSERT INTO public.projects (business_id, is_demo, project_name, client_name, quoted_amount, actual_cost, gross_margin_pct, status, start_date, end_date, notes) SELECT id, true, n, c, q, ac, m, s, sd::date, ed::date, nt FROM biz, (VALUES
  ('Mobile App Redesign',     'Acme Corp',        1800000,  540000, 70.0, 'active',    CURRENT_DATE - 60,  CURRENT_DATE + 30, 'On track, mid-sprint'),
  ('Data Platform Migration', 'BlueOcean Ltd',    3200000, 1280000, 60.0, 'active',    CURRENT_DATE - 90,  CURRENT_DATE + 45, 'Slight scope creep'),
  ('GST Compliance Setup',    'Sundar Traders',    450000,  225000, 50.0, 'completed', CURRENT_DATE - 120, CURRENT_DATE - 10, 'Delivered on time'),
  ('CRM Integration',         'Bharat Logistics', 1200000,  540000, 55.0, 'completed', CURRENT_DATE - 150, CURRENT_DATE - 30, 'Final invoice paid'),
  ('Internal Tooling v2',     'Internal',          800000,  480000, 40.0, 'active',    CURRENT_DATE - 45,  CURRENT_DATE + 60, 'Margin pressure'),
  ('Marketing Site Refresh',  'Vertex Labs',       320000,  108800, 66.0, 'pipeline',  CURRENT_DATE + 10,  CURRENT_DATE + 70, 'Awaiting PO'),
  ('Analytics Dashboard',     'Northwind Inc',     950000,  712500, 25.0, 'cancelled', CURRENT_DATE - 80,  CURRENT_DATE - 20, 'Client paused initiative')
) v(n, c, q, ac, m, s, sd, ed, nt);

WITH biz AS (SELECT '4b30494f-4c30-4a74-a6bb-6bf56493a97d'::uuid AS id)
INSERT INTO public.support_intelligence (business_id, is_demo, period_start, total_tickets, avg_resolution_hours, cost_per_ticket, satisfaction_score)
SELECT id, true, (date_trunc('month', CURRENT_DATE) - (n || ' month')::interval)::date, t, h, c, s FROM biz, (VALUES
  (0, 342, 6.8, 285, 4.3),
  (1, 318, 7.2, 295, 4.2),
  (2, 290, 7.8, 310, 4.1),
  (3, 275, 8.4, 320, 4.0),
  (4, 248, 9.0, 340, 3.9),
  (5, 220, 9.6, 360, 3.8)
) v(n, t, h, c, s);

WITH biz AS (SELECT '4b30494f-4c30-4a74-a6bb-6bf56493a97d'::uuid AS id)
INSERT INTO public.tds_intelligence (business_id, is_demo, financial_year, section_code, description, amount_deducted, amount_deposited, rate, status, matched_26as, return_filed) SELECT id, true, 'FY 2026-27', sc, d, ad, dp, r, s, m, f FROM biz, (VALUES
  ('194C', 'Payments to contractors',     420000,  420000, 2.0,  'filed',     true,  true),
  ('194J', 'Professional/technical fees', 285000,  285000, 10.0, 'filed',     true,  true),
  ('194I', 'Rent payments',               180000,  180000, 10.0, 'deposited', true,  false),
  ('194H', 'Commission/brokerage',         52000,   48000, 5.0,  'mismatch',  false, false),
  ('194Q', 'Purchase of goods >50L',      128000,  128000, 0.1,  'deposited', true,  false),
  ('192',  'Salaries (TDS)',             1240000, 1240000, 0,    'filed',     true,  true)
) v(sc, d, ad, dp, r, s, m, f);

WITH biz AS (SELECT '4b30494f-4c30-4a74-a6bb-6bf56493a97d'::uuid AS id)
INSERT INTO public.advance_tax_schedule (business_id, is_demo, instalment_number, due_date, cumulative_pct, amount_due, status, section_80iac_exempt) SELECT id, true, n, d::date, p, a, s, e FROM biz, (VALUES
  (1, '2026-06-15', 15,  0, 'exempt', true),
  (2, '2026-09-15', 45,  0, 'exempt', true),
  (3, '2026-12-15', 75,  0, 'exempt', true),
  (4, '2027-03-15', 100, 0, 'exempt', true)
) v(n, d, p, a, s, e);

WITH biz AS (SELECT '4b30494f-4c30-4a74-a6bb-6bf56493a97d'::uuid AS id)
INSERT INTO public.regulatory_compliance (business_id, is_demo, requirement_name, status, due_date, notes) SELECT id, true, r, s, d, n FROM biz, (VALUES
  ('GSTR-1 monthly filing',         'compliant',      (CURRENT_DATE + 11)::date, 'Filed for April 2026'),
  ('GSTR-3B monthly filing',        'due_soon',       (CURRENT_DATE + 3)::date,  'Prepare May 2026 return'),
  ('TDS Quarterly Return (24Q)',    'compliant',      (CURRENT_DATE + 25)::date, 'Q1 filed'),
  ('PF / ESI monthly contribution', 'due_soon',       (CURRENT_DATE + 4)::date,  'Generate ECR'),
  ('Professional Tax (state)',      'compliant',      (CURRENT_DATE + 30)::date, NULL),
  ('ROC Annual Filing (AOC-4)',     'overdue',        (CURRENT_DATE - 5)::date,  'Penalty accruing - file urgently'),
  ('DPT-3 (Deposits return)',       'compliant',      (CURRENT_DATE + 90)::date, 'Annual filing'),
  ('MSME Form 1',                   'due_soon',       (CURRENT_DATE + 14)::date, 'Half-yearly'),
  ('Shops & Establishment renewal', 'not_applicable', NULL::date,                'Not registered in this state'),
  ('Section 80IAC Tax Holiday',     'compliant',      (CURRENT_DATE + 200)::date,'Eligible - claim active')
) v(r, s, d, n);