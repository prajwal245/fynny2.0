-- 1. employees: standardize tenant scoping column to business_id
ALTER TABLE public.employees RENAME COLUMN org_id TO business_id;

DROP POLICY IF EXISTS "Business access" ON public.employees;
DROP POLICY IF EXISTS "Business insert" ON public.employees;
DROP POLICY IF EXISTS "Business update" ON public.employees;
DROP POLICY IF EXISTS "Business delete" ON public.employees;

CREATE POLICY "employees tenant select" ON public.employees FOR SELECT TO authenticated
  USING (business_id = public.get_user_business_id());
CREATE POLICY "employees tenant insert" ON public.employees FOR INSERT TO authenticated
  WITH CHECK (business_id = public.get_user_business_id());
CREATE POLICY "employees tenant update" ON public.employees FOR UPDATE TO authenticated
  USING (business_id = public.get_user_business_id())
  WITH CHECK (business_id = public.get_user_business_id());
CREATE POLICY "employees tenant delete" ON public.employees FOR DELETE TO authenticated
  USING (business_id = public.get_user_business_id());

-- 2. invoices: remove redundant duplicate demo policy
DROP POLICY IF EXISTS "invoices demo public read" ON public.invoices;

-- 3. ca-reports storage: verify object belongs to a real report row for that firm
DROP POLICY IF EXISTS "CA firm members can read their firm reports" ON storage.objects;
CREATE POLICY "CA firm members can read their firm reports"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'ca-reports'
    AND (storage.foldername(name))[1] = (public.get_user_ca_firm_id())::text
    AND EXISTS (
      SELECT 1 FROM public.ca_reports_log r
      WHERE r.ca_firm_id = public.get_user_ca_firm_id()
        AND r.file_path = storage.objects.name
    )
  );