
-- Restrict OAuth token columns to service_role only via column-level GRANTs.
-- RLS still scopes rows; this layer hides token bytes from any authenticated session.

-- integrations table
REVOKE ALL ON TABLE public.integrations FROM authenticated;
GRANT SELECT (id, organization_id, provider, status, metadata, expires_at, created_at, updated_at)
  ON public.integrations TO authenticated;
GRANT INSERT (id, organization_id, provider, status, metadata, expires_at, access_token, refresh_token, created_at, updated_at)
  ON public.integrations TO authenticated;
GRANT UPDATE (organization_id, provider, status, metadata, expires_at, updated_at)
  ON public.integrations TO authenticated;
GRANT DELETE ON public.integrations TO authenticated;
GRANT ALL ON public.integrations TO service_role;

-- Drop the broad admin SELECT/ALL policies that would otherwise let admins read tokens
DROP POLICY IF EXISTS "Admins can manage integrations" ON public.integrations;
DROP POLICY IF EXISTS "Admins can view integrations" ON public.integrations;

-- integration_tokens table — tokens never visible to any authenticated role
REVOKE ALL ON TABLE public.integration_tokens FROM authenticated;
GRANT SELECT (id, platform, status, expires_at, config, created_at, updated_at)
  ON public.integration_tokens TO authenticated;
GRANT ALL ON public.integration_tokens TO service_role;

DROP POLICY IF EXISTS "Senior admins manage integration tokens" ON public.integration_tokens;
-- Replace with a policy that still allows row visibility checks for non-token columns to senior admins
CREATE POLICY "Senior admins read integration tokens metadata"
  ON public.integration_tokens FOR SELECT TO authenticated
  USING (is_senior_admin());
