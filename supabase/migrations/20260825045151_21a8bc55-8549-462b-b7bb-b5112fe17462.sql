CREATE TABLE IF NOT EXISTS public.ca_canonical_fields (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  field_name text NOT NULL UNIQUE,
  display_label text NOT NULL,
  description text,
  data_type text NOT NULL DEFAULT 'numeric',
  unit text DEFAULT 'INR',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ca_canonical_fields TO authenticated;
GRANT ALL ON public.ca_canonical_fields TO service_role;
ALTER TABLE public.ca_canonical_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "canonical fields readable by signed in users"
  ON public.ca_canonical_fields FOR SELECT TO authenticated USING (true);

INSERT INTO public.ca_canonical_fields (field_name, display_label, description, data_type, unit) VALUES
  ('gross_revenue', 'Gross Revenue', 'Total revenue before deductions from all sources', 'numeric', 'INR'),
  ('net_revenue', 'Net Revenue', 'Revenue after returns and discounts', 'numeric', 'INR'),
  ('gst_collected', 'GST Collected', 'Output GST collected from customers', 'numeric', 'INR'),
  ('gst_paid', 'GST Paid', 'Input GST paid to suppliers', 'numeric', 'INR'),
  ('itc_available', 'ITC Available', 'Input tax credit available for offset', 'numeric', 'INR'),
  ('total_expenses', 'Total Expenses', 'All operating expenses', 'numeric', 'INR'),
  ('payroll_cost', 'Payroll Cost', 'Total salary and wages paid', 'numeric', 'INR'),
  ('cash_balance', 'Cash Balance', 'Current bank + cash balance', 'numeric', 'INR'),
  ('receivables', 'Receivables', 'Outstanding amounts owed by customers', 'numeric', 'INR'),
  ('payables', 'Payables', 'Outstanding amounts owed to suppliers', 'numeric', 'INR')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.ca_source_field_map (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source_system text NOT NULL,
  source_field text NOT NULL,
  canonical_field_id uuid REFERENCES public.ca_canonical_fields(id) ON DELETE CASCADE,
  transform_rule text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_system, source_field)
);

GRANT SELECT ON public.ca_source_field_map TO authenticated;
GRANT ALL ON public.ca_source_field_map TO service_role;
ALTER TABLE public.ca_source_field_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "source field map readable by signed in users"
  ON public.ca_source_field_map FOR SELECT TO authenticated USING (true);

INSERT INTO public.ca_source_field_map (source_system, source_field, canonical_field_id) VALUES
  ('zoho_books', 'total_income', (SELECT id FROM public.ca_canonical_fields WHERE field_name='gross_revenue')),
  ('zoho_books', 'total_expenses', (SELECT id FROM public.ca_canonical_fields WHERE field_name='total_expenses')),
  ('razorpay', 'amount', (SELECT id FROM public.ca_canonical_fields WHERE field_name='gross_revenue')),
  ('bank_statement', 'credit_total', (SELECT id FROM public.ca_canonical_fields WHERE field_name='gross_revenue')),
  ('bank_statement', 'debit_total', (SELECT id FROM public.ca_canonical_fields WHERE field_name='total_expenses')),
  ('tally', 'sales_total', (SELECT id FROM public.ca_canonical_fields WHERE field_name='gross_revenue')),
  ('gst_portal', 'taxable_value', (SELECT id FROM public.ca_canonical_fields WHERE field_name='net_revenue')),
  ('gst_portal', 'tax_amount', (SELECT id FROM public.ca_canonical_fields WHERE field_name='gst_collected'))
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.ca_sync_jobs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  source_system text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  started_at timestamptz,
  completed_at timestamptz,
  records_synced int NOT NULL DEFAULT 0,
  error_message text,
  last_sync_cursor text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_sync_jobs TO authenticated;
GRANT ALL ON public.ca_sync_jobs TO service_role;
ALTER TABLE public.ca_sync_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "firm access sync jobs" ON public.ca_sync_jobs
  FOR ALL TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id))
  WITH CHECK (public.user_in_ca_firm(ca_firm_id));

CREATE INDEX IF NOT EXISTS idx_ca_sync_jobs_lookup
  ON public.ca_sync_jobs(ca_firm_id, business_id, source_system, created_at DESC);

CREATE TRIGGER update_ca_sync_jobs_updated_at
  BEFORE UPDATE ON public.ca_sync_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();