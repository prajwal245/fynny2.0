
-- Restrict demo read policies to authenticated users only (remove anon)
DROP POLICY IF EXISTS "bank_transactions demo public read" ON public.bank_transactions;
CREATE POLICY "bank_transactions demo public read" ON public.bank_transactions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "clients demo public read" ON public.clients;
CREATE POLICY "clients demo public read" ON public.clients
  FOR SELECT TO authenticated USING (is_demo = true);

DROP POLICY IF EXISTS "customers demo public read" ON public.customers;
CREATE POLICY "customers demo public read" ON public.customers
  FOR SELECT TO authenticated USING (is_demo = true);

DROP POLICY IF EXISTS "vendors demo public read" ON public.vendors;
CREATE POLICY "vendors demo public read" ON public.vendors
  FOR SELECT TO authenticated USING (is_demo = true);

DROP POLICY IF EXISTS "employees_demo demo public read" ON public.employees_demo;
CREATE POLICY "employees_demo demo public read" ON public.employees_demo
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "expenses demo public read" ON public.expenses;
CREATE POLICY "expenses demo public read" ON public.expenses
  FOR SELECT TO authenticated USING (is_demo = true);

DROP POLICY IF EXISTS "gst_filings_demo demo public read" ON public.gst_filings_demo;
CREATE POLICY "gst_filings_demo demo public read" ON public.gst_filings_demo
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "invoices demo public read" ON public.invoices;
CREATE POLICY "invoices demo public read" ON public.invoices
  FOR SELECT TO authenticated USING (is_demo = true);

-- generated_reports: drop anon write policies, restrict writes to authenticated
DROP POLICY IF EXISTS "Anonymous demo inserts" ON public.generated_reports;
DROP POLICY IF EXISTS "Anonymous demo updates" ON public.generated_reports;
