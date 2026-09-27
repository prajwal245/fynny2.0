
-- 1. demo_insights: drop public SELECT, restrict to admins; expose capability-token RPC
DROP POLICY IF EXISTS "Anyone can read demo insights" ON public.demo_insights;

CREATE POLICY "Admins can read demo insights"
  ON public.demo_insights
  FOR SELECT
  TO authenticated
  USING (public.is_admin_user());

CREATE OR REPLACE FUNCTION public.get_latest_demo_insight(p_org_id text)
RETURNS TABLE(id uuid, org_id text, data jsonb, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, org_id, data, created_at
  FROM public.demo_insights
  WHERE org_id = p_org_id
    AND p_org_id IS NOT NULL
    AND length(p_org_id) BETWEEN 1 AND 128
  ORDER BY created_at DESC
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.get_latest_demo_insight(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_latest_demo_insight(text) TO anon, authenticated;

-- 2. demo_organizations: restrict to admin / super_admin only (was is_admin_user)
DROP POLICY IF EXISTS "Admins can view demo organizations" ON public.demo_organizations;
DROP POLICY IF EXISTS "Admins can update demo organizations" ON public.demo_organizations;
DROP POLICY IF EXISTS "Admins can delete demo organizations" ON public.demo_organizations;

CREATE POLICY "Senior admins view demo organizations"
  ON public.demo_organizations
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'super_admin'::app_role));

CREATE POLICY "Senior admins update demo organizations"
  ON public.demo_organizations
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'super_admin'::app_role));

CREATE POLICY "Senior admins delete demo organizations"
  ON public.demo_organizations
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'super_admin'::app_role));

-- 3. integration_tokens: restrict to admin / super_admin only
DROP POLICY IF EXISTS "Admins manage integration tokens" ON public.integration_tokens;

CREATE POLICY "Senior admins manage integration tokens"
  ON public.integration_tokens
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'super_admin'::app_role));

-- 4. integrations: revoke column-level access to OAuth tokens from app clients.
-- Edge functions use the service role and are unaffected.
REVOKE SELECT (access_token, refresh_token) ON public.integrations FROM anon, authenticated;
