CREATE TABLE IF NOT EXISTS public.ca_invoices (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ca_firm_id uuid REFERENCES public.ca_firms(id) ON DELETE CASCADE NOT NULL,
  business_id uuid NOT NULL,
  engagement_id uuid REFERENCES public.ca_engagements(id) ON DELETE SET NULL,
  invoice_number text NOT NULL,
  period text NOT NULL,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric NOT NULL DEFAULT 0,
  gst_rate numeric NOT NULL DEFAULT 18,
  gst_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  due_date date,
  paid_at timestamptz,
  payment_ref text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ca_invoices_firm_number_idx ON public.ca_invoices (ca_firm_id, invoice_number);
CREATE INDEX IF NOT EXISTS ca_invoices_firm_status_idx ON public.ca_invoices (ca_firm_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_invoices TO authenticated;
GRANT ALL ON public.ca_invoices TO service_role;

ALTER TABLE public.ca_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Firm staff manage their invoices"
ON public.ca_invoices FOR ALL TO authenticated
USING (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id))
WITH CHECK (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.ca_invoices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ca_reports_log ADD COLUMN IF NOT EXISTS content jsonb;