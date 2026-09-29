DROP POLICY IF EXISTS fin_imports_update_business ON storage.objects;
CREATE POLICY fin_imports_update_business ON storage.objects FOR UPDATE
USING (bucket_id = 'financial-imports' AND get_user_business_id() IS NOT NULL AND (storage.foldername(name))[1] = (get_user_business_id())::text)
WITH CHECK (bucket_id = 'financial-imports' AND get_user_business_id() IS NOT NULL AND (storage.foldername(name))[1] = (get_user_business_id())::text);