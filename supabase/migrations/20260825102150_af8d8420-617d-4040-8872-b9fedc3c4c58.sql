CREATE OR REPLACE FUNCTION public.audit_rls_permissiveness()
RETURNS TABLE(severity text, finding_type text, table_name text, detail jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  c_scoped text := '(auth\.uid|auth\.role|user_in_ca_firm|get_user_ca_firm_id|get_user_business_id|ca_firm_has_client_access|ca_firm_has_all_client_access|is_ca_firm_privileged|ca_can|ca_member_role|client_portal_business_id|is_senior_admin|is_admin_user|is_blog_admin|is_blog_editor|has_role|client_portal|business_id)';
  c_public_ok text[] := ARRAY['waitlist','waitlist_signups','callback_requests','early_access_requests','auth_rate_limits','realtime_event_log','auth_link_events','demo_insights','demo_organizations','roadmap_stops','glossary_terms','blog_posts','resources','resource_glossary','resource_videos','hsn_master','ca_role_permissions','ca_canonical_fields'];
BEGIN
  FOR r IN
    SELECT c.relname AS tbl
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = false
  LOOP
    severity := 'critical'; finding_type := 'rls_disabled'; table_name := r.tbl;
    detail := jsonb_build_object('message', 'Row level security is disabled on this table');
    RETURN NEXT;
  END LOOP;

  FOR r IN
    SELECT c.relname AS tbl
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = true
      AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname)
      AND EXISTS (SELECT 1 FROM information_schema.role_table_grants g
                  WHERE g.table_schema='public' AND g.table_name=c.relname
                    AND g.grantee IN ('anon','authenticated'))
  LOOP
    severity := 'warning'; finding_type := 'no_policies_but_granted'; table_name := r.tbl;
    detail := jsonb_build_object('message','Table is exposed to API roles but has no policies');
    RETURN NEXT;
  END LOOP;

  -- wide-open policies reachable by anon/public/authenticated (service_role excluded)
  FOR r IN
    SELECT p.tablename AS tbl, p.policyname, p.cmd, p.roles::text AS roles, p.qual, p.with_check
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.permissive = 'PERMISSIVE'
      AND p.roles::text !~ 'service_role'
      AND NOT (p.tablename = ANY(c_public_ok))
      AND (
        (p.cmd IN ('SELECT','UPDATE','DELETE','ALL') AND (p.qual IS NULL OR btrim(p.qual) = 'true'))
        OR (p.cmd IN ('INSERT','ALL') AND p.with_check IS NOT NULL AND btrim(p.with_check) = 'true')
      )
  LOOP
    severity := CASE WHEN r.roles ~ '(anon|public)' THEN 'critical' ELSE 'warning' END;
    finding_type := 'overly_permissive_policy'; table_name := r.tbl;
    detail := jsonb_build_object('policy', r.policyname, 'command', r.cmd, 'roles', r.roles,
                                 'using', r.qual, 'with_check', r.with_check);
    RETURN NEXT;
  END LOOP;

  -- anon/public-reachable writes whose expressions never scope the caller
  FOR r IN
    SELECT p.tablename AS tbl, p.policyname, p.cmd, p.roles::text AS roles, p.qual, p.with_check
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.roles::text ~ '(anon|public)'
      AND p.cmd IN ('INSERT','UPDATE','DELETE','ALL')
      AND NOT (p.tablename = ANY(c_public_ok))
      AND coalesce(p.qual,'') || coalesce(p.with_check,'') !~ c_scoped
  LOOP
    severity := 'warning'; finding_type := 'unscoped_public_write_policy'; table_name := r.tbl;
    detail := jsonb_build_object('policy', r.policyname, 'command', r.cmd, 'roles', r.roles,
                                 'using', r.qual, 'with_check', r.with_check);
    RETURN NEXT;
  END LOOP;

  -- ca_* tables with no firm scoping anywhere
  FOR r IN
    SELECT p.tablename AS tbl, count(*) AS policy_count
    FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename LIKE 'ca\_%'
      AND NOT (p.tablename = ANY(c_public_ok))
    GROUP BY p.tablename
    HAVING bool_and(coalesce(p.qual,'') || coalesce(p.with_check,'') !~ c_scoped)
  LOOP
    severity := 'critical'; finding_type := 'ca_table_missing_firm_scope'; table_name := r.tbl;
    detail := jsonb_build_object('message','No policy on this CA table references a caller-scoping helper',
                                 'policy_count', r.policy_count);
    RETURN NEXT;
  END LOOP;
END;
$$;

DELETE FROM public.rls_security_findings;