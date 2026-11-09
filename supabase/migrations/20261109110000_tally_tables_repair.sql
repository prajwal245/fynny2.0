-- Repair for the Tally connector tables on a database where they were created from an older or different definition
-- (symptom: "Could not find the 'company_name' column of 'ca_tally_companies' in the schema cache").
-- Adds every column the app expects, copies an older "name" column across, makes the check-in upsert possible, and asks the API
-- to reload its schema. Safe to run more than once. Changes no existing row except filling company_name.

DO $$
BEGIN
  IF to_regclass('public.ca_tally_connectors') IS NULL OR to_regclass('public.ca_tally_companies') IS NULL THEN
    RAISE NOTICE 'Tally connector tables are missing: run the connector part of apply_tally_posting.sql first.';
    RETURN;
  END IF;
END $$;

-- Connectors
ALTER TABLE IF EXISTS public.ca_tally_connectors ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE IF EXISTS public.ca_tally_connectors ADD COLUMN IF NOT EXISTS token_hash text;
ALTER TABLE IF EXISTS public.ca_tally_connectors ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE IF EXISTS public.ca_tally_connectors ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE IF EXISTS public.ca_tally_connectors ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS public.ca_tally_connectors ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
ALTER TABLE IF EXISTS public.ca_tally_connectors ADD COLUMN IF NOT EXISTS agent_version text;
ALTER TABLE IF EXISTS public.ca_tally_connectors ADD COLUMN IF NOT EXISTS host_name text;
ALTER TABLE IF EXISTS public.ca_tally_connectors ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE IF EXISTS public.ca_tally_connectors ADD COLUMN IF NOT EXISTS sync_requested_at timestamptz;

-- Companies
ALTER TABLE IF EXISTS public.ca_tally_companies ADD COLUMN IF NOT EXISTS ca_firm_id uuid;
ALTER TABLE IF EXISTS public.ca_tally_companies ADD COLUMN IF NOT EXISTS connector_id uuid;
ALTER TABLE IF EXISTS public.ca_tally_companies ADD COLUMN IF NOT EXISTS company_name text;
ALTER TABLE IF EXISTS public.ca_tally_companies ADD COLUMN IF NOT EXISTS business_id uuid;
ALTER TABLE IF EXISTS public.ca_tally_companies ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;
ALTER TABLE IF EXISTS public.ca_tally_companies ADD COLUMN IF NOT EXISTS last_sync_note text;
ALTER TABLE IF EXISTS public.ca_tally_companies ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- An older column called "name" or "tally_company" holds what company_name should: copy it across.
DO $$
DECLARE c text;
BEGIN
  IF to_regclass('public.ca_tally_companies') IS NULL THEN RETURN; END IF;
  FOREACH c IN ARRAY ARRAY['name', 'tally_company', 'company'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ca_tally_companies' AND column_name = c) THEN
      EXECUTE format('UPDATE public.ca_tally_companies SET company_name = %I WHERE company_name IS NULL', c);
    END IF;
  END LOOP;
END $$;

-- The check-in saves companies with ON CONFLICT (connector_id, company_name): that needs this unique index.
DO $$
BEGIN
  IF to_regclass('public.ca_tally_companies') IS NOT NULL THEN
    -- Remove exact duplicates first, keeping the oldest, so the index can be built.
    DELETE FROM public.ca_tally_companies a USING public.ca_tally_companies b
      WHERE a.connector_id = b.connector_id AND a.company_name = b.company_name AND a.company_name IS NOT NULL
        AND (a.created_at, a.id) > (b.created_at, b.id);
    CREATE UNIQUE INDEX IF NOT EXISTS ca_tally_companies_connector_name_uidx ON public.ca_tally_companies (connector_id, company_name);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
