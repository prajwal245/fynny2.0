-- Second Tally tables repair, for a database whose tables came from an older definition.
-- The first repair added every missing column, but a column the code does not know (an old "name", "tally_company", ...)
-- may still be NOT NULL with no default, and then every save from the connector fails with
--   null value in column "..." violates not-null constraint
-- Here every column the code does not write is made nullable, ids get their default, the API role gets its grants,
-- and the API reloads its schema. Safe to run more than once. Deletes nothing and changes no existing value.

DO $$
DECLARE
  spec constant jsonb := jsonb_build_object(
    'ca_tally_connectors', jsonb_build_array('id','ca_firm_id','name','token_hash','is_active','created_by','created_at','last_seen_at','agent_version','host_name','last_error','sync_requested_at'),
    'ca_tally_companies',  jsonb_build_array('id','ca_firm_id','connector_id','company_name','business_id','last_synced_at','last_sync_note','created_at'),
    'ca_tally_ledgers',    jsonb_build_array('id','ca_firm_id','company_id','name','parent','synced_at'),
    'ca_tally_postings',   jsonb_build_array('id','ca_firm_id','business_id','company_id','txn_id','line_key','direction','amount','txn_date','bank_ledger','party_ledger','narration','reference','status','attempts','claimed_at','last_error','tally_reply','approved_by','approved_at','posted_at','created_at','updated_at')
  );
  t text;
  r record;
BEGIN
  FOR t IN SELECT jsonb_object_keys(spec) LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'table % is missing: run the Tally migrations first', t;
      CONTINUE;
    END IF;
    -- Columns the code never writes must not block an insert.
    FOR r IN
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND is_nullable = 'NO' AND column_default IS NULL
        AND NOT (spec -> t) ? column_name
    LOOP
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I DROP NOT NULL', t, r.column_name);
      RAISE NOTICE 'made %.% nullable', t, r.column_name;
    END LOOP;
    -- A table made by hand may have an id with no default.
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'id' AND column_default IS NULL AND data_type = 'uuid') THEN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN id SET DEFAULT gen_random_uuid()', t);
    END IF;
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
