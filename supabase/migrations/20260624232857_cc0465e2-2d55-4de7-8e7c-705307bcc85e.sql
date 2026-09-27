DROP POLICY IF EXISTS "bank_transactions demo public read" ON public.bank_transactions;
CREATE POLICY "bank_transactions demo public read" ON public.bank_transactions FOR SELECT TO authenticated, anon USING (is_demo = true);
GRANT SELECT ON public.bank_transactions TO anon;

DROP POLICY IF EXISTS "invoices demo public read" ON public.invoices;
CREATE POLICY "invoices demo public read" ON public.invoices FOR SELECT TO authenticated, anon USING (is_demo = true);
GRANT SELECT ON public.invoices TO anon;

DROP POLICY IF EXISTS "expenses demo public read" ON public.expenses;
CREATE POLICY "expenses demo public read" ON public.expenses FOR SELECT TO authenticated, anon USING (is_demo = true);
GRANT SELECT ON public.expenses TO anon;

DROP POLICY IF EXISTS "customers demo public read" ON public.customers;
CREATE POLICY "customers demo public read" ON public.customers FOR SELECT TO authenticated, anon USING (is_demo = true);
GRANT SELECT ON public.customers TO anon;

DROP POLICY IF EXISTS "gst_filings_demo demo public read" ON public.gst_filings_demo;
CREATE POLICY "gst_filings_demo demo public read" ON public.gst_filings_demo FOR SELECT TO authenticated, anon USING (is_demo = true);
GRANT SELECT ON public.gst_filings_demo TO anon;