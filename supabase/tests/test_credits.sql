-- Credits check. Plain SQL, one transaction, ROLLS BACK. Needs 20261028090000_credits.sql applied.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/test_credits.sql
BEGIN;
CREATE TEMP TABLE _ids (k text PRIMARY KEY, v uuid);
GRANT ALL ON _ids TO PUBLIC;
INSERT INTO _ids SELECT k, gen_random_uuid() FROM unnest(ARRAY['u1','u2','f1','f2']) k;
CREATE FUNCTION pg_temp.id(_k text) RETURNS uuid LANGUAGE sql AS $$ SELECT v FROM _ids WHERE k = _k $$;
INSERT INTO auth.users (id, email) VALUES (pg_temp.id('u1'),'a@x'),(pg_temp.id('u2'),'b@x');
INSERT INTO public.ca_firms (id,user_id,firm_name) VALUES (pg_temp.id('f1'),pg_temp.id('u1'),'F1'),(pg_temp.id('f2'),pg_temp.id('u2'),'F2');

CREATE FUNCTION pg_temp.expect(_name text, _ok boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF NOT _ok THEN RAISE EXCEPTION 'FAIL - %', _name; END IF; RAISE NOTICE 'ok - %', _name; END $$;

-- grants are idempotent
SELECT pg_temp.expect('first plan grant adds 500', public.ca_credits_grant(pg_temp.id('f1'),'plan',500,'2026-10',NULL));
SELECT pg_temp.expect('same month again adds nothing', NOT public.ca_credits_grant(pg_temp.id('f1'),'plan',500,'2026-10',NULL));
SELECT pg_temp.expect('balance is 500', public.ca_credits_balance(pg_temp.id('f1')) = 500);
SELECT pg_temp.expect('topup payment adds once', public.ca_credits_grant(pg_temp.id('f1'),'topup',500,NULL,'pay_1'));
SELECT pg_temp.expect('same payment again adds nothing', NOT public.ca_credits_grant(pg_temp.id('f1'),'topup',500,NULL,'pay_1'));
SELECT pg_temp.expect('balance is 1000', public.ca_credits_balance(pg_temp.id('f1')) = 1000);

-- spending takes the lot that expires first, and is idempotent per ref
UPDATE public.ca_credit_lots SET expires_at = now() + interval '1 month' WHERE kind='plan' AND ca_firm_id = pg_temp.id('f1');
SELECT pg_temp.expect('spend 3 leaves 997', public.ca_credits_spend(pg_temp.id('f1'),3,'c1') = 997);
SELECT pg_temp.expect('earliest-expiring lot used first', (SELECT remaining FROM public.ca_credit_lots WHERE kind='plan' AND ca_firm_id=pg_temp.id('f1')) = 497);
SELECT pg_temp.expect('same ref again spends nothing', public.ca_credits_spend(pg_temp.id('f1'),3,'c1') = 997);

-- refund returns to the same lot and is safe twice
SELECT pg_temp.expect('refund returns 3', public.ca_credits_refund(pg_temp.id('f1'),'c1') = 3);
SELECT pg_temp.expect('refund twice returns 0', public.ca_credits_refund(pg_temp.id('f1'),'c1') = 0);
SELECT pg_temp.expect('balance back to 1000', public.ca_credits_balance(pg_temp.id('f1')) = 1000);

-- a spend across two lots, then not enough
SELECT pg_temp.expect('spend across lots', public.ca_credits_spend(pg_temp.id('f1'),600,'c2') = 400);
SELECT pg_temp.expect('plan lot empty, topup lot used', (SELECT remaining FROM public.ca_credit_lots WHERE kind='plan' AND ca_firm_id=pg_temp.id('f1')) = 0
  AND (SELECT remaining FROM public.ca_credit_lots WHERE kind='topup' AND ca_firm_id=pg_temp.id('f1')) = 400);
SELECT pg_temp.expect('too much is refused and spends nothing', public.ca_credits_spend(pg_temp.id('f1'),401,'c3') = -1 AND public.ca_credits_balance(pg_temp.id('f1')) = 400);
SELECT pg_temp.expect('refund of a refused spend is a no-op', public.ca_credits_refund(pg_temp.id('f1'),'c3') = 0);

-- expired lots do not count
UPDATE public.ca_credit_lots SET expires_at = now() - interval '1 day' WHERE kind='topup' AND ca_firm_id=pg_temp.id('f1');
SELECT pg_temp.expect('expired credits are gone', public.ca_credits_balance(pg_temp.id('f1')) = 0 AND public.ca_credits_spend(pg_temp.id('f1'),1,'c4') = -1);

-- firms are separate
SELECT pg_temp.expect('other firm unaffected', public.ca_credits_balance(pg_temp.id('f2')) = 0);

-- row security: a firm reads only its own lots; the browser cannot write or call the functions
SELECT public.ca_credits_grant(pg_temp.id('f2'),'trial',25,'trial',NULL);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', pg_temp.id('u1')::text, true), set_config('request.jwt.claim.role','authenticated',true);
SELECT pg_temp.expect('firm 1 sees only its lots', (SELECT count(*) FROM public.ca_credit_lots) = 2 AND NOT EXISTS (SELECT 1 FROM public.ca_credit_lots WHERE ca_firm_id = pg_temp.id('f2')));
DO $$ BEGIN
  BEGIN INSERT INTO public.ca_credit_lots (ca_firm_id,kind,credits,remaining,expires_at) VALUES ((SELECT id FROM public.ca_firms LIMIT 1),'bonus',9,9,now()+interval '1 day'); RAISE EXCEPTION 'FAIL - browser could insert credits';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok - browser cannot add credits'; END; END $$;
DO $$ BEGIN
  BEGIN PERFORM public.ca_credits_grant(pg_temp.id('f1'),'bonus',9,'x',NULL); RAISE EXCEPTION 'FAIL - browser could call grant';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok - browser cannot call the credit functions'; END; END $$;
ROLLBACK;
