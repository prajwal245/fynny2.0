
DROP POLICY IF EXISTS "expenses demo anon read" ON public.expenses;
CREATE POLICY "expenses demo authenticated read" ON public.expenses
  FOR SELECT TO authenticated USING (is_demo = true);

DROP POLICY IF EXISTS "invoices demo anon read" ON public.invoices;
CREATE POLICY "invoices demo authenticated read" ON public.invoices
  FOR SELECT TO authenticated USING (is_demo = true);

DROP POLICY IF EXISTS "gst_filings_demo anon public read" ON public.gst_filings_demo;
