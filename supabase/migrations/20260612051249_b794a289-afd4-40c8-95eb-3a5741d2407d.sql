
-- 1. Revoke column-level SELECT on OAuth token columns from authenticated.
REVOKE SELECT (access_token, refresh_token) ON public.integrations FROM authenticated, anon;
REVOKE SELECT (access_token, refresh_token) ON public.integration_tokens FROM authenticated, anon;

-- 2. Stricter senior-admin helper.
CREATE OR REPLACE FUNCTION public.is_senior_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin'::app_role, 'super_admin'::app_role, 'ops_admin'::app_role)
  )
$$;
REVOKE EXECUTE ON FUNCTION public.is_senior_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_senior_admin() TO authenticated;

-- 3. Re-scope sensitive policies to senior admins only.
DROP POLICY IF EXISTS "Admins can read audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admins can read audit logs" ON public.admin_audit_logs FOR SELECT TO authenticated USING (is_senior_admin());

DROP POLICY IF EXISTS "Admins read AI logs" ON public.ai_usage_logs;
CREATE POLICY "Admins read AI logs" ON public.ai_usage_logs FOR SELECT TO authenticated USING (is_senior_admin());

DROP POLICY IF EXISTS "Admins manage whatsapp messages" ON public.whatsapp_messages;
CREATE POLICY "Admins manage whatsapp messages" ON public.whatsapp_messages FOR ALL TO authenticated USING (is_senior_admin()) WITH CHECK (is_senior_admin());

DROP POLICY IF EXISTS "Admins manage subscriptions" ON public.subscriptions;
CREATE POLICY "Admins manage subscriptions" ON public.subscriptions FOR ALL TO authenticated USING (is_senior_admin()) WITH CHECK (is_senior_admin());

DROP POLICY IF EXISTS "Admins manage sub history" ON public.subscription_history;
CREATE POLICY "Admins manage sub history" ON public.subscription_history FOR ALL TO authenticated USING (is_senior_admin()) WITH CHECK (is_senior_admin());

DROP POLICY IF EXISTS "Admins manage social posts" ON public.social_posts;
CREATE POLICY "Admins manage social posts" ON public.social_posts FOR ALL TO authenticated USING (is_senior_admin()) WITH CHECK (is_senior_admin());

DROP POLICY IF EXISTS "Admins read system health" ON public.system_health_checks;
CREATE POLICY "Admins read system health" ON public.system_health_checks FOR SELECT TO authenticated USING (is_senior_admin());

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (is_senior_admin());

DROP POLICY IF EXISTS "Admins can view all businesses" ON public.businesses;
CREATE POLICY "Admins can view all businesses" ON public.businesses FOR SELECT TO authenticated USING (is_senior_admin());

DROP POLICY IF EXISTS "Admins read revenue cache" ON public.revenue_analytics_cache;
CREATE POLICY "Admins read revenue cache" ON public.revenue_analytics_cache FOR SELECT TO authenticated USING (is_senior_admin());

DROP POLICY IF EXISTS "Admins write revenue cache" ON public.revenue_analytics_cache;
CREATE POLICY "Admins write revenue cache" ON public.revenue_analytics_cache FOR ALL TO authenticated USING (is_senior_admin()) WITH CHECK (is_senior_admin());

DROP POLICY IF EXISTS "Admins can read demo insights" ON public.demo_insights;
CREATE POLICY "Admins can read demo insights" ON public.demo_insights FOR SELECT TO authenticated USING (is_senior_admin());

DROP POLICY IF EXISTS "Admins can delete demo insights" ON public.demo_insights;
CREATE POLICY "Admins can delete demo insights" ON public.demo_insights FOR DELETE TO authenticated USING (is_senior_admin());
