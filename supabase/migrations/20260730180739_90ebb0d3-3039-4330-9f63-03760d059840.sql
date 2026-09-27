CREATE POLICY "Users read own business reports"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'reports'
  AND (storage.foldername(name))[1] = public.get_user_business_id()::text
);

CREATE POLICY "Users manage own business reports"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'reports'
  AND (storage.foldername(name))[1] = public.get_user_business_id()::text
)
WITH CHECK (
  bucket_id = 'reports'
  AND (storage.foldername(name))[1] = public.get_user_business_id()::text
);