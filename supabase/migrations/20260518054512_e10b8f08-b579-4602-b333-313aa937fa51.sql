ALTER TABLE public.demo_insights
  DROP CONSTRAINT IF EXISTS demo_insights_org_id_fkey;

ALTER TABLE public.demo_insights
  ALTER COLUMN org_id TYPE text USING org_id::text;

DROP INDEX IF EXISTS public.idx_demo_insights_org;
CREATE INDEX idx_demo_insights_org ON public.demo_insights(org_id);

COMMENT ON COLUMN public.demo_insights.org_id IS 'Organization identifier (text) matching demo_transactions.organization_id';