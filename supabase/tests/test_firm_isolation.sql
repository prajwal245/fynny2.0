-- Tester isolation check. Plain SQL, runs in one transaction and ROLLS BACK: nothing is kept.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/test_firm_isolation.sql
-- (or paste into the Supabase SQL editor). It needs the migration 20261027090000_test_firms.sql applied.
-- Prints "ok - ..." for each guarantee and stops at the first one that does not hold.
BEGIN;

CREATE TEMP TABLE _ids (k text PRIMARY KEY, v uuid);
GRANT ALL ON _ids TO PUBLIC;
INSERT INTO _ids SELECT k, gen_random_uuid() FROM unnest(ARRAY['real_user','real_user2','test_user','real_firm','real_firm2','test_firm','demo_firm','demo_user']) AS k;
CREATE FUNCTION pg_temp.id(_k text) RETURNS uuid LANGUAGE sql AS $$ SELECT v FROM _ids WHERE k = _k $$;

-- Fixtures (as the platform): two real firms, one test firm, one demo firm, one client row each.
INSERT INTO auth.users (id, email) VALUES
  (pg_temp.id('real_user'),  'owner@real.example'),
  (pg_temp.id('real_user2'), 'second@real.example'),
  (pg_temp.id('test_user'),  'tester@fynhelp.example'),
  (pg_temp.id('demo_user'),  'demo@example.com');
INSERT INTO public.ca_firms (id, user_id, firm_name, email, is_test, is_demo) VALUES
  (pg_temp.id('real_firm'),  pg_temp.id('real_user'),  'Real Firm',   'owner@real.example',  false, false),
  (pg_temp.id('real_firm2'), pg_temp.id('real_user2'), 'Real Firm 2', 'second@real.example', false, false),
  (pg_temp.id('test_firm'),  pg_temp.id('test_user'),  'Test Firm',   'tester@fynhelp.example', true, false),
  (pg_temp.id('demo_firm'),  pg_temp.id('demo_user'),  'Demo Firm',   'demo@example.com',    false, true);
INSERT INTO public.ca_clients (ca_firm_id, client_name) VALUES
  (pg_temp.id('real_firm'), 'Real Client A'), (pg_temp.id('real_firm2'), 'Real Client B'), (pg_temp.id('test_firm'), 'Test Client');

