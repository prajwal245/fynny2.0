-- Prevent tenant clients from reading OAuth tokens from public.integrations.
-- Tokens (access_token, refresh_token) stay readable only by service_role
-- (used by edge functions). All other columns remain readable to authenticated
-- under existing RLS policies, which the UI already relies on.

REVOKE SELECT ON public.integrations FROM authenticated;
REVOKE SELECT ON public.integrations FROM anon;

GRANT SELECT (id, organization_id, provider, status, metadata, expires_at, created_at, updated_at)
  ON public.integrations TO authenticated;

-- INSERT/UPDATE/DELETE privileges and RLS policies remain unchanged.
-- service_role retains ALL via prior grants for edge-function token use.