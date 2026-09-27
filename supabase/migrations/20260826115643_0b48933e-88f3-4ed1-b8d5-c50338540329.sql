-- ============ CUSTOM FIELDS ============
CREATE TABLE public.ca_custom_field_defs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL,
  field_key text NOT NULL,
  label text NOT NULL,
  field_type text NOT NULL DEFAULT 'text' CHECK (field_type IN ('text','number','date','select','boolean')),
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_required boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_ca_custom_field_defs ON public.ca_custom_field_defs (ca_firm_id, field_key);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_custom_field_defs TO authenticated;
GRANT ALL ON public.ca_custom_field_defs TO service_role;
ALTER TABLE public.ca_custom_field_defs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cf_defs_select" ON public.ca_custom_field_defs FOR SELECT TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id));
CREATE POLICY "cf_defs_write" ON public.ca_custom_field_defs FOR ALL TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id) AND public.ca_can(ca_firm_id,'manage_clients'))
  WITH CHECK (public.user_in_ca_firm(ca_firm_id) AND public.ca_can(ca_firm_id,'manage_clients'));

CREATE TABLE public.ca_custom_field_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL,
  business_id uuid NOT NULL,
  field_id uuid NOT NULL REFERENCES public.ca_custom_field_defs(id) ON DELETE CASCADE,
  value text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_ca_custom_field_values ON public.ca_custom_field_values (field_id, business_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_custom_field_values TO authenticated;
GRANT ALL ON public.ca_custom_field_values TO service_role;
ALTER TABLE public.ca_custom_field_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cf_values_select" ON public.ca_custom_field_values FOR SELECT TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id));
CREATE POLICY "cf_values_write" ON public.ca_custom_field_values FOR ALL TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id) AND public.ca_can(ca_firm_id,'manage_clients'))
  WITH CHECK (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id) AND public.ca_can(ca_firm_id,'manage_clients'));

-- ============ ENTITY GROUPS ============
CREATE TABLE public.ca_entity_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL,
  name text NOT NULL,
  parent_business_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_ca_entity_groups_name ON public.ca_entity_groups (ca_firm_id, lower(name));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_entity_groups TO authenticated;
GRANT ALL ON public.ca_entity_groups TO service_role;
ALTER TABLE public.ca_entity_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "entity_groups_select" ON public.ca_entity_groups FOR SELECT TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id));
CREATE POLICY "entity_groups_write" ON public.ca_entity_groups FOR ALL TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id) AND public.ca_can(ca_firm_id,'manage_clients'))
  WITH CHECK (public.user_in_ca_firm(ca_firm_id) AND public.ca_can(ca_firm_id,'manage_clients'));
CREATE TRIGGER trg_ca_entity_groups_updated BEFORE UPDATE ON public.ca_entity_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ca_clients
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.ca_entity_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ownership_pct numeric;

-- ============ INTER-ENTITY TRANSACTIONS ============
CREATE TABLE public.ca_inter_entity_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL,
  group_id uuid REFERENCES public.ca_entity_groups(id) ON DELETE SET NULL,
  from_business_id uuid NOT NULL,
  to_business_id uuid NOT NULL,
  txn_date date NOT NULL,
  amount numeric NOT NULL,
  nature text NOT NULL DEFAULT 'sale' CHECK (nature IN ('sale','purchase','loan','reimbursement','management_fee','other')),
  description text,
  elimination_status text NOT NULL DEFAULT 'pending' CHECK (elimination_status IN ('pending','eliminated','not_required')),
  source_reference text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ca_inter_entity_scope ON public.ca_inter_entity_transactions (ca_firm_id, group_id, txn_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_inter_entity_transactions TO authenticated;
GRANT ALL ON public.ca_inter_entity_transactions TO service_role;
ALTER TABLE public.ca_inter_entity_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inter_entity_select" ON public.ca_inter_entity_transactions FOR SELECT TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id)
    AND public.ca_firm_has_client_access(ca_firm_id, from_business_id)
    AND public.ca_firm_has_client_access(ca_firm_id, to_business_id));
CREATE POLICY "inter_entity_write" ON public.ca_inter_entity_transactions FOR ALL TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id) AND public.ca_can(ca_firm_id,'manage_clients')
    AND public.ca_firm_has_client_access(ca_firm_id, from_business_id)
    AND public.ca_firm_has_client_access(ca_firm_id, to_business_id))
  WITH CHECK (public.user_in_ca_firm(ca_firm_id) AND public.ca_can(ca_firm_id,'manage_clients')
    AND public.ca_firm_has_client_access(ca_firm_id, from_business_id)
    AND public.ca_firm_has_client_access(ca_firm_id, to_business_id));