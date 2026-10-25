-- Upload links check. One transaction, ROLLS BACK. Needs 20261029090000_upload_links.sql applied.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/test_upload_links.sql
BEGIN;
CREATE FUNCTION pg_temp.expect(_name text, _ok boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF NOT _ok THEN RAISE EXCEPTION 'FAIL - %', _name; END IF; RAISE NOTICE 'ok - %', _name; END $$;

INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-0000000000a1', 'u@x');
INSERT INTO public.ca_firms (id, user_id, firm_name) VALUES ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1', 'F');
INSERT INTO public.ca_upload_links (id, token_hash, ca_firm_id, expires_at, max_files)
VALUES ('00000000-0000-0000-0000-0000000000c1', 'h1', '00000000-0000-0000-0000-0000000000f1', now() + interval '1 day', 2),
       ('00000000-0000-0000-0000-0000000000c2', 'h2', '00000000-0000-0000-0000-0000000000f1', now() - interval '1 day', 5),
       ('00000000-0000-0000-0000-0000000000c3', 'h3', '00000000-0000-0000-0000-0000000000f1', now() + interval '1 day', 5);
UPDATE public.ca_upload_links SET revoked_at = now() WHERE id = '00000000-0000-0000-0000-0000000000c3';

SELECT pg_temp.expect('first file is taken', public.ca_upload_link_take('00000000-0000-0000-0000-0000000000c1'));
SELECT pg_temp.expect('second file is taken', public.ca_upload_link_take('00000000-0000-0000-0000-0000000000c1'));
SELECT pg_temp.expect('third is refused at the limit', NOT public.ca_upload_link_take('00000000-0000-0000-0000-0000000000c1'));
SELECT public.ca_upload_link_give_back('00000000-0000-0000-0000-0000000000c1');
SELECT pg_temp.expect('a slot returned can be used again', public.ca_upload_link_take('00000000-0000-0000-0000-0000000000c1'));
SELECT pg_temp.expect('count never goes below zero', (SELECT files_uploaded FROM public.ca_upload_links WHERE id = '00000000-0000-0000-0000-0000000000c1') = 2);
SELECT pg_temp.expect('expired link takes nothing', NOT public.ca_upload_link_take('00000000-0000-0000-0000-0000000000c2'));
SELECT pg_temp.expect('revoked link takes nothing', NOT public.ca_upload_link_take('00000000-0000-0000-0000-0000000000c3'));

SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM count(*) FROM public.ca_upload_links; RAISE EXCEPTION 'FAIL - browser could read links';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok - browser cannot read links'; END; END $$;
DO $$ BEGIN
  BEGIN PERFORM public.ca_upload_link_take('00000000-0000-0000-0000-0000000000c1'); RAISE EXCEPTION 'FAIL - browser could take a slot';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok - browser cannot call the link functions'; END; END $$;
ROLLBACK;
