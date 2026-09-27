
-- 1) demo_transactions: replace permissive ALL policy with read-only public + service_role writes
DROP POLICY IF EXISTS "Allow all operations for demo" ON public.demo_transactions;

CREATE POLICY "Demo transactions are publicly readable"
  ON public.demo_transactions FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Service role manages demo transactions"
  ON public.demo_transactions FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

REVOKE INSERT, UPDATE, DELETE ON public.demo_transactions FROM anon, authenticated;

-- 2) nidhi_conversations: restrict SELECT explicitly to authenticated users
DROP POLICY IF EXISTS "Business access" ON public.nidhi_conversations;

CREATE POLICY "Business access"
  ON public.nidhi_conversations FOR SELECT
  TO authenticated
  USING (business_id = public.get_user_business_id());

-- 3) early_access_requests: tighten INSERT policy with explicit validation in addition to existing CHECK constraints
DROP POLICY IF EXISTS "Anyone can request early access" ON public.early_access_requests;

CREATE POLICY "Anyone can request early access"
  ON public.early_access_requests FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    ((user_id IS NULL) OR (user_id = auth.uid()))
    AND email IS NOT NULL
    AND length(email) BETWEEN 3 AND 320
    AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    AND requested_module IS NOT NULL
    AND length(requested_module) BETWEEN 1 AND 120
  );
