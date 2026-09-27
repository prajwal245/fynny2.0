
-- Table policy: require active client access
DROP POLICY IF EXISTS "CA firm can manage own client documents" ON public.ca_client_documents;

CREATE POLICY "CA firm can manage own client documents"
ON public.ca_client_documents
FOR ALL
TO authenticated
USING (
  ca_firm_id IN (SELECT id FROM public.ca_firms WHERE user_id = auth.uid())
  AND public.ca_firm_has_client_access(ca_firm_id, business_id)
)
WITH CHECK (
  ca_firm_id IN (SELECT id FROM public.ca_firms WHERE user_id = auth.uid())
  AND public.ca_firm_has_client_access(ca_firm_id, business_id)
);

-- Storage policies: also verify active engagement on the business subfolder
DROP POLICY IF EXISTS "CA firm can upload to own client namespace" ON storage.objects;
DROP POLICY IF EXISTS "CA firm can read own client documents" ON storage.objects;
DROP POLICY IF EXISTS "CA firm can delete own client documents" ON storage.objects;

CREATE POLICY "CA firm can upload to own client namespace"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'ca-client-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.ca_firms WHERE user_id = auth.uid()
  )
  AND public.ca_firm_has_client_access(
    ((storage.foldername(name))[1])::uuid,
    ((storage.foldername(name))[2])::uuid
  )
);

CREATE POLICY "CA firm can read own client documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'ca-client-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.ca_firms WHERE user_id = auth.uid()
  )
  AND public.ca_firm_has_client_access(
    ((storage.foldername(name))[1])::uuid,
    ((storage.foldername(name))[2])::uuid
  )
);

CREATE POLICY "CA firm can delete own client documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'ca-client-documents'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.ca_firms WHERE user_id = auth.uid()
  )
  AND public.ca_firm_has_client_access(
    ((storage.foldername(name))[1])::uuid,
    ((storage.foldername(name))[2])::uuid
  )
);
