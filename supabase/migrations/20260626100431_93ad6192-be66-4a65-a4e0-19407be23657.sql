
-- 1) demo_organizations: enforce size/length caps
ALTER TABLE public.demo_organizations
  ADD CONSTRAINT demo_organizations_name_len CHECK (name IS NULL OR char_length(name) <= 200),
  ADD CONSTRAINT demo_organizations_business_name_len CHECK (business_name IS NULL OR char_length(business_name) <= 200),
  ADD CONSTRAINT demo_organizations_email_len CHECK (email IS NULL OR char_length(email) <= 320),
  ADD CONSTRAINT demo_organizations_industry_len CHECK (industry IS NULL OR char_length(industry) <= 100),
  ADD CONSTRAINT demo_organizations_employees_len CHECK (employees IS NULL OR char_length(employees) <= 50),
  ADD CONSTRAINT demo_organizations_monthly_revenue_len CHECK (monthly_revenue IS NULL OR char_length(monthly_revenue) <= 50),
  ADD CONSTRAINT demo_organizations_challenge_len CHECK (challenge IS NULL OR char_length(challenge) <= 2000),
  ADD CONSTRAINT demo_organizations_demo_org_id_len CHECK (demo_org_id IS NULL OR char_length(demo_org_id) <= 128),
  ADD CONSTRAINT demo_organizations_metadata_size CHECK (metadata IS NULL OR pg_column_size(metadata) <= 8192);

-- 2) financial-imports: re-scope storage policies to business_id (with legacy user.id fallback for reads)
DROP POLICY IF EXISTS "Users can read own folder in financial-imports" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload to own folder in financial-imports" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own folder in financial-imports" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own folder in financial-imports" ON storage.objects;

CREATE POLICY "fin_imports_select_business"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'financial-imports'
    AND (
      (storage.foldername(name))[1] = COALESCE(public.get_user_business_id()::text, '')
      OR (storage.foldername(name))[1] = auth.uid()::text  -- legacy uploads
    )
  );

CREATE POLICY "fin_imports_insert_business"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'financial-imports'
    AND public.get_user_business_id() IS NOT NULL
    AND (storage.foldername(name))[1] = public.get_user_business_id()::text
  );

CREATE POLICY "fin_imports_update_business"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'financial-imports'
    AND (storage.foldername(name))[1] = COALESCE(public.get_user_business_id()::text, '')
  );

CREATE POLICY "fin_imports_delete_business"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'financial-imports'
    AND (
      (storage.foldername(name))[1] = COALESCE(public.get_user_business_id()::text, '')
      OR (storage.foldername(name))[1] = auth.uid()::text  -- legacy cleanup
    )
  );
