-- Security lint: signed-in users could call SECURITY DEFINER functions that
-- act with owner rights. Close the three that had no caller check, and take
-- EXECUTE away from every function only triggers or the server use.
-- The row-level-security helpers and token-based RPCs stay callable; they are
-- listed with reasons in .github/security/lint-baseline.json.

-- 1. Demo cleanup: admins only.
CREATE OR REPLACE FUNCTION public.clear_ca_demo_data()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'admins only' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.ca_notifications WHERE is_demo = true;
  DELETE FROM public.ca_tds_records WHERE is_demo = true;
  DELETE FROM public.ca_itc_records WHERE is_demo = true;
  DELETE FROM public.ca_compliance_events WHERE is_demo = true;
  DELETE FROM public.ca_client_health_scores WHERE is_demo = true;
  DELETE FROM public.ca_client_access WHERE is_demo = true;
  DELETE FROM public.businesses WHERE is_demo = true;
  DELETE FROM public.ca_firms WHERE is_demo = true;
  RETURN 'All CA demo data cleared.';
END;
$function$;

-- 2. Client lookup by reference code: only inside the caller's own firm.
CREATE OR REPLACE FUNCTION public.lookup_client_by_reference(p_reference_code text, p_ca_firm_id uuid)
 RETURNS TABLE(business_id uuid, business_name text, gstin text, storage_namespace text, client_reference_code text, is_active boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.user_in_ca_firm(p_ca_firm_id) THEN
    RAISE EXCEPTION 'not a member of this firm' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    b.id AS business_id,
    b.business_name,
    b.gstin,
    cca.storage_namespace,
    cca.client_reference_code,
    cca.is_active
  FROM public.ca_client_access cca
  JOIN public.businesses b ON b.id = cca.business_id
  WHERE cca.client_reference_code = UPPER(p_reference_code)
    AND cca.ca_firm_id = p_ca_firm_id;
END;
$function$;

-- 3. Compliance calendar: only the firm's own members.
CREATE OR REPLACE FUNCTION public.generate_compliance_calendar(p_business_id uuid, p_ca_firm_id uuid, p_financial_year text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_fy text; v_fy_start integer; v_count integer := 0;
  v_months text[] := ARRAY['04','05','06','07','08','09','10','11','12','01','02','03'];
  v_month text; v_cal_year integer; v_due_date date; v_period text;
BEGIN
  -- Only the firm's own members (or the server) may write its calendar.
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.user_in_ca_firm(p_ca_firm_id) THEN
    RAISE EXCEPTION 'not a member of this firm' USING ERRCODE = '42501';
  END IF;
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
END; $function$;

-- 4. Trigger functions run without EXECUTE; server-only and unused functions
--    are called with the service role. Nobody else needs to call them.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS fn
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef AND p.proname = ANY (ARRAY[
      -- triggers
      'enforce_ca_access_request_immutable_fields', 'enforce_ca_message_sender_type',
      'generate_client_reference_code', 'link_business_to_creator',
      'prevent_ca_client_access_repoint', 'prevent_ca_firm_verification_self_update',
      'track_extraction_correction',
      -- called only by edge functions with the service role
      'check_ai_quota', 'check_and_increment_rate_limit', 'compute_client_health_score',
      -- not called by the app
      'ca_probe_sample', 'check_waitlist_status', 'get_latest_demo_insight',
      'mark_overdue_filings', 'reset_rate_limit', 'run_security_sanity_check',
      'security_check_caller_allowed', 'zoho_exchange_code', 'zoho_get_auth_url',
      'zoho_sync_transactions'
    ])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.fn);
  END LOOP;
END $$;
