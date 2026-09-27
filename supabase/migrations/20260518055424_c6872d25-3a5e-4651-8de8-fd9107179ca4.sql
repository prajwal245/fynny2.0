ALTER TABLE public.demo_organizations
  ADD COLUMN IF NOT EXISTS demo_org_id text,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.demo_organizations
SET demo_org_id = 'org_legacy_' || replace(id::text, '-', '')
WHERE demo_org_id IS NULL;

ALTER TABLE public.demo_organizations
  ALTER COLUMN demo_org_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_demo_organizations_demo_org_id
  ON public.demo_organizations(demo_org_id);

COMMENT ON COLUMN public.demo_organizations.demo_org_id IS
  'Stable text identifier used by demo_transactions.organization_id and demo_insights.org_id';