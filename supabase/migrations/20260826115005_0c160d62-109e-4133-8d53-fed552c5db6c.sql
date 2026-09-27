-- ============ CHART OF ACCOUNTS ============
CREATE TABLE public.ca_ledger_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL,
  business_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('asset','liability','equity','income','expense')),
  parent_id uuid REFERENCES public.ca_ledger_accounts(id) ON DELETE SET NULL,
  is_group boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  opening_balance numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'INR',
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_ca_ledger_accounts_code ON public.ca_ledger_accounts (ca_firm_id, business_id, code);
CREATE INDEX idx_ca_ledger_accounts_scope ON public.ca_ledger_accounts (ca_firm_id, business_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_ledger_accounts TO authenticated;
GRANT ALL ON public.ca_ledger_accounts TO service_role;
ALTER TABLE public.ca_ledger_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ledger_accounts_select" ON public.ca_ledger_accounts FOR SELECT TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id));
CREATE POLICY "ledger_accounts_write" ON public.ca_ledger_accounts FOR ALL TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id) AND public.ca_can(ca_firm_id,'manage_clients'))
  WITH CHECK (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id) AND public.ca_can(ca_firm_id,'manage_clients'));
CREATE TRIGGER trg_ca_ledger_accounts_updated BEFORE UPDATE ON public.ca_ledger_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ DATA QUALITY ============
CREATE TABLE public.ca_data_quality_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL,
  business_id uuid NOT NULL,
  period text NOT NULL,
  total_records integer NOT NULL DEFAULT 0,
  completeness_score numeric NOT NULL DEFAULT 0,
  duplicate_count integer NOT NULL DEFAULT 0,
  anomaly_count integer NOT NULL DEFAULT 0,
  missing_field_count integer NOT NULL DEFAULT 0,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ca_dq_runs_scope ON public.ca_data_quality_runs (ca_firm_id, business_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_data_quality_runs TO authenticated;
GRANT ALL ON public.ca_data_quality_runs TO service_role;
ALTER TABLE public.ca_data_quality_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dq_runs_select" ON public.ca_data_quality_runs FOR SELECT TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id));
CREATE POLICY "dq_runs_write" ON public.ca_data_quality_runs FOR ALL TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id) AND public.ca_can(ca_firm_id,'manage_clients'))
  WITH CHECK (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id) AND public.ca_can(ca_firm_id,'manage_clients'));

CREATE TABLE public.ca_data_quality_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.ca_data_quality_runs(id) ON DELETE CASCADE,
  ca_firm_id uuid NOT NULL,
  business_id uuid NOT NULL,
  issue_type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  entity_type text NOT NULL DEFAULT 'bank_transaction',
  entity_id text,
  description text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open',
  resolution_notes text,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ca_dq_issues_run ON public.ca_data_quality_issues (run_id);
CREATE INDEX idx_ca_dq_issues_scope ON public.ca_data_quality_issues (ca_firm_id, business_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_data_quality_issues TO authenticated;
GRANT ALL ON public.ca_data_quality_issues TO service_role;
ALTER TABLE public.ca_data_quality_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dq_issues_select" ON public.ca_data_quality_issues FOR SELECT TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id));
CREATE POLICY "dq_issues_write" ON public.ca_data_quality_issues FOR ALL TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id) AND public.ca_can(ca_firm_id,'manage_clients'))
  WITH CHECK (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id) AND public.ca_can(ca_firm_id,'manage_clients'));

-- ============ PARTY MASTER ============
CREATE TABLE public.ca_parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL,
  business_id uuid NOT NULL,
  party_type text NOT NULL DEFAULT 'customer' CHECK (party_type IN ('customer','vendor','both')),
  name text NOT NULL,
  gstin text,
  pan text,
  email text,
  phone text,
  address text,
  state_code text,
  payment_terms_days integer NOT NULL DEFAULT 30,
  credit_limit numeric,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_ca_parties_name ON public.ca_parties (ca_firm_id, business_id, lower(name), party_type);
CREATE INDEX idx_ca_parties_scope ON public.ca_parties (ca_firm_id, business_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_parties TO authenticated;
GRANT ALL ON public.ca_parties TO service_role;
ALTER TABLE public.ca_parties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "parties_select" ON public.ca_parties FOR SELECT TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id));
CREATE POLICY "parties_write" ON public.ca_parties FOR ALL TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id) AND public.ca_can(ca_firm_id,'manage_clients'))
  WITH CHECK (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id) AND public.ca_can(ca_firm_id,'manage_clients'));
CREATE TRIGGER trg_ca_parties_updated BEFORE UPDATE ON public.ca_parties
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ ITEM MASTER ============
CREATE TABLE public.ca_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL,
  business_id uuid NOT NULL,
  name text NOT NULL,
  sku text,
  hsn_code text,
  uom text NOT NULL DEFAULT 'NOS',
  unit_price numeric,
  gst_rate numeric NOT NULL DEFAULT 18,
  category text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_ca_items_name ON public.ca_items (ca_firm_id, business_id, lower(name));
CREATE INDEX idx_ca_items_scope ON public.ca_items (ca_firm_id, business_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_items TO authenticated;
GRANT ALL ON public.ca_items TO service_role;
ALTER TABLE public.ca_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "items_select" ON public.ca_items FOR SELECT TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id));
CREATE POLICY "items_write" ON public.ca_items FOR ALL TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id) AND public.ca_can(ca_firm_id,'manage_clients'))
  WITH CHECK (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id) AND public.ca_can(ca_firm_id,'manage_clients'));
CREATE TRIGGER trg_ca_items_updated BEFORE UPDATE ON public.ca_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ FX RATES ============
CREATE TABLE public.ca_fx_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL,
  base_currency text NOT NULL,
  quote_currency text NOT NULL DEFAULT 'INR',
  rate numeric NOT NULL CHECK (rate > 0),
  rate_date date NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_ca_fx_rates ON public.ca_fx_rates (ca_firm_id, base_currency, quote_currency, rate_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_fx_rates TO authenticated;
GRANT ALL ON public.ca_fx_rates TO service_role;
ALTER TABLE public.ca_fx_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fx_rates_select" ON public.ca_fx_rates FOR SELECT TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id));
CREATE POLICY "fx_rates_write" ON public.ca_fx_rates FOR ALL TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id) AND public.ca_can(ca_firm_id,'manage_clients'))
  WITH CHECK (public.user_in_ca_firm(ca_firm_id) AND public.ca_can(ca_firm_id,'manage_clients'));