DROP POLICY IF EXISTS "Authenticated read canonical demo transactions" ON public.demo_transactions;
REVOKE SELECT ON public.demo_transactions FROM authenticated, anon;
GRANT ALL ON public.demo_transactions TO service_role;
CREATE POLICY "Service role only reads demo transactions"
  ON public.demo_transactions FOR SELECT
  TO service_role
  USING (true);