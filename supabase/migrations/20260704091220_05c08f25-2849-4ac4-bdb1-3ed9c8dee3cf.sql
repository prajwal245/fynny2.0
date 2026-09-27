-- Prevent tenant users from reading OAuth secrets on public.integrations.
-- SELECT/UPDATE on access_token and refresh_token is limited to service_role;
-- edge functions already use the service role for token exchange & refresh.
REVOKE SELECT (access_token, refresh_token), UPDATE (access_token, refresh_token), INSERT (access_token, refresh_token)
  ON public.integrations FROM authenticated;
REVOKE SELECT (access_token, refresh_token), UPDATE (access_token, refresh_token), INSERT (access_token, refresh_token)
  ON public.integrations FROM anon;

-- Ensure service_role retains full access.
GRANT ALL ON public.integrations TO service_role;

-- Re-grant safe columns to authenticated so the app UI keeps working.
GRANT SELECT (id, organization_id, provider, status, metadata, expires_at, created_at, updated_at)
  ON public.integrations TO authenticated;
GRANT INSERT (id, organization_id, provider, status, metadata, expires_at, created_at, updated_at)
  ON public.integrations TO authenticated;
GRANT UPDATE (organization_id, provider, status, metadata, expires_at, updated_at)
  ON public.integrations TO authenticated;
GRANT DELETE ON public.integrations TO authenticated;