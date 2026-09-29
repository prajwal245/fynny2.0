
DROP POLICY IF EXISTS fin_imports_select_business ON storage.objects;
DROP POLICY IF EXISTS fin_imports_delete_business ON storage.objects;

CREATE POLICY fin_imports_select_business ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'financial-imports'
    AND get_user_business_id() IS NOT NULL
    AND (storage.foldername(name))[1] = (get_user_business_id())::text
  );

CREATE POLICY fin_imports_delete_business ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'financial-imports'
    AND get_user_business_id() IS NOT NULL
    AND (storage.foldername(name))[1] = (get_user_business_id())::text
  );

COMMENT ON TABLE public.hsn_master IS
  'Reference data. Writes restricted to service_role only (no client INSERT/UPDATE/DELETE policies by design). Client read access via tenant/demo SELECT policies.';
