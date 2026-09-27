DROP POLICY IF EXISTS "CA firm can upload to own client namespace" ON storage.objects;

CREATE POLICY "CA firm can upload to own client namespace"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'ca-client-documents'
  AND EXISTS (
    SELECT 1 FROM public.ca_firm_members m
    WHERE m.ca_firm_id = ((storage.foldername(name))[1])::uuid
      AND m.user_id = auth.uid()
      AND m.status = 'active'
  )
);

DROP POLICY IF EXISTS "CA firm can read own client documents" ON storage.objects;

CREATE POLICY "CA firm can read own client documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'ca-client-documents'
  AND EXISTS (
    SELECT 1 FROM public.ca_firm_members m
    WHERE m.ca_firm_id = ((storage.foldername(name))[1])::uuid
      AND m.user_id = auth.uid()
      AND m.status = 'active'
  )
);