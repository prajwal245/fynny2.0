
-- 1. demo_transactions: restrict SELECT to canonical demo dataset only
DROP POLICY IF EXISTS "Authenticated users can read demo transactions" ON public.demo_transactions;

CREATE POLICY "Authenticated read canonical demo transactions"
ON public.demo_transactions
FOR SELECT
TO authenticated
USING (organization_id = 'test-client-demo');

-- 2. integrations: assert column-level REVOKE on token columns for non-service roles
REVOKE SELECT (access_token, refresh_token) ON public.integrations FROM PUBLIC;
REVOKE SELECT (access_token, refresh_token) ON public.integrations FROM anon;
REVOKE SELECT (access_token, refresh_token) ON public.integrations FROM authenticated;
REVOKE UPDATE (access_token, refresh_token) ON public.integrations FROM PUBLIC;
REVOKE UPDATE (access_token, refresh_token) ON public.integrations FROM anon;
REVOKE UPDATE (access_token, refresh_token) ON public.integrations FROM authenticated;
