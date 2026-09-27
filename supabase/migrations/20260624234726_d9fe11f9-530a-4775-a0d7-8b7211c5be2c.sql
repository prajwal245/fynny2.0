
-- 1) customers PII: revoke anon read on demo policy; restrict to authenticated only
DROP POLICY IF EXISTS "customers demo public read" ON public.customers;
CREATE POLICY "customers demo authenticated read"
  ON public.customers FOR SELECT TO authenticated
  USING (is_demo = true);

-- 2) integration_tokens: revoke token columns from authenticated/anon at column level.
-- The senior-admin SELECT policy stays, but PostgREST column grants will deny anyone
-- (including senior admins via Data API) from reading access_token / refresh_token.
-- Service role retains full access via GRANT ALL TO service_role.
REVOKE SELECT ON public.integration_tokens FROM authenticated;
REVOKE SELECT ON public.integration_tokens FROM anon;
GRANT SELECT (id, platform, status, expires_at, config, created_at, updated_at)
  ON public.integration_tokens TO authenticated;
GRANT ALL ON public.integration_tokens TO service_role;

-- 3) risk_register: add tenant-scoped write policies (INSERT/UPDATE/DELETE)
DROP POLICY IF EXISTS "rr tenant write insert" ON public.risk_register;
DROP POLICY IF EXISTS "rr tenant write update" ON public.risk_register;
DROP POLICY IF EXISTS "rr tenant write delete" ON public.risk_register;

CREATE POLICY "rr tenant write insert"
  ON public.risk_register FOR INSERT TO authenticated
  WITH CHECK (business_id = get_user_business_id());

CREATE POLICY "rr tenant write update"
  ON public.risk_register FOR UPDATE TO authenticated
  USING (business_id = get_user_business_id())
  WITH CHECK (business_id = get_user_business_id());

CREATE POLICY "rr tenant write delete"
  ON public.risk_register FOR DELETE TO authenticated
  USING (business_id = get_user_business_id());

-- 4) whatsapp_messages: intentionally admin-only (no business_id column to scope by).
-- Document this so future scans don't re-flag it as missing tenant policy.
COMMENT ON TABLE public.whatsapp_messages IS
  'Admin-only broadcast messages. No tenant policy by design — table has no business_id; all writes/reads go through the admin console.';
