
DROP POLICY IF EXISTS "bank_transactions demo public read" ON public.bank_transactions;
CREATE POLICY "bank_transactions demo public read"
  ON public.bank_transactions FOR SELECT
  TO authenticated
  USING (is_demo = true);

DROP POLICY IF EXISTS "employees_demo demo public read" ON public.employees_demo;
CREATE POLICY "employees_demo demo public read"
  ON public.employees_demo FOR SELECT
  TO authenticated
  USING (is_demo = true);

DROP POLICY IF EXISTS "gst_filings_demo demo public read" ON public.gst_filings_demo;
CREATE POLICY "gst_filings_demo demo public read"
  ON public.gst_filings_demo FOR SELECT
  TO authenticated
  USING (is_demo = true);
