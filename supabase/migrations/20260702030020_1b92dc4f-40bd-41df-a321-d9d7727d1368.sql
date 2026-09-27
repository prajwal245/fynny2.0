
CREATE TABLE IF NOT EXISTS public.ca_compliance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  filing_period text NOT NULL,
  due_date date NOT NULL,
  filing_date date,
  status text NOT NULL DEFAULT 'pending',
  penalty_amount numeric(12,2) DEFAULT 0,
  late_fee_amount numeric(12,2) DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ca_compliance_events_status_check CHECK (status IN ('pending','filed','overdue','exempted')),
  CONSTRAINT ca_compliance_events_type_check CHECK (event_type IN ('GSTR1','GSTR3B','GSTR9','GSTR9C','TDS_QUARTERLY','TDS_ANNUAL','ITR','ADVANCE_TAX','ROC_ANNUAL','ROC_AGM'))
);
CREATE INDEX IF NOT EXISTS ca_compliance_events_business_idx ON public.ca_compliance_events (business_id);
CREATE INDEX IF NOT EXISTS ca_compliance_events_ca_firm_idx ON public.ca_compliance_events (ca_firm_id);
CREATE INDEX IF NOT EXISTS ca_compliance_events_due_date_idx ON public.ca_compliance_events (due_date);
CREATE INDEX IF NOT EXISTS ca_compliance_events_status_idx ON public.ca_compliance_events (status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_compliance_events TO authenticated;
GRANT ALL ON public.ca_compliance_events TO service_role;
ALTER TABLE public.ca_compliance_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CA firm can view own client compliance events" ON public.ca_compliance_events FOR SELECT
  USING (ca_firm_id IN (SELECT id FROM public.ca_firms WHERE user_id = auth.uid()));
CREATE POLICY "CA firm can insert compliance events" ON public.ca_compliance_events FOR INSERT
  WITH CHECK (ca_firm_id IN (SELECT id FROM public.ca_firms WHERE user_id = auth.uid()));
CREATE POLICY "CA firm can update own compliance events" ON public.ca_compliance_events FOR UPDATE
  USING (ca_firm_id IN (SELECT id FROM public.ca_firms WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.ca_itc_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  filing_period text NOT NULL,
  gstin_supplier text NOT NULL,
  supplier_name text,
  invoice_number text,
  invoice_date date,
  taxable_value numeric(14,2) NOT NULL DEFAULT 0,
  igst_amount numeric(14,2) NOT NULL DEFAULT 0,
  cgst_amount numeric(14,2) NOT NULL DEFAULT 0,
  sgst_amount numeric(14,2) NOT NULL DEFAULT 0,
  total_itc numeric(14,2) GENERATED ALWAYS AS (igst_amount + cgst_amount + sgst_amount) STORED,
  gstr2b_matched boolean DEFAULT false,
  gstr2b_taxable_value numeric(14,2),
  gstr2b_igst numeric(14,2),
  gstr2b_cgst numeric(14,2),
  gstr2b_sgst numeric(14,2),
  match_status text NOT NULL DEFAULT 'unmatched',
  mismatch_amount numeric(14,2),
  itc_eligible boolean DEFAULT true,
  itc_blocked boolean DEFAULT false,
  block_reason text,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ca_itc_records_match_status_check CHECK (match_status IN ('matched','mismatch','unmatched','missing_in_2b','extra_in_2b')),
  CONSTRAINT ca_itc_records_source_check CHECK (source IN ('manual','csv_import','zoho_sync','gstr2b_upload'))
);
CREATE INDEX IF NOT EXISTS ca_itc_records_business_period_idx ON public.ca_itc_records (business_id, filing_period);
CREATE INDEX IF NOT EXISTS ca_itc_records_ca_firm_idx ON public.ca_itc_records (ca_firm_id);
CREATE INDEX IF NOT EXISTS ca_itc_records_match_status_idx ON public.ca_itc_records (match_status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_itc_records TO authenticated;
GRANT ALL ON public.ca_itc_records TO service_role;
ALTER TABLE public.ca_itc_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CA firm can manage ITC records" ON public.ca_itc_records FOR ALL
  USING (ca_firm_id IN (SELECT id FROM public.ca_firms WHERE user_id = auth.uid()))
  WITH CHECK (ca_firm_id IN (SELECT id FROM public.ca_firms WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.ca_tds_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  financial_year text NOT NULL,
  quarter text NOT NULL,
  section_code text NOT NULL,
  deductee_name text NOT NULL,
  deductee_pan text,
  payment_date date,
  payment_amount numeric(14,2) NOT NULL DEFAULT 0,
  tds_rate numeric(5,2) NOT NULL DEFAULT 0,
  tds_amount numeric(14,2) NOT NULL DEFAULT 0,
  deposited_amount numeric(14,2) DEFAULT 0,
  challan_number text,
  challan_date date,
  return_filed boolean DEFAULT false,
  return_filed_date date,
  interest_amount numeric(14,2) DEFAULT 0,
  penalty_amount numeric(14,2) DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ca_tds_records_status_check CHECK (status IN ('pending','deposited','return_filed','overdue')),
  CONSTRAINT ca_tds_records_quarter_check CHECK (quarter IN ('Q1','Q2','Q3','Q4'))
);
CREATE INDEX IF NOT EXISTS ca_tds_records_business_fy_idx ON public.ca_tds_records (business_id, financial_year, quarter);
CREATE INDEX IF NOT EXISTS ca_tds_records_ca_firm_idx ON public.ca_tds_records (ca_firm_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_tds_records TO authenticated;
GRANT ALL ON public.ca_tds_records TO service_role;
ALTER TABLE public.ca_tds_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CA firm can manage TDS records" ON public.ca_tds_records FOR ALL
  USING (ca_firm_id IN (SELECT id FROM public.ca_firms WHERE user_id = auth.uid()))
  WITH CHECK (ca_firm_id IN (SELECT id FROM public.ca_firms WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.ca_bulk_filing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  filing_type text NOT NULL,
  filing_period text NOT NULL,
  client_ids uuid[] NOT NULL DEFAULT '{}',
  total_clients integer NOT NULL DEFAULT 0,
  processed_clients integer NOT NULL DEFAULT 0,
  failed_clients integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'queued',
  output_json jsonb,
  error_log jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ca_bulk_filing_jobs_status_check CHECK (status IN ('queued','processing','completed','failed','partial')),
  CONSTRAINT ca_bulk_filing_jobs_type_check CHECK (filing_type IN ('GSTR1','GSTR3B','TDS_CHALLAN'))
);
CREATE INDEX IF NOT EXISTS ca_bulk_filing_jobs_ca_firm_idx ON public.ca_bulk_filing_jobs (ca_firm_id);
CREATE INDEX IF NOT EXISTS ca_bulk_filing_jobs_status_idx ON public.ca_bulk_filing_jobs (status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_bulk_filing_jobs TO authenticated;
GRANT ALL ON public.ca_bulk_filing_jobs TO service_role;
ALTER TABLE public.ca_bulk_filing_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CA firm can manage bulk filing jobs" ON public.ca_bulk_filing_jobs FOR ALL
  USING (ca_firm_id IN (SELECT id FROM public.ca_firms WHERE user_id = auth.uid()))
  WITH CHECK (ca_firm_id IN (SELECT id FROM public.ca_firms WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.ca_client_health_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  computed_at timestamptz NOT NULL DEFAULT now(),
  overall_score integer NOT NULL DEFAULT 0,
  cash_runway_days integer,
  cash_status text NOT NULL DEFAULT 'unknown',
  compliance_score integer NOT NULL DEFAULT 0,
  revenue_trend text NOT NULL DEFAULT 'unknown',
  itc_risk_amount numeric(14,2) DEFAULT 0,
  overdue_filings integer NOT NULL DEFAULT 0,
  pending_tds numeric(14,2) DEFAULT 0,
  score_breakdown jsonb,
  CONSTRAINT ca_client_health_cash_status_check CHECK (cash_status IN ('safe','watch','critical','unknown')),
  CONSTRAINT ca_client_health_revenue_trend_check CHECK (revenue_trend IN ('growing','stable','declining','unknown'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ca_client_health_scores_unique_idx ON public.ca_client_health_scores (business_id, ca_firm_id);
CREATE INDEX IF NOT EXISTS ca_client_health_scores_ca_firm_idx ON public.ca_client_health_scores (ca_firm_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_client_health_scores TO authenticated;
GRANT ALL ON public.ca_client_health_scores TO service_role;
ALTER TABLE public.ca_client_health_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CA firm can manage health scores" ON public.ca_client_health_scores FOR ALL
  USING (ca_firm_id IN (SELECT id FROM public.ca_firms WHERE user_id = auth.uid()))
  WITH CHECK (ca_firm_id IN (SELECT id FROM public.ca_firms WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.ca_gstr2b_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  filing_period text NOT NULL,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id),
  file_name text NOT NULL,
  file_size_bytes integer,
  raw_data jsonb,
  record_count integer DEFAULT 0,
  processing_status text NOT NULL DEFAULT 'pending',
  processed_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ca_gstr2b_uploads_status_check CHECK (processing_status IN ('pending','processing','completed','failed'))
);
CREATE INDEX IF NOT EXISTS ca_gstr2b_uploads_business_period_idx ON public.ca_gstr2b_uploads (business_id, filing_period);
CREATE INDEX IF NOT EXISTS ca_gstr2b_uploads_ca_firm_idx ON public.ca_gstr2b_uploads (ca_firm_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_gstr2b_uploads TO authenticated;
GRANT ALL ON public.ca_gstr2b_uploads TO service_role;
ALTER TABLE public.ca_gstr2b_uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CA firm can manage GSTR2B uploads" ON public.ca_gstr2b_uploads FOR ALL
  USING (ca_firm_id IN (SELECT id FROM public.ca_firms WHERE user_id = auth.uid()))
  WITH CHECK (ca_firm_id IN (SELECT id FROM public.ca_firms WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.generate_compliance_calendar(
  p_business_id uuid,
  p_ca_firm_id uuid,
  p_financial_year text DEFAULT NULL
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_fy text; v_fy_start integer; v_count integer := 0;
  v_months text[] := ARRAY['04','05','06','07','08','09','10','11','12','01','02','03'];
  v_month text; v_cal_year integer; v_due_date date; v_period text;
BEGIN
  v_fy := COALESCE(p_financial_year, to_char(now(), 'YYYY') || '-' || to_char(now() + interval '1 year', 'YY'));
  v_fy_start := (split_part(v_fy, '-', 1))::integer;
  FOREACH v_month IN ARRAY v_months LOOP
    v_cal_year := CASE WHEN v_month::integer >= 4 THEN v_fy_start ELSE v_fy_start + 1 END;
    v_period := to_char(make_date(v_cal_year, v_month::integer, 1), 'Mon YYYY');
    v_due_date := make_date(v_cal_year, v_month::integer, 1) + interval '1 month' + interval '10 days';
    IF EXTRACT(DOW FROM v_due_date) = 0 THEN v_due_date := v_due_date + 1; END IF;
    IF EXTRACT(DOW FROM v_due_date) = 6 THEN v_due_date := v_due_date + 2; END IF;
    INSERT INTO public.ca_compliance_events (business_id, ca_firm_id, event_type, filing_period, due_date, status)
    VALUES (p_business_id, p_ca_firm_id, 'GSTR1', v_period, v_due_date, 'pending') ON CONFLICT DO NOTHING;
    v_due_date := make_date(v_cal_year, v_month::integer, 1) + interval '1 month' + interval '19 days';
    IF EXTRACT(DOW FROM v_due_date) = 0 THEN v_due_date := v_due_date + 1; END IF;
    IF EXTRACT(DOW FROM v_due_date) = 6 THEN v_due_date := v_due_date + 2; END IF;
    INSERT INTO public.ca_compliance_events (business_id, ca_firm_id, event_type, filing_period, due_date, status)
    VALUES (p_business_id, p_ca_firm_id, 'GSTR3B', v_period, v_due_date, 'pending') ON CONFLICT DO NOTHING;
    v_count := v_count + 2;
  END LOOP;
  INSERT INTO public.ca_compliance_events (business_id, ca_firm_id, event_type, filing_period, due_date, status) VALUES
    (p_business_id, p_ca_firm_id, 'TDS_QUARTERLY', 'Q1 ' || v_fy, make_date(v_fy_start, 7, 31), 'pending'),
    (p_business_id, p_ca_firm_id, 'TDS_QUARTERLY', 'Q2 ' || v_fy, make_date(v_fy_start, 10, 31), 'pending'),
    (p_business_id, p_ca_firm_id, 'TDS_QUARTERLY', 'Q3 ' || v_fy, make_date(v_fy_start + 1, 1, 31), 'pending'),
    (p_business_id, p_ca_firm_id, 'TDS_QUARTERLY', 'Q4 ' || v_fy, make_date(v_fy_start + 1, 5, 31), 'pending'),
    (p_business_id, p_ca_firm_id, 'GSTR9', 'FY ' || v_fy, make_date(v_fy_start + 1, 12, 31), 'pending')
  ON CONFLICT DO NOTHING;
  v_count := v_count + 5;
  RETURN v_count;
END; $$;
GRANT EXECUTE ON FUNCTION public.generate_compliance_calendar TO authenticated;

CREATE OR REPLACE FUNCTION public.compute_client_health_score(
  p_business_id uuid, p_ca_firm_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_overdue_filings integer; v_upcoming_filings integer;
  v_itc_mismatches integer; v_itc_risk numeric; v_pending_tds numeric;
  v_compliance_score integer; v_overall_score integer; v_result jsonb;
BEGIN
  SELECT COUNT(*) INTO v_overdue_filings FROM public.ca_compliance_events
   WHERE business_id = p_business_id AND ca_firm_id = p_ca_firm_id AND status = 'overdue';
  SELECT COUNT(*) INTO v_upcoming_filings FROM public.ca_compliance_events
   WHERE business_id = p_business_id AND ca_firm_id = p_ca_firm_id AND status = 'pending' AND due_date <= now() + interval '7 days';
  SELECT COUNT(*) FILTER (WHERE match_status IN ('mismatch','missing_in_2b')),
         COALESCE(SUM(CASE WHEN match_status IN ('mismatch','missing_in_2b') THEN total_itc ELSE 0 END), 0)
    INTO v_itc_mismatches, v_itc_risk
    FROM public.ca_itc_records WHERE business_id = p_business_id AND ca_firm_id = p_ca_firm_id;
  SELECT COALESCE(SUM(tds_amount - deposited_amount), 0) INTO v_pending_tds
    FROM public.ca_tds_records WHERE business_id = p_business_id AND ca_firm_id = p_ca_firm_id AND status IN ('pending','overdue');
  v_compliance_score := GREATEST(0, 100 - (v_overdue_filings * 20) - (v_upcoming_filings * 5) - (v_itc_mismatches * 10));
  v_overall_score := GREATEST(0, LEAST(100,
    (v_compliance_score * 0.6)::integer
    + (CASE WHEN v_itc_risk = 0 THEN 40 ELSE GREATEST(0, 40 - (v_itc_risk / 10000)::integer) END)));
  INSERT INTO public.ca_client_health_scores (
    business_id, ca_firm_id, computed_at, overall_score,
    compliance_score, itc_risk_amount, overdue_filings, pending_tds, cash_status, score_breakdown
  ) VALUES (
    p_business_id, p_ca_firm_id, now(), v_overall_score,
    v_compliance_score, v_itc_risk, v_overdue_filings, v_pending_tds,
    CASE WHEN v_overall_score >= 70 THEN 'safe' WHEN v_overall_score >= 40 THEN 'watch' ELSE 'critical' END,
    jsonb_build_object('overdue_filings', v_overdue_filings, 'upcoming_filings', v_upcoming_filings,
      'itc_mismatches', v_itc_mismatches, 'itc_risk_amount', v_itc_risk,
      'pending_tds', v_pending_tds, 'compliance_score', v_compliance_score)
  ) ON CONFLICT (business_id, ca_firm_id) DO UPDATE
    SET computed_at = now(), overall_score = EXCLUDED.overall_score,
        compliance_score = EXCLUDED.compliance_score, itc_risk_amount = EXCLUDED.itc_risk_amount,
        overdue_filings = EXCLUDED.overdue_filings, pending_tds = EXCLUDED.pending_tds,
        cash_status = EXCLUDED.cash_status, score_breakdown = EXCLUDED.score_breakdown;
  v_result := jsonb_build_object(
    'overall_score', v_overall_score, 'compliance_score', v_compliance_score,
    'cash_status', CASE WHEN v_overall_score >= 70 THEN 'safe' WHEN v_overall_score >= 40 THEN 'watch' ELSE 'critical' END,
    'itc_risk_amount', v_itc_risk, 'overdue_filings', v_overdue_filings, 'pending_tds', v_pending_tds);
  RETURN v_result;
END; $$;
GRANT EXECUTE ON FUNCTION public.compute_client_health_score TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_overdue_filings()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.ca_compliance_events SET status = 'overdue', updated_at = now()
   WHERE status = 'pending' AND due_date < CURRENT_DATE;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $$;
GRANT EXECUTE ON FUNCTION public.mark_overdue_filings TO service_role;