CREATE FUNCTION pg_temp.as_user(_k text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', pg_temp.id(_k)::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END $$;

-- 1. A tester sees only the test firm's data; a real user never sees it.
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('test_user');
DO $$ BEGIN
  IF (SELECT count(*) FROM public.ca_clients) <> 1 OR (SELECT client_name FROM public.ca_clients) <> 'Test Client' THEN RAISE EXCEPTION 'FAIL: tester sees other firms'' clients'; END IF;
  IF (SELECT count(*) FROM public.ca_firms) <> 1 THEN RAISE EXCEPTION 'FAIL: tester sees other firms'; END IF;
  RAISE NOTICE 'ok - a tester sees only the test firm and its clients';
END $$;

-- 2. A tester cannot change or create rows in a real firm.
DO $$ DECLARE n int; BEGIN
  UPDATE public.ca_clients SET client_name = 'hacked' WHERE ca_firm_id = pg_temp.id('real_firm');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: tester updated a real client'; END IF;
  DELETE FROM public.ca_clients WHERE ca_firm_id = pg_temp.id('real_firm');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: tester deleted a real client'; END IF;
  BEGIN
    INSERT INTO public.ca_clients (ca_firm_id, client_name) VALUES (pg_temp.id('real_firm'), 'planted');
    RAISE EXCEPTION 'FAIL: tester inserted into a real firm';
  EXCEPTION WHEN insufficient_privilege THEN NULL; WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'ok - a tester cannot read, change, delete or add rows in a real firm';
END $$;

-- 3. A tester cannot un-flag the test firm or make a new test firm; a real user cannot flag their own firm.
DO $$ BEGIN
  BEGIN
    UPDATE public.ca_firms SET is_test = false WHERE id = pg_temp.id('test_firm');
    RAISE EXCEPTION 'FAIL: tester un-flagged the test firm';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'ok - a tester cannot turn the test firm into a real one';
END $$;
SELECT pg_temp.as_user('real_user');
DO $$ BEGIN
  IF (SELECT count(*) FROM public.ca_clients) <> 1 OR (SELECT client_name FROM public.ca_clients) <> 'Real Client A' THEN RAISE EXCEPTION 'FAIL: real user sees test or other data'; END IF;
  BEGIN
    UPDATE public.ca_firms SET is_test = true WHERE id = pg_temp.id('real_firm');
    RAISE EXCEPTION 'FAIL: a real firm flagged itself as test';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.ca_firms (user_id, firm_name, is_test) VALUES (pg_temp.id('real_user'), 'Sneaky', true);
    RAISE EXCEPTION 'FAIL: an ordinary user created a test firm';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'ok - a real user sees no test data and cannot create or set a test flag';
END $$;
RESET ROLE;
-- Back to the platform: no browser login is in effect any more.
SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', '', true);

-- 4. Test and real accounts can never share a person, even for the platform.
DO $$ BEGIN
  BEGIN
    INSERT INTO public.ca_firm_members (ca_firm_id, user_id, invited_email, role, status)
    VALUES (pg_temp.id('real_firm'), pg_temp.id('test_user'), 'tester@fynhelp.example', 'staff', 'active');
    RAISE EXCEPTION 'FAIL: a tester was added to a real firm';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.ca_firm_members (ca_firm_id, user_id, invited_email, role, status)
    VALUES (pg_temp.id('test_firm'), pg_temp.id('real_user'), 'owner@real.example', 'staff', 'active');
    RAISE EXCEPTION 'FAIL: a real user was added to the test firm';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE public.ca_firms SET is_test = true WHERE id = pg_temp.id('real_firm');
    -- real_user owns real_firm only, so flagging it is allowed on its own...
    UPDATE public.ca_firms SET is_test = false WHERE id = pg_temp.id('real_firm');
  END;
  INSERT INTO public.ca_firm_members (ca_firm_id, user_id, invited_email, role, status)
  VALUES (pg_temp.id('real_firm2'), pg_temp.id('real_user'), 'owner@real.example', 'staff', 'active');
  BEGIN
    -- ...but not once that person also belongs to another real firm.
    UPDATE public.ca_firms SET is_test = true WHERE id = pg_temp.id('real_firm');
    RAISE EXCEPTION 'FAIL: a firm shared with a real firm was turned into a test firm';
  EXCEPTION WHEN check_violation THEN NULL; END;
  -- a pending invite with no user yet is fine, and revoked memberships do not block
  INSERT INTO public.ca_firm_members (ca_firm_id, user_id, invited_email, role, status)
  VALUES (pg_temp.id('test_firm'), NULL, 'colleague@fynhelp.example', 'staff', 'pending');
  RAISE NOTICE 'ok - testers and real accounts can never share a person';
END $$;

-- 5. Reports and billing runs read production_firms: real firms only.
DO $$ BEGIN
  IF (SELECT count(*) FROM public.production_firms WHERE id = pg_temp.id('test_firm')) <> 0 THEN RAISE EXCEPTION 'FAIL: test firm in production_firms'; END IF;
  IF (SELECT count(*) FROM public.production_firms WHERE id = pg_temp.id('demo_firm')) <> 0 THEN RAISE EXCEPTION 'FAIL: demo firm in production_firms'; END IF;
  IF (SELECT count(*) FROM public.production_firms WHERE id IN (pg_temp.id('real_firm'), pg_temp.id('real_firm2'))) <> 2 THEN RAISE EXCEPTION 'FAIL: real firms missing from production_firms'; END IF;
  RAISE NOTICE 'ok - production_firms has the real firms and neither test nor demo ones';
END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  PERFORM 1 FROM public.production_firms;
  RAISE EXCEPTION 'FAIL: the browser can read production_firms';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok - production_firms is not readable from the browser';
END $$;
RESET ROLE;

ROLLBACK;
