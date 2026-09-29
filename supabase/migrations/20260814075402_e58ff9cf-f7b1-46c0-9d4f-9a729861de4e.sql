CREATE TABLE public.resource_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id text NOT NULL,
  resource_title text,
  file_path text,
  user_id uuid,
  outcome text NOT NULL DEFAULT 'success',
  ip_address text,
  user_agent text,
  referer text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_resource_access_logs_resource ON public.resource_access_logs (resource_id, created_at DESC);
CREATE INDEX idx_resource_access_logs_created ON public.resource_access_logs (created_at DESC);

GRANT SELECT ON public.resource_access_logs TO authenticated;
GRANT ALL ON public.resource_access_logs TO service_role;

ALTER TABLE public.resource_access_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin team can read resource access logs"
ON public.resource_access_logs FOR SELECT TO authenticated
USING (public.is_admin_user());

DROP POLICY IF EXISTS "Senior admins insert own audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admin team inserts own audit logs"
ON public.admin_audit_logs FOR INSERT TO authenticated
WITH CHECK (public.is_admin_user() AND admin_user_id = auth.uid());