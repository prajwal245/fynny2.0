-- ============ ROLE MODEL ============
CREATE TABLE IF NOT EXISTS public.ca_role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL,
  permission text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, permission)
);
GRANT SELECT ON public.ca_role_permissions TO authenticated;
GRANT ALL ON public.ca_role_permissions TO service_role;
ALTER TABLE public.ca_role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated can read role permissions"
  ON public.ca_role_permissions FOR SELECT TO authenticated USING (true);

INSERT INTO public.ca_role_permissions (role, permission) VALUES
  ('partner','view_all'),('partner','manage_users'),('partner','approve'),('partner','sign_off'),
  ('partner','process'),('partner','upload'),('partner','manage_clients'),('partner','manage_billing'),
  ('manager','view_all'),('manager','manage_users'),('manager','approve'),('manager','process'),
  ('manager','upload'),('manager','manage_clients'),
  ('senior','view_all'),('senior','approve'),('senior','process'),('senior','upload'),
  ('junior','process'),('junior','upload'),
  ('client','upload')
ON CONFLICT (role, permission) DO NOTHING;

-- Normalise legacy member roles onto the blueprint set
UPDATE public.ca_firm_members SET role = 'partner' WHERE role IN ('admin','owner','partner');
UPDATE public.ca_firm_members SET role = 'senior' WHERE role NOT IN ('partner','manager','senior','junior','client');

CREATE OR REPLACE FUNCTION public.ca_member_role(_firm_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT m.role FROM public.ca_firm_members m
      WHERE m.ca_firm_id = _firm_id AND m.user_id = auth.uid()
        AND COALESCE(m.status,'active') = 'active' LIMIT 1),
    (SELECT 'partner' FROM public.ca_firms f WHERE f.id = _firm_id AND f.user_id = auth.uid())
  )
$$;

CREATE OR REPLACE FUNCTION public.ca_can(_firm_id uuid, _permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ca_role_permissions p
    WHERE p.permission = _permission
      AND p.role = public.ca_member_role(_firm_id)
  )
$$;

-- ============ CLIENT PORTAL MEMBERSHIP ============
CREATE TABLE IF NOT EXISTS public.ca_client_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL,
  business_id uuid NOT NULL,
  user_id uuid,
  invited_email text NOT NULL,
  contact_name text,
  status text NOT NULL DEFAULT 'invited',
  invite_token uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ca_firm_id, business_id, invited_email)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_client_users TO authenticated;
GRANT ALL ON public.ca_client_users TO service_role;
ALTER TABLE public.ca_client_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "firm staff manage client users" ON public.ca_client_users FOR ALL TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id)) WITH CHECK (public.ca_can(ca_firm_id,'manage_clients'));
CREATE POLICY "client sees own membership" ON public.ca_client_users FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.client_portal_business_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT business_id FROM public.ca_client_users
  WHERE user_id = auth.uid() AND status = 'active' LIMIT 1
$$;

-- ============ DOCUMENT INTAKE OS ============
CREATE TABLE IF NOT EXISTS public.ca_document_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL,
  business_id uuid NOT NULL,
  title text NOT NULL,
  doc_types text[] NOT NULL DEFAULT '{}',
  period text,
  due_date date,
  notes text,
  status text NOT NULL DEFAULT 'open',
  requested_by uuid,
  fulfilled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_document_requests TO authenticated;
GRANT ALL ON public.ca_document_requests TO service_role;
ALTER TABLE public.ca_document_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "firm staff manage requests" ON public.ca_document_requests FOR ALL TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id)) WITH CHECK (public.user_in_ca_firm(ca_firm_id));
CREATE POLICY "client reads own requests" ON public.ca_document_requests FOR SELECT TO authenticated
  USING (business_id = public.client_portal_business_id());
CREATE POLICY "client updates own requests" ON public.ca_document_requests FOR UPDATE TO authenticated
  USING (business_id = public.client_portal_business_id())
  WITH CHECK (business_id = public.client_portal_business_id());

CREATE TABLE IF NOT EXISTS public.ca_document_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL,
  business_id uuid NOT NULL,
  request_id uuid REFERENCES public.ca_document_requests(id) ON DELETE SET NULL,
  document_id uuid REFERENCES public.ca_client_documents(id) ON DELETE SET NULL,
  storage_path text,
  original_filename text,
  classification text NOT NULL DEFAULT 'unknown',
  confidence numeric NOT NULL DEFAULT 0,
  extracted jsonb NOT NULL DEFAULT '{}'::jsonb,
  corrected jsonb,
  review_state text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  posted_at timestamptz,
  posted_ref text,
  error_message text,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_document_extractions TO authenticated;
GRANT ALL ON public.ca_document_extractions TO service_role;
ALTER TABLE public.ca_document_extractions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "firm staff manage extractions" ON public.ca_document_extractions FOR ALL TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id)) WITH CHECK (public.user_in_ca_firm(ca_firm_id));
CREATE POLICY "client reads own extractions" ON public.ca_document_extractions FOR SELECT TO authenticated
  USING (business_id = public.client_portal_business_id());
CREATE POLICY "client inserts own extractions" ON public.ca_document_extractions FOR INSERT TO authenticated
  WITH CHECK (business_id = public.client_portal_business_id());

