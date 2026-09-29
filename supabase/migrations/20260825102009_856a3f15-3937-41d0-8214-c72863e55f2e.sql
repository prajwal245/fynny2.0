DROP FUNCTION IF EXISTS public.probe_ca_firm_isolation(integer);
DROP FUNCTION IF EXISTS public.run_security_sanity_check(integer);

CREATE OR REPLACE FUNCTION public.ca_probe_sample(p_limit integer DEFAULT 5)
RETURNS TABLE(firm_id uuid, probe_user uuid, allowed_firms uuid[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF current_setting('request.jwt.claims', true) IS NOT NULL AND NOT public.is_admin_user() THEN
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

CREATE OR REPLACE FUNCTION public.probe_ca_firm_isolation(p_firm_sample integer DEFAULT 5)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  f record;
  t record;
  v_leaked bigint;
  v_results jsonb := '[]'::jsonb;
BEGIN
  IF (SELECT rolbypassrls OR rolsuper FROM pg_roles WHERE rolname = current_user) THEN
    RETURN jsonb_build_array(jsonb_build_object(
      'table', '-', 'severity', 'info', 'finding_type', 'probe_skipped',
      'message', 'probe ran as a privileged role; RLS was bypassed'));
  END IF;

  FOR f IN SELECT * FROM public.ca_probe_sample(p_firm_sample) LOOP
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', f.probe_user::text, 'role', 'authenticated')::text, true);

    FOR t IN
      SELECT c.relname AS tbl
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'ca_firm_id'
        AND a.attnum > 0 AND NOT a.attisdropped
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = true
      ORDER BY c.relname
    LOOP
      BEGIN
        EXECUTE format(
          'SELECT count(*) FROM public.%I WHERE ca_firm_id IS NOT NULL AND NOT (ca_firm_id = ANY($1))',
          t.tbl)
          INTO v_leaked USING coalesce(f.allowed_firms, ARRAY[]::uuid[]);
      EXCEPTION WHEN insufficient_privilege THEN
        v_leaked := 0;
      END;

      IF v_leaked > 0 THEN
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'table', t.tbl, 'severity', 'critical', 'finding_type', 'cross_firm_rows_visible',
          'firm_id', f.firm_id, 'probe_user', f.probe_user, 'leaked_rows', v_leaked));
      END IF;
    END LOOP;
  END LOOP;

  PERFORM set_config('request.jwt.claims', NULL, true);
  RETURN v_results;
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
  IF current_setting('request.jwt.claims', true) IS NOT NULL AND NOT public.is_senior_admin() THEN
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

REVOKE ALL ON FUNCTION public.ca_probe_sample(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.probe_ca_firm_isolation(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.run_security_sanity_check(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ca_probe_sample(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.probe_ca_firm_isolation(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.run_security_sanity_check(jsonb) TO authenticated, service_role;

SELECT cron.unschedule('security-sanity-check') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'security-sanity-check');

SELECT cron.schedule(
  'security-sanity-check',
  '45 21 * * *',
  $cron$
  DO $inner$
  DECLARE v_probe jsonb;
  BEGIN
    SET LOCAL ROLE authenticated;
    v_probe := public.probe_ca_firm_isolation(5);
    RESET ROLE;
    PERFORM public.run_security_sanity_check(v_probe);
  END
  $inner$;
  $cron$
);