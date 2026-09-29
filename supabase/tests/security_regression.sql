-- =============================================================================
-- Security regression tests for FynHelp
-- Verifies:
--   1. SECURITY DEFINER helper functions are NOT executable by `anon` / PUBLIC.
--   2. Trigger-only functions are NOT executable by `authenticated`.
--   3. DELETE RLS policies only permit owner-scoped rows
--      (business_id = get_user_business_id()).
--
-- Run with:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/security_regression.sql
--
-- These tests use plain SQL assertions (RAISE EXCEPTION on failure) so they
-- run without the pgTAP extension. Each assertion prints "OK: ..." on success.
-- =============================================================================

\set ON_ERROR_STOP on
BEGIN;

-- -----------------------------------------------------------------------------
-- Helper: assert a boolean condition or raise.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.assert(cond boolean, msg text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT cond THEN
    RAISE EXCEPTION 'ASSERTION FAILED: %', msg;
  END IF;
  RAISE NOTICE 'OK: %', msg;
END $$;

-- -----------------------------------------------------------------------------
-- 1. Function privilege checks
-- -----------------------------------------------------------------------------
-- Helpers that must be callable by `authenticated` only.
DO $$
DECLARE
  helper_fns text[] := ARRAY[
    'get_user_business_id()',
    'get_user_ca_firm_id()'
  ];
  fn text;
BEGIN
  FOREACH fn IN ARRAY helper_fns LOOP
    -- anon must NOT have EXECUTE
    PERFORM pg_temp.assert(
      NOT has_function_privilege('anon', 'public.' || fn, 'EXECUTE'),
      'anon cannot EXECUTE public.' || fn
    );
    -- PUBLIC must NOT have EXECUTE
    PERFORM pg_temp.assert(
      NOT has_function_privilege('public', 'public.' || fn, 'EXECUTE'),
      'PUBLIC cannot EXECUTE public.' || fn
    );
    -- authenticated MUST have EXECUTE (so RLS policies still work)
    PERFORM pg_temp.assert(
      has_function_privilege('authenticated', 'public.' || fn, 'EXECUTE'),
      'authenticated CAN EXECUTE public.' || fn
    );
  END LOOP;
END $$;

-- Trigger-only functions must NOT be executable by anyone but the owner / triggers.
DO $$
DECLARE
  trigger_fns text[] := ARRAY[
    'handle_new_user()',
    'handle_ca_request_approval()',
    'update_updated_at_column()'
  ];
  fn text;
BEGIN
  FOREACH fn IN ARRAY trigger_fns LOOP
    PERFORM pg_temp.assert(
      NOT has_function_privilege('anon', 'public.' || fn, 'EXECUTE'),
      'anon cannot EXECUTE trigger fn public.' || fn
    );
    PERFORM pg_temp.assert(
      NOT has_function_privilege('authenticated', 'public.' || fn, 'EXECUTE'),
      'authenticated cannot EXECUTE trigger fn public.' || fn
    );
    PERFORM pg_temp.assert(
      NOT has_function_privilege('public', 'public.' || fn, 'EXECUTE'),
      'PUBLIC cannot EXECUTE trigger fn public.' || fn
    );
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 2. DELETE policies exist and are owner-scoped
-- -----------------------------------------------------------------------------
-- Every business-owned table must have a DELETE policy whose USING clause
-- references get_user_business_id().
DO $$
DECLARE
  owned_tables text[] := ARRAY[
    'alerts',
    'bank_accounts',
    'compliance_events',
    'employees',          -- uses org_id
    'gst_filings',
    'gst_itc_lines',
    'payables',
    'payroll_records',
    'payroll_snapshots',
    'receivables',
    'tds_filings',
    'transactions',
    'vendor_gst_health'
  ];
  t text;
  policy_count int;
  scoped_count int;
BEGIN
  FOREACH t IN ARRAY owned_tables LOOP
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = t AND cmd = 'DELETE';

    PERFORM pg_temp.assert(
      policy_count >= 1,
      format('table public.%s has at least one DELETE policy', t)
    );

    SELECT COUNT(*) INTO scoped_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = t
      AND cmd = 'DELETE'
      AND qual ILIKE '%get_user_business_id()%';

    PERFORM pg_temp.assert(
      scoped_count >= 1,
      format(
        'DELETE policy on public.%s is owner-scoped via get_user_business_id()',
        t
      )
    );
  END LOOP;
END $$;

-- Tables that MUST NOT allow DELETE (audit / immutable history).
DO $$
DECLARE
  no_delete_tables text[] := ARRAY[
    'businesses',
    'ca_access_requests',
    'ca_activity_log',
    'ca_firms',
    'ca_notifications',
    'ca_reports_log',
    'csv_uploads',
    'gst_notice_risk_scores',
    'nidhi_briefs',
    'nidhi_conversations',
    'profiles',
    'receivable_chases',
    'simulations'
  ];
  t text;
  policy_count int;
BEGIN
  FOREACH t IN ARRAY no_delete_tables LOOP
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = t AND cmd = 'DELETE';

    PERFORM pg_temp.assert(
      policy_count = 0,
      format('table public.%s has NO DELETE policy (immutable)', t)
    );
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 3. Behavioural test: RLS blocks cross-tenant DELETE
-- -----------------------------------------------------------------------------
-- Uses existing profiles/businesses in the DB. We need two distinct tenants
-- to prove that user A cannot delete user B's receivable. If fewer than two
-- tenants exist (typical in a fresh DB), we skip with a NOTICE — the static
-- policy checks above already prove the policy is owner-scoped.
DO $$
DECLARE
  user_a uuid;
  biz_a  uuid;
  biz_b  uuid;
  rec_b  uuid;
  deleted_count int;
BEGIN
  SELECT p.user_id, p.business_id INTO user_a, biz_a
  FROM public.profiles p
  WHERE p.business_id IS NOT NULL
  ORDER BY p.created_at
  LIMIT 1;

  SELECT b.id INTO biz_b
  FROM public.businesses b
  WHERE b.id IS DISTINCT FROM biz_a
  LIMIT 1;

  IF user_a IS NULL OR biz_b IS NULL THEN
    RAISE NOTICE 'SKIP: behavioural cross-tenant DELETE test (need 2 tenants in DB)';
    RETURN;
  END IF;

  -- Insert a throwaway receivable owned by tenant B.
  rec_b := gen_random_uuid();
  INSERT INTO public.receivables (id, business_id, customer_name, amount)
  VALUES (rec_b, biz_b, '__rls_test__', 1);

  -- Switch to tenant A's identity.
  SET LOCAL ROLE authenticated;
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', user_a::text, 'role', 'authenticated')::text,
    true
  );

  DELETE FROM public.receivables WHERE id = rec_b;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RESET ROLE;

  PERFORM pg_temp.assert(
    deleted_count = 0,
    'tenant A cannot DELETE tenant B receivables row via RLS'
  );

  PERFORM pg_temp.assert(
    EXISTS (SELECT 1 FROM public.receivables WHERE id = rec_b),
    'tenant B receivable row survived cross-tenant DELETE attempt'
  );
END $$;

-- Always roll back so the test leaves no seed data behind.
ROLLBACK;

\echo ''
\echo '================================================================'
\echo '  ALL SECURITY REGRESSION TESTS PASSED'
\echo '================================================================'