-- ============ OPERATIONS ============
CREATE TABLE IF NOT EXISTS public.ca_engagements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL,
  business_id uuid NOT NULL,
  name text NOT NULL,
  engagement_type text NOT NULL DEFAULT 'compliance',
  fee_amount numeric DEFAULT 0,
  billing_cycle text DEFAULT 'annual',
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'active',
  partner_id uuid,
  manager_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_engagements TO authenticated;
GRANT ALL ON public.ca_engagements TO service_role;
ALTER TABLE public.ca_engagements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "firm staff read engagements" ON public.ca_engagements FOR SELECT TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id));
CREATE POLICY "firm managers write engagements" ON public.ca_engagements FOR ALL TO authenticated
  USING (public.ca_can(ca_firm_id,'manage_clients')) WITH CHECK (public.ca_can(ca_firm_id,'manage_clients'));

CREATE TABLE IF NOT EXISTS public.ca_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL,
  business_id uuid,
  engagement_id uuid REFERENCES public.ca_engagements(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general',
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  assigned_to uuid,
  due_date date,
  sla_hours integer,
  completed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_tasks TO authenticated;
GRANT ALL ON public.ca_tasks TO service_role;
ALTER TABLE public.ca_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "firm staff manage tasks" ON public.ca_tasks FOR ALL TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id)) WITH CHECK (public.user_in_ca_firm(ca_firm_id));

CREATE TABLE IF NOT EXISTS public.ca_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL,
  business_id uuid NOT NULL,
  source text NOT NULL DEFAULT 'reconciliation',
  reason_code text NOT NULL,
  description text,
  amount numeric,
  severity text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  owner_id uuid,
  resolved_by uuid,
  resolved_at timestamptz,
  evidence_document_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_exceptions TO authenticated;
GRANT ALL ON public.ca_exceptions TO service_role;
ALTER TABLE public.ca_exceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "firm staff manage exceptions" ON public.ca_exceptions FOR ALL TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id)) WITH CHECK (public.user_in_ca_firm(ca_firm_id));

CREATE TABLE IF NOT EXISTS public.ca_close_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL,
  business_id uuid NOT NULL,
  period text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  readiness_score integer NOT NULL DEFAULT 0,
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  signed_off_by uuid,
  signed_off_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ca_firm_id, business_id, period)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_close_periods TO authenticated;
GRANT ALL ON public.ca_close_periods TO service_role;
ALTER TABLE public.ca_close_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "firm staff read close" ON public.ca_close_periods FOR SELECT TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id));
CREATE POLICY "firm staff write close" ON public.ca_close_periods FOR INSERT TO authenticated
  WITH CHECK (public.ca_can(ca_firm_id,'process'));
CREATE POLICY "firm staff update close" ON public.ca_close_periods FOR UPDATE TO authenticated
  USING (public.ca_can(ca_firm_id,'process')) WITH CHECK (public.ca_can(ca_firm_id,'process'));

CREATE TABLE IF NOT EXISTS public.ca_working_papers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL,
  business_id uuid NOT NULL,
  close_period_id uuid REFERENCES public.ca_close_periods(id) ON DELETE CASCADE,
  title text NOT NULL,
  paper_type text NOT NULL DEFAULT 'schedule',
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  storage_path text,
  prepared_by uuid,
  reviewed_by uuid,
  reviewed_at timestamptz,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_working_papers TO authenticated;
GRANT ALL ON public.ca_working_papers TO service_role;
ALTER TABLE public.ca_working_papers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "firm staff manage working papers" ON public.ca_working_papers FOR ALL TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id)) WITH CHECK (public.user_in_ca_firm(ca_firm_id));

-- ============ IMMUTABLE AUDIT ============
CREATE TABLE IF NOT EXISTS public.ca_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL,
  business_id uuid,
  actor_id uuid,
  actor_role text,
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_document_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ca_audit_events TO authenticated;
GRANT ALL ON public.ca_audit_events TO service_role;
ALTER TABLE public.ca_audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "firm staff read audit" ON public.ca_audit_events FOR SELECT TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id));
CREATE POLICY "firm staff append audit" ON public.ca_audit_events FOR INSERT TO authenticated
  WITH CHECK (public.user_in_ca_firm(ca_firm_id) OR business_id = public.client_portal_business_id());

CREATE OR REPLACE FUNCTION public.ca_audit_events_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'ca_audit_events is append-only';
END;
$$;
DROP TRIGGER IF EXISTS ca_audit_events_no_change ON public.ca_audit_events;
CREATE TRIGGER ca_audit_events_no_change
  BEFORE UPDATE OR DELETE ON public.ca_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.ca_audit_events_immutable();

-- ============ updated_at triggers ============
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ca_client_users','ca_document_requests','ca_document_extractions',
    'ca_engagements','ca_tasks','ca_exceptions','ca_close_periods','ca_working_papers']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON public.%I', t);
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_ca_doc_req_firm ON public.ca_document_requests(ca_firm_id, status);
CREATE INDEX IF NOT EXISTS idx_ca_extract_firm_state ON public.ca_document_extractions(ca_firm_id, review_state);
CREATE INDEX IF NOT EXISTS idx_ca_tasks_firm_status ON public.ca_tasks(ca_firm_id, status);
CREATE INDEX IF NOT EXISTS idx_ca_audit_firm ON public.ca_audit_events(ca_firm_id, created_at DESC);