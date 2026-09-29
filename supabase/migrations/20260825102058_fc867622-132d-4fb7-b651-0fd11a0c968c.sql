CREATE OR REPLACE FUNCTION public.security_check_caller_allowed()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_claims text := current_setting('request.jwt.claims', true);
  v_sub text;
BEGIN
  IF v_claims IS NULL OR btrim(v_claims) = '' OR btrim(v_claims) = 'null' THEN
    RETURN true; -- no end-user context: scheduled job / server-side call
  END IF;
  BEGIN
    v_sub := (v_claims::jsonb)->>'sub';
  EXCEPTION WHEN OTHERS THEN
    v_sub := NULL;
  END;
  IF v_sub IS NULL THEN
    RETURN true;
  END IF;
  RETURN public.is_senior_admin();
END;
$$;

REVOKE ALL ON FUNCTION public.security_check_caller_allowed() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_check_caller_allowed() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ca_probe_sample(p_limit integer DEFAULT 5)
RETURNS TABLE(firm_id uuid, probe_user uuid, allowed_firms uuid[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.security_check_caller_allowed() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT f.id, f.user_id,
    (SELECT array_agg(DISTINCT x.fid) FROM (
        SELECT f2.id AS fid FROM public.ca_firms f2 WHERE f2.user_id = f.user_id
        UNION
        SELECT m.ca_firm_id FROM public.ca_firm_members m
          WHERE m.user_id = f.user_id AND m.status = 'active'
      ) x)
  FROM public.ca_firms f
  WHERE f.user_id IS NOT NULL
  ORDER BY f.created_at DESC
  LIMIT greatest(1, coalesce(p_limit, 5));
END;
$$;

CREATE OR REPLACE FUNCTION public.run_security_sanity_check(p_probe jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_run timestamptz := now();
  v_total integer := 0;
  v_critical integer := 0;
BEGIN
  IF NOT public.security_check_caller_allowed() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  WITH all_findings AS (
    SELECT a.severity, a.finding_type, a.table_name, a.detail
      FROM public.audit_rls_permissiveness() a
    UNION ALL
    SELECT coalesce(e->>'severity','critical'),
           coalesce(e->>'finding_type','cross_firm_rows_visible'),
           coalesce(e->>'table','-'),
           e
      FROM jsonb_array_elements(coalesce(p_probe, '[]'::jsonb)) AS e
  ), ins AS (
    INSERT INTO public.rls_security_findings (checked_at, severity, finding_type, table_name, detail)
    SELECT v_run, severity, finding_type, table_name, detail FROM all_findings
    RETURNING severity
  )
  SELECT count(*)::int, count(*) FILTER (WHERE severity = 'critical')::int
    INTO v_total, v_critical FROM ins;

  DELETE FROM public.rls_security_findings WHERE checked_at < now() - interval '90 days';

  RAISE LOG 'security_sanity_check %', jsonb_build_object(
    'run_at', v_run, 'findings', v_total, 'critical', v_critical);

  RETURN jsonb_build_object('run_at', v_run, 'findings', v_total,
                            'critical', v_critical, 'alert', v_critical > 0);
END;
$$;