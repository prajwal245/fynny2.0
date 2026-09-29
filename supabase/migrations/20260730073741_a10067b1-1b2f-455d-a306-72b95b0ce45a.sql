CREATE POLICY "CA firm members can read their firm reports"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'ca-reports'
  AND (storage.foldername(name))[1] = public.get_user_ca_firm_id()::text
);

CREATE POLICY "Service role manages ca reports"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'ca-reports')
WITH CHECK (bucket_id = 'ca-reports');