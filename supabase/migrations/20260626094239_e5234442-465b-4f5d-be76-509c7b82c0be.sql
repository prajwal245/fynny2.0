
-- Scope all unscoped demo-read policies to DEMO_BIZ to prevent cross-tenant exposure if a stray is_demo=true row gets inserted under another business_id.
DO $$
DECLARE
  demo_biz CONSTANT uuid := '4b30494f-4c30-4a74-a6bb-6bf56493a97d';
  r record;
  new_qual text := format('(is_demo = true AND business_id = %L)', '4b30494f-4c30-4a74-a6bb-6bf56493a97d');
BEGIN
  FOR r IN
    SELECT tablename, policyname, cmd
    FROM pg_policies
    WHERE schemaname='public'
      AND qual = '(is_demo = true)'
      AND 'authenticated' = ANY(roles)
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
    IF r.cmd = 'SELECT' THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (is_demo = true AND business_id = %L)',
        r.policyname, r.tablename, demo_biz
      );
    ELSIF r.cmd = 'UPDATE' THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (is_demo = true AND business_id = %L) WITH CHECK (is_demo = true AND business_id = %L)',
        r.policyname, r.tablename, demo_biz, demo_biz
      );
    END IF;
  END LOOP;
END $$;

-- hsn_master has no business_id (HSN code reference data) — handle separately as a no-op note;
-- the loop above would error if business_id is absent. Re-create hsn_master's policy if it got dropped without a recreate.
-- Check & restore if missing:
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='hsn_master' AND column_name='business_id') THEN
    -- Restore an unscoped policy since HSN master is reference data shared across businesses.
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='hsn_master' AND policyname='hsn demo read') THEN
      EXECUTE 'CREATE POLICY "hsn demo read" ON public.hsn_master FOR SELECT TO authenticated USING (is_demo = true)';
    END IF;
  END IF;
END $$;

-- Allow users to read their own subscription history (scoped via parent subscription's business_id).
CREATE POLICY "Users read own sub history"
ON public.subscription_history
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.id = subscription_history.subscription_id
      AND s.business_id = public.get_user_business_id()
  )
);
