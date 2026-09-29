
-- 1) Lock down profile.role updates via WITH CHECK (defense in depth on top of column-level revoke)
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND (role IS NULL OR role = 'owner')
  );

-- 2) Tighten callback_requests anonymous insert: require phone, cap lengths
DROP POLICY IF EXISTS "Anyone can submit a callback request" ON public.callback_requests;
CREATE POLICY "Anyone can submit a callback request"
  ON public.callback_requests
  FOR INSERT
  WITH CHECK (
    (
      (auth.uid() IS NULL AND user_id IS NULL)
      OR (auth.uid() IS NOT NULL AND user_id = auth.uid())
    )
    AND phone IS NOT NULL
    AND length(btrim(phone)) BETWEEN 7 AND 20
    AND (name IS NULL OR length(name) <= 100)
  );

-- 3) Restrict Realtime channel subscriptions to the subscriber's tenant scope.
-- Topics must be one of:
--   business:<uuid>   -> matches caller's business_id
--   ca_firm:<uuid>    -> matches caller's ca_firm_id
--   user:<uuid>       -> matches caller's auth.uid()
-- realtime.messages is owned by a system role on hosted Supabase (RLS is on by
-- default there), so skip rather than fail where we are not allowed to change it.
DO $realtime$
BEGIN
  ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "Tenant-scoped realtime subscriptions" ON realtime.messages;
  EXECUTE $pol$
CREATE POLICY "Tenant-scoped realtime subscriptions"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    (
      realtime.topic() = 'business:' || COALESCE(public.get_user_business_id()::text, '')
      AND public.get_user_business_id() IS NOT NULL
    )
    OR (
      realtime.topic() = 'ca_firm:' || COALESCE(public.get_user_ca_firm_id()::text, '')
      AND public.get_user_ca_firm_id() IS NOT NULL
    )
    OR (
      realtime.topic() = 'user:' || auth.uid()::text
      AND auth.uid() IS NOT NULL
    )
  )
  $pol$;
EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
  RAISE NOTICE 'Skipping realtime.messages policy: %', SQLERRM;
END
$realtime$;
