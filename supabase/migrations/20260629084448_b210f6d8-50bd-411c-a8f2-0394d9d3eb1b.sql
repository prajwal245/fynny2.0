
-- Finding 1
REVOKE SELECT (access_token, refresh_token) ON public.integrations FROM authenticated;
REVOKE SELECT (access_token, refresh_token) ON public.integrations FROM anon;
REVOKE UPDATE (access_token, refresh_token) ON public.integrations FROM authenticated;
REVOKE UPDATE (access_token, refresh_token) ON public.integrations FROM anon;
REVOKE INSERT (access_token, refresh_token) ON public.integrations FROM authenticated;
REVOKE INSERT (access_token, refresh_token) ON public.integrations FROM anon;

-- Finding 2
DROP POLICY IF EXISTS "Authenticated users can read demo transactions" ON public.demo_transactions;
CREATE POLICY "Authenticated users can read demo transactions"
  ON public.demo_transactions FOR SELECT
  TO authenticated
  USING (organization_id IN (SELECT id::text FROM public.demo_organizations));

-- Finding 3
ALTER TABLE public.generated_reports
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

UPDATE public.generated_reports
  SET is_demo = true
  WHERE business_id = '4b30494f-4c30-4a74-a6bb-6bf56493a97d'::uuid
    AND is_demo = false;

DROP POLICY IF EXISTS "Demo reports readable by authenticated" ON public.generated_reports;
CREATE POLICY "Demo reports readable by authenticated"
  ON public.generated_reports FOR SELECT
  TO authenticated
  USING (
    business_id = '4b30494f-4c30-4a74-a6bb-6bf56493a97d'::uuid
    AND is_demo = true
  );
