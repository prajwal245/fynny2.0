DROP POLICY IF EXISTS "Demo transactions are publicly readable" ON public.demo_transactions;
CREATE POLICY "Authenticated users can read demo transactions"
  ON public.demo_transactions
  FOR SELECT
  TO authenticated
  USING (true);
REVOKE SELECT ON public.demo_transactions FROM anon;
GRANT SELECT ON public.demo_transactions TO authenticated;