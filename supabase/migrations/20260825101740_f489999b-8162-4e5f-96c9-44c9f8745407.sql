-- 1. Findings table
CREATE TABLE IF NOT EXISTS public.rls_security_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checked_at timestamptz NOT NULL DEFAULT now(),
  severity text NOT NULL CHECK (severity IN ('critical','warning','info')),
  finding_type text NOT NULL,
  table_name text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_rls_findings_checked_at ON public.rls_security_findings (checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_rls_findings_open ON public.rls_security_findings (severity, resolved);

GRANT SELECT, UPDATE ON public.rls_security_findings TO authenticated;
GRANT ALL ON public.rls_security_findings TO service_role;

ALTER TABLE public.rls_security_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read security findings" ON public.rls_security_findings;
CREATE POLICY "Admins read security findings" ON public.rls_security_findings
  FOR SELECT TO authenticated USING (public.is_admin_user());

DROP POLICY IF EXISTS "Senior admins resolve security findings" ON public.rls_security_findings;
CREATE POLICY "Senior admins resolve security findings" ON public.rls_security_findings
  FOR UPDATE TO authenticated USING (public.is_senior_admin()) WITH CHECK (public.is_senior_admin());

-- 2. Static policy audit
CREATE OR REPLACE FUNCTION public.audit_rls_permissiveness()
RETURNS TABLE(severity text, finding_type text, table_name text, detail jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
BEGIN
  -- tables with RLS disabled
  FOR r IN
    SELECT c.relname AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = false
  LOOP
    severity := 'critical'; finding_type := 'rls_disabled'; table_name := r.tbl;
    detail := jsonb_build_object('message', 'Row level security is disabled on this table');
    RETURN NEXT;
  END LOOP;

  -- RLS enabled but no policies at all
  FOR r IN
    SELECT c.relname AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = true
      AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname)
      AND EXISTS (
        SELECT 1 FROM information_schema.role_table_grants g
        WHERE g.table_schema = 'public' AND g.table_name = c.relname
          AND g.grantee IN ('anon','authenticated')
      )
  LOOP
    severity := 'warning'; finding_type := 'no_policies_but_granted'; table_name := r.tbl;
    detail := jsonb_build_object('message', 'Table is exposed to API roles but has no policies');
    RETURN NEXT;
  END LOOP;

  -- wide-open policies
  FOR r IN
    SELECT p.tablename AS tbl, p.policyname, p.cmd, p.roles::text AS roles, p.qual, p.with_check
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.permissive = 'PERMISSIVE'
      AND (
        (p.cmd IN ('SELECT','UPDATE','DELETE','ALL') AND (p.qual IS NULL OR btrim(p.qual) = 'true'))
        OR (p.cmd IN ('INSERT','ALL') AND (p.with_check IS NOT NULL AND btrim(p.with_check) = 'true'))
      )
  LOOP
    severity := CASE WHEN r.roles ~ '(anon|public)' THEN 'critical' ELSE 'warning' END;
    finding_type := 'overly_permissive_policy'; table_name := r.tbl;
    detail := jsonb_build_object('policy', r.policyname, 'command', r.cmd, 'roles', r.roles,
                                 'using', r.qual, 'with_check', r.with_check);
    RETURN NEXT;
  END LOOP;

  -- anonymous write access
  FOR r IN
    SELECT p.tablename AS tbl, p.policyname, p.cmd, p.roles::text AS roles
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.roles::text ~ '(anon|public)'
      AND p.cmd IN ('INSERT','UPDATE','DELETE','ALL')
      AND p.tablename NOT IN ('waitlist','waitlist_signups','callback_requests','early_access_requests','auth_rate_limits','realtime_event_log')
  LOOP
    severity := 'warning'; finding_type := 'anonymous_write_policy'; table_name := r.tbl;
    detail := jsonb_build_object('policy', r.policyname, 'command', r.cmd, 'roles', r.roles);
    RETURN NEXT;
  END LOOP;

  -- ca_* tables whose policies never reference firm scoping helpers
  FOR r IN
    SELECT p.tablename AS tbl, count(*) AS policy_count
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename LIKE 'ca\_%'
    GROUP BY p.tablename
    HAVING bool_and(
      coalesce(p.qual,'') || coalesce(p.with_check,'') !~
      '(user_in_ca_firm|get_user_ca_firm_id|ca_firm_has_client_access|ca_firm_has_all_client_access|is_ca_firm_privileged|ca_can|ca_member_role|client_portal_business_id|is_senior_admin|is_admin_user)'
    )
  LOOP
    severity := 'critical'; finding_type := 'ca_table_missing_firm_scope'; table_name := r.tbl;
    detail := jsonb_build_object('message', 'No policy on this CA table references a firm-scoping helper',
                                 'policy_count', r.policy_count);
    RETURN NEXT;
  END LOOP;
END;
$$;

-- 3. Live multi-firm probe: impersonate sample firm owners and look for cross-firm rows
CREATE OR REPLACE FUNCTION public.probe_ca_firm_isolation(p_firm_sample integer DEFAULT 5)
RETURNS TABLE(severity text, finding_type text, table_name text, detail jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  f record;
  t record;
  v_allowed uuid[];
  v_leaked bigint;
  v_results jsonb := '[]'::jsonb;
  v_claims text;
BEGIN
  FOR f IN
    SELECT id, user_id FROM public.ca_firms
    WHERE user_id IS NOT NULL
    ORDER BY created_at DESC
    LIMIT greatest(1, coalesce(p_firm_sample, 5))
  LOOP
    SELECT array_agg(DISTINCT firm_id) INTO v_allowed FROM (
      SELECT id AS firm_id FROM public.ca_firms WHERE user_id = f.user_id
      UNION
      SELECT ca_firm_id FROM public.ca_firm_members WHERE user_id = f.user_id AND status = 'active'
    ) x;

    v_claims := json_build_object('sub', f.user_id::text, 'role', 'authenticated')::text;

    FOR t IN
      SELECT c.relname AS tbl
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'ca_firm_id' AND a.attnum > 0 AND NOT a.attisdropped
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = true
      ORDER BY c.relname
    LOOP
      BEGIN
        PERFORM set_config('request.jwt.claims', v_claims, true);
        PERFORM set_config('role', 'authenticated', true);
        EXECUTE format(
          'SELECT count(*) FROM public.%I WHERE ca_firm_id IS NOT NULL AND NOT (ca_firm_id = ANY($1))',
          t.tbl
        ) INTO v_leaked USING coalesce(v_allowed, ARRAY[]::uuid[]);
        PERFORM set_config('role', 'none', true);

        IF v_leaked > 0 THEN
          v_results := v_results || jsonb_build_array(jsonb_build_object(
            'table', t.tbl, 'firm_id', f.id, 'probe_user', f.user_id, 'leaked_rows', v_leaked));
        END IF;
      EXCEPTION WHEN OTHERS THEN
        PERFORM set_config('role', 'none', true);
      END;
    END LOOP;
  END LOOP;

  PERFORM set_config('request.jwt.claims', NULL, true);

  FOR t IN SELECT * FROM jsonb_array_elements(v_results) AS e(v)
  LOOP
    severity := 'critical';
    finding_type := 'cross_firm_rows_visible';
    table_name := t.v->>'table';
    detail := t.v;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- 4. Runner that persists findings
CREATE OR REPLACE FUNCTION public.run_security_sanity_check(p_firm_sample integer DEFAULT 5)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_run timestamptz := now();
  v_critical integer := 0;
  v_total integer := 0;
BEGIN
  WITH all_findings AS (
    SELECT * FROM public.audit_rls_permissiveness()
    UNION ALL
    SELECT * FROM public.probe_ca_firm_isolation(p_firm_sample)
  ), ins AS (
    INSERT INTO public.rls_security_findings (checked_at, severity, finding_type, table_name, detail)
    SELECT v_run, severity, finding_type, table_name, detail FROM all_findings
    RETURNING severity
  )
  SELECT count(*)::int, count(*) FILTER (WHERE severity = 'critical')::int
    INTO v_total, v_critical FROM ins;

  -- keep history bounded
  DELETE FROM public.rls_security_findings WHERE checked_at < now() - interval '90 days';

  RAISE LOG 'security_sanity_check %', jsonb_build_object(
    'run_at', v_run, 'findings', v_total, 'critical', v_critical);

  RETURN jsonb_build_object(
    'run_at', v_run,
    'findings', v_total,
    'critical', v_critical,
    'alert', v_critical > 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.audit_rls_permissiveness() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.probe_ca_firm_isolation(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.run_security_sanity_check(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_security_sanity_check(integer) TO service_role;

-- 5. Daily schedule at 03:15 IST (21:45 UTC previous day)
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('security-sanity-check') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'security-sanity-check'
);

SELECT cron.schedule(
  'security-sanity-check',
  '45 21 * * *',
  $cron$ SELECT public.run_security_sanity_check(5); $cron$
);