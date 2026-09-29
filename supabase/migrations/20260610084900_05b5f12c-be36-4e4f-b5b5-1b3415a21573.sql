
-- ============= CUSTOMERS =============
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  customer_name text NOT NULL,
  contact_person text,
  email text,
  phone text,
  gstin text,
  city text,
  state text,
  payment_terms_days int DEFAULT 30,
  customer_category text,
  is_active boolean NOT NULL DEFAULT true,
  total_receivable numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customers tenant access" ON public.customers FOR ALL TO authenticated
  USING (business_id = public.get_user_business_id())
  WITH CHECK (business_id = public.get_user_business_id());
CREATE TRIGGER customers_updated_at BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX customers_business_idx ON public.customers(business_id);

-- ============= VENDORS =============
CREATE TABLE public.vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  vendor_name text NOT NULL,
  contact_person text,
  email text,
  phone text,
  gstin text,
  city text,
  payment_terms_days int DEFAULT 30,
  vendor_category text,
  is_active boolean NOT NULL DEFAULT true,
  total_outstanding numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendors TO authenticated;
GRANT ALL ON public.vendors TO service_role;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vendors tenant access" ON public.vendors FOR ALL TO authenticated
  USING (business_id = public.get_user_business_id())
  WITH CHECK (business_id = public.get_user_business_id());
CREATE TRIGGER vendors_updated_at BEFORE UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX vendors_business_idx ON public.vendors(business_id);

-- ============= INVOICES =============
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  invoice_number text NOT NULL,
  invoice_date date NOT NULL,
  due_date date,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  tax_amount numeric(14,2) NOT NULL DEFAULT 0,
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  paid_amount numeric(14,2) NOT NULL DEFAULT 0,
  outstanding_amount numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','partially_paid','paid','overdue','cancelled')),
  payment_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices tenant access" ON public.invoices FOR ALL TO authenticated
  USING (business_id = public.get_user_business_id())
  WITH CHECK (business_id = public.get_user_business_id());
CREATE TRIGGER invoices_updated_at BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX invoices_business_idx ON public.invoices(business_id);
CREATE INDEX invoices_customer_idx ON public.invoices(customer_id);
CREATE INDEX invoices_status_idx ON public.invoices(status);

-- ============= EXPENSES =============
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  category text,
  subcategory text,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  date date NOT NULL,
  due_date date,
  description text,
  payment_status text NOT NULL DEFAULT 'Pending' CHECK (payment_status IN ('Paid','Pending')),
  payment_method text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expenses tenant access" ON public.expenses FOR ALL TO authenticated
  USING (business_id = public.get_user_business_id())
  WITH CHECK (business_id = public.get_user_business_id());
CREATE TRIGGER expenses_updated_at BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX expenses_business_idx ON public.expenses(business_id);
CREATE INDEX expenses_vendor_idx ON public.expenses(vendor_id);
CREATE INDEX expenses_date_idx ON public.expenses(date);

-- ============= BANK TRANSACTIONS =============
CREATE TABLE public.bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  date date NOT NULL,
  description text,
  type text NOT NULL CHECK (type IN ('credit','debit')),
  amount numeric(14,2) NOT NULL,
  balance numeric(14,2) NOT NULL,
  category text,
  reconciled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_transactions TO authenticated;
GRANT ALL ON public.bank_transactions TO service_role;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bank_transactions tenant access" ON public.bank_transactions FOR ALL TO authenticated
  USING (business_id = public.get_user_business_id())
  WITH CHECK (business_id = public.get_user_business_id());
CREATE TRIGGER bank_transactions_updated_at BEFORE UPDATE ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX bank_transactions_business_idx ON public.bank_transactions(business_id);
CREATE INDEX bank_transactions_date_idx ON public.bank_transactions(date DESC);

-- ============= EMPLOYEES (demo) =============
CREATE TABLE public.employees_demo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  name text NOT NULL,
  department text,
  designation text,
  salary numeric(14,2) NOT NULL DEFAULT 0,
  joining_date date,
  status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive','On Leave')),
  cost_to_company numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees_demo TO authenticated;
GRANT ALL ON public.employees_demo TO service_role;
ALTER TABLE public.employees_demo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "employees_demo tenant access" ON public.employees_demo FOR ALL TO authenticated
  USING (business_id = public.get_user_business_id())
  WITH CHECK (business_id = public.get_user_business_id());
CREATE TRIGGER employees_demo_updated_at BEFORE UPDATE ON public.employees_demo
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX employees_demo_business_idx ON public.employees_demo(business_id);

-- ============= GST FILINGS (demo) =============
CREATE TABLE public.gst_filings_demo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  filing_type text NOT NULL,
  period text NOT NULL,
  due_date date,
  filed_date date,
  status text NOT NULL DEFAULT 'Pending',
  tax_liability numeric(14,2) NOT NULL DEFAULT 0,
  itc_claimed numeric(14,2) NOT NULL DEFAULT 0,
  net_payable numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gst_filings_demo TO authenticated;
GRANT ALL ON public.gst_filings_demo TO service_role;
ALTER TABLE public.gst_filings_demo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gst_filings_demo tenant access" ON public.gst_filings_demo FOR ALL TO authenticated
  USING (business_id = public.get_user_business_id())
  WITH CHECK (business_id = public.get_user_business_id());
CREATE TRIGGER gst_filings_demo_updated_at BEFORE UPDATE ON public.gst_filings_demo
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX gst_filings_demo_business_idx ON public.gst_filings_demo(business_id);

-- ============= CLIENTS =============
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  name text NOT NULL,
  industry text,
  city text,
  state text,
  contact_name text,
  contact_email text,
  gstin text,
  credit_risk text,
  total_revenue numeric(14,2) NOT NULL DEFAULT 0,
  outstanding_amount numeric(14,2) NOT NULL DEFAULT 0,
  avg_payment_days int DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clients tenant access" ON public.clients FOR ALL TO authenticated
  USING (business_id = public.get_user_business_id())
  WITH CHECK (business_id = public.get_user_business_id());
CREATE TRIGGER clients_updated_at BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX clients_business_idx ON public.clients(business_id);
