-- =============================================================================
-- Security regression tests (pgTAP edition)
--
-- Outputs standard TAP — runnable via:
--   pg_prove -d "$SUPABASE_DB_URL" supabase/tests/security_regression.test.sql
-- or
--   psql "$SUPABASE_DB_URL" -X -q -f supabase/tests/security_regression.test.sql
-- or via the Supabase CLI:
--   supabase test db
--
-- Verifies:
--   1. SECURITY DEFINER helper functions are NOT executable by anon / PUBLIC
--      and ARE executable by authenticated.
--   2. Trigger-only functions are NOT executable by any client role.
--   3. DELETE RLS policies on owner-scoped tables filter by
--      get_user_business_id().
--   4. Audit / immutable tables have NO DELETE policy.
--   5. Behavioural: tenant A cannot DELETE tenant B's receivables row.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

-- 6 helper privilege tests + 9 trigger privilege tests +
-- (13 owned tables * 2) DELETE policy tests +
-- 13 immutable-table tests +
-- 4 DELETE behavioural tests + 3 SELECT behavioural tests + 3 UPDATE behavioural tests
SELECT plan(64);

-- -----------------------------------------------------------------------------
-- 1. Helper function privileges (must be callable by authenticated only)
-- -----------------------------------------------------------------------------
SELECT ok(
  NOT has_function_privilege('anon', 'public.get_user_business_id()', 'EXECUTE'),
  'anon cannot EXECUTE public.get_user_business_id()'
);
SELECT ok(
  NOT has_function_privilege('public', 'public.get_user_business_id()', 'EXECUTE'),
  'PUBLIC cannot EXECUTE public.get_user_business_id()'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.get_user_business_id()', 'EXECUTE'),
  'authenticated CAN EXECUTE public.get_user_business_id()'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.get_user_ca_firm_id()', 'EXECUTE'),
  'anon cannot EXECUTE public.get_user_ca_firm_id()'
);
SELECT ok(
  NOT has_function_privilege('public', 'public.get_user_ca_firm_id()', 'EXECUTE'),
  'PUBLIC cannot EXECUTE public.get_user_ca_firm_id()'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.get_user_ca_firm_id()', 'EXECUTE'),
  'authenticated CAN EXECUTE public.get_user_ca_firm_id()'
);

-- -----------------------------------------------------------------------------
-- 2. Trigger-only functions: NO client role may EXECUTE
-- -----------------------------------------------------------------------------
SELECT ok(
  NOT has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE'),
  'anon cannot EXECUTE handle_new_user()'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE'),
  'authenticated cannot EXECUTE handle_new_user()'
);
SELECT ok(
  NOT has_function_privilege('public', 'public.handle_new_user()', 'EXECUTE'),
  'PUBLIC cannot EXECUTE handle_new_user()'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.handle_ca_request_approval()', 'EXECUTE'),
  'anon cannot EXECUTE handle_ca_request_approval()'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.handle_ca_request_approval()', 'EXECUTE'),
  'authenticated cannot EXECUTE handle_ca_request_approval()'
);
SELECT ok(
  NOT has_function_privilege('public', 'public.handle_ca_request_approval()', 'EXECUTE'),
  'PUBLIC cannot EXECUTE handle_ca_request_approval()'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.update_updated_at_column()', 'EXECUTE'),
  'anon cannot EXECUTE update_updated_at_column()'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.update_updated_at_column()', 'EXECUTE'),
  'authenticated cannot EXECUTE update_updated_at_column()'
);
SELECT ok(
  NOT has_function_privilege('public', 'public.update_updated_at_column()', 'EXECUTE'),
  'PUBLIC cannot EXECUTE update_updated_at_column()'
);

-- -----------------------------------------------------------------------------
-- 3. Every owner-scoped table has a DELETE policy filtered by
--    get_user_business_id(). Two assertions per table:
--      (a) at least one DELETE policy exists
--      (b) at least one DELETE policy references get_user_business_id()
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  owned_tables text[] := ARRAY[
    'alerts',
    'bank_accounts',
    'compliance_events',
    'employees',
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
BEGIN
  FOREACH t IN ARRAY owned_tables LOOP
    PERFORM ok(
      EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = t AND cmd = 'DELETE'
      ),
      format('public.%s has a DELETE policy', t)
    );
    PERFORM ok(
      EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = t
          AND cmd = 'DELETE'
          AND qual ILIKE '%get_user_business_id()%'
      ),
      format('public.%s DELETE policy is owner-scoped', t)
    );
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 4. Audit / immutable tables: NO DELETE policy may exist
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t text;
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
BEGIN
  FOREACH t IN ARRAY no_delete_tables LOOP
    PERFORM ok(
      NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = t AND cmd = 'DELETE'
      ),
      format('public.%s has NO DELETE policy (immutable)', t)
    );
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 5. Behavioural test: cross-tenant DELETE is blocked by RLS.
--
-- Spoofs the request that PostgREST would send for an authenticated user by
-- setting ALL JWT-related GUCs that auth.uid() / auth.role() / auth.jwt()
-- consult on this Supabase instance.
--
-- Seeding strategy ("seed-or-reuse, then auto-clean"):
--   * If the DB already has >=2 distinct tenants, reuse them — no writes.
--   * Otherwise, synthesise 2 tenants tagged with marker '__pgtap_seed__'.
--     - Temporarily drop profiles.user_id -> auth.users FK (the whole suite
--       runs in BEGIN..ROLLBACK, so the FK reappears at COMMIT/ROLLBACK time).
--     - Insert tagged businesses + profiles + a tagged receivable.
--   * After the assertions run, the seed cleanup helper deletes ALL rows
--     bearing the marker, in FK-safe order. The outer ROLLBACK is the final
--     belt-and-braces guarantee — nothing seeded ever survives.
-- -----------------------------------------------------------------------------

-- Reusable JWT-spoof helper: matches PostgREST's GUC layout exactly.
CREATE OR REPLACE FUNCTION pg_temp.spoof_jwt(_user_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  claims jsonb := jsonb_build_object(
    'sub',  _user_id::text,
    'role', 'authenticated',
    'aud',  'authenticated',
    'iss',  'supabase',
    'iat',  extract(epoch FROM now())::int,
    'exp',  extract(epoch FROM now())::int + 3600
  );
BEGIN
  PERFORM set_config('role',                      'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub',     _user_id::text,  true);
  PERFORM set_config('request.jwt.claim.role',    'authenticated', true);
  PERFORM set_config('request.jwt.claim.aud',     'authenticated', true);
  PERFORM set_config('request.jwt.claims',        claims::text,    true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.reset_jwt()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub',  '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
  PERFORM set_config('request.jwt.claim.aud',  '', true);
  PERFORM set_config('request.jwt.claims',     '', true);
  RESET ROLE;
END $$;

-- Marker used to identify and clean up everything we seed.
CREATE OR REPLACE FUNCTION pg_temp.seed_marker() RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT '__pgtap_seed__'::text $$;

-- Removes every seeded row across all touched tables, FK-safe order.
-- Idempotent: safe to call even if nothing was seeded.
CREATE OR REPLACE FUNCTION pg_temp.cleanup_seeds() RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  marker text := pg_temp.seed_marker();
BEGIN
  -- Children first.
  DELETE FROM public.receivables   WHERE customer_name = marker;
  DELETE FROM public.profiles      WHERE full_name     = marker;
  DELETE FROM public.businesses    WHERE business_name = marker;
EXCEPTION
  WHEN OTHERS THEN
    -- Cleanup must never mask a test failure; just record it.
    RAISE WARNING 'pg_temp.cleanup_seeds(): %', SQLERRM;
END $$;

-- Returns (user_a, biz_a, biz_b, did_seed). Seeds two tenants only if
-- fewer than two are present. Tagged with seed_marker() for cleanup.
CREATE OR REPLACE FUNCTION pg_temp.ensure_two_tenants(
  OUT user_a uuid, OUT biz_a uuid, OUT biz_b uuid, OUT did_seed boolean
) LANGUAGE plpgsql AS $$
DECLARE
  marker text := pg_temp.seed_marker();
  user_b uuid;
BEGIN
  did_seed := false;

  -- Try to reuse existing data.
  SELECT p.user_id, p.business_id INTO user_a, biz_a
  FROM public.profiles p
  WHERE p.business_id IS NOT NULL
  ORDER BY p.created_at
  LIMIT 1;

  SELECT b.id INTO biz_b
  FROM public.businesses b
  WHERE b.id IS DISTINCT FROM biz_a
  LIMIT 1;

  IF user_a IS NOT NULL AND biz_b IS NOT NULL THEN
    RETURN;
  END IF;

  -- Synthesise tenants. The whole suite runs in BEGIN..ROLLBACK, so
  -- dropping the auth FK here is fully reverted at the end.
  ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_user_id_fkey;

  user_a := gen_random_uuid();
  user_b := gen_random_uuid();
  biz_a  := gen_random_uuid();
  biz_b  := gen_random_uuid();

  INSERT INTO public.businesses (id, business_name) VALUES
    (biz_a, marker),
    (biz_b, marker);

  INSERT INTO public.profiles (user_id, business_id, full_name) VALUES
    (user_a, biz_a, marker),
    (user_b, biz_b, marker);

  did_seed := true;
END $$;

DO $$
DECLARE
  user_a uuid;
  biz_a  uuid;
  biz_b  uuid;
  did_seed boolean;
  rec_b  uuid;
  resolved_uid uuid;
  resolved_business uuid;
  deleted_count int;
  updated_count int;
  selected_count int;
  surviving_name text;
  marker text := pg_temp.seed_marker();
  attack_name constant text := '__pgtap_attack__';
BEGIN
  SELECT * INTO user_a, biz_a, biz_b, did_seed
  FROM pg_temp.ensure_two_tenants();

  IF user_a IS NULL OR biz_b IS NULL THEN
    -- Should be unreachable; ensure_two_tenants() guarantees both.
    PERFORM skip('cross-tenant RLS: tenant setup failed', 10);
    RETURN;
  END IF;

  -- Tag the test row so cleanup_seeds() removes it even on early abort.
  rec_b := gen_random_uuid();
  INSERT INTO public.receivables (id, business_id, customer_name, amount)
  VALUES (rec_b, biz_b, marker, 1);

  -- Switch to the spoofed authenticated user (tenant A).
  PERFORM pg_temp.spoof_jwt(user_a);

  -- Sanity-check the spoof: auth.uid() and the SECURITY DEFINER helper
  -- must resolve to tenant A before we trust the cross-tenant assertions.
  resolved_uid := auth.uid();
  resolved_business := public.get_user_business_id();

  PERFORM is(
    resolved_uid,
    user_a,
    'auth.uid() resolves to spoofed tenant A user'
  );
  PERFORM is(
    resolved_business,
    biz_a,
    'get_user_business_id() returns tenant A business'
  );

  -- ---------------------------------------------------------------------------
  -- SELECT: tenant A must NOT see tenant B's row.
  -- RLS on SELECT silently filters rows out, so we assert invisibility three
  -- ways: direct id lookup, business_id scan, and full-table count of B's id.
  -- ---------------------------------------------------------------------------
  SELECT count(*) INTO selected_count
  FROM public.receivables WHERE id = rec_b;
  PERFORM is(
    selected_count,
    0,
    'tenant A cannot SELECT tenant B receivable by id (RLS hides it)'
  );

  SELECT count(*) INTO selected_count
  FROM public.receivables WHERE business_id = biz_b;
  PERFORM is(
    selected_count,
    0,
    'tenant A cannot SELECT any rows scoped to tenant B business_id'
  );

  SELECT count(*) INTO selected_count
  FROM public.receivables WHERE customer_name = marker AND business_id = biz_b;
  PERFORM is(
    selected_count,
    0,
    'tenant A SELECT cannot leak tenant B rows via marker filter'
  );

  -- ---------------------------------------------------------------------------
  -- UPDATE: tenant A must NOT modify tenant B's row.
  -- RLS makes the row invisible to UPDATE — the statement succeeds but
  -- affects 0 rows. We additionally verify the row's contents are unchanged
  -- by re-reading as the underlying owner (bypass RLS via reset).
  -- ---------------------------------------------------------------------------
  UPDATE public.receivables
     SET customer_name = attack_name, amount = 999999
   WHERE id = rec_b;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  PERFORM is(
    updated_count,
    0,
    'tenant A UPDATE on tenant B receivable affects 0 rows (RLS blocks)'
  );

  -- Drop spoof to verify the row is untouched from a privileged vantage.
  PERFORM pg_temp.reset_jwt();
  SELECT customer_name INTO surviving_name
  FROM public.receivables WHERE id = rec_b;
  PERFORM is(
    surviving_name,
    marker,
    'tenant B receivable customer_name unchanged after cross-tenant UPDATE'
  );
  PERFORM ok(
    NOT EXISTS (
      SELECT 1 FROM public.receivables
      WHERE id = rec_b AND customer_name = attack_name
    ),
    'tenant B receivable shows no trace of tenant A UPDATE attempt'
  );

  -- ---------------------------------------------------------------------------
  -- DELETE: tenant A must NOT delete tenant B's row.
  -- ---------------------------------------------------------------------------
  PERFORM pg_temp.spoof_jwt(user_a);
  DELETE FROM public.receivables WHERE id = rec_b;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  PERFORM pg_temp.reset_jwt();

  PERFORM is(
    deleted_count,
    0,
    'tenant A cannot DELETE tenant B receivables row via RLS'
  );
  PERFORM ok(
    EXISTS (SELECT 1 FROM public.receivables WHERE id = rec_b),
    'tenant B receivable row survived cross-tenant DELETE attempt'
  );

  -- Auto-clean. The outer ROLLBACK is the final safety net, but explicit
  -- cleanup keeps the suite robust even when run with autocommit on.
  PERFORM pg_temp.cleanup_seeds();
END $$;

-- -----------------------------------------------------------------------------
-- Finalize
-- -----------------------------------------------------------------------------
SELECT * FROM finish();

ROLLBACK;
