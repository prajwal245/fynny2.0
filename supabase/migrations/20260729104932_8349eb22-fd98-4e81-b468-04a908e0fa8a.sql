DROP POLICY IF EXISTS "expenses demo authenticated read" ON public.expenses;
CREATE POLICY "expenses demo authenticated read"
  ON public.expenses
  FOR SELECT
  TO authenticated
  USING (is_demo = true AND business_id = '4b30494f-4c30-4a74-a6bb-6bf56493a97d'::uuid);

DROP POLICY IF EXISTS "invoices demo authenticated read" ON public.invoices;
CREATE POLICY "invoices demo authenticated read"
  ON public.invoices
  FOR SELECT
  TO authenticated
  USING (is_demo = true AND business_id = '4b30494f-4c30-4a74-a6bb-6bf56493a97d'::uuid);