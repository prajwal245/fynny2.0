
CREATE TABLE public.business_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  document_type text NOT NULL,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size bigint,
  mime_type text,
  uploaded_by uuid,
  parse_status text NOT NULL DEFAULT 'pending',
  parse_error text,
  rows_imported integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_documents TO authenticated;
GRANT ALL ON public.business_documents TO service_role;

ALTER TABLE public.business_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own business documents"
  ON public.business_documents FOR SELECT
  TO authenticated
  USING (business_id = public.get_user_business_id());

CREATE POLICY "Users can insert own business documents"
  ON public.business_documents FOR INSERT
  TO authenticated
  WITH CHECK (business_id = public.get_user_business_id() AND uploaded_by = auth.uid());

CREATE POLICY "Users can update own business documents"
  ON public.business_documents FOR UPDATE
  TO authenticated
  USING (business_id = public.get_user_business_id());

CREATE POLICY "Users can delete own business documents"
  ON public.business_documents FOR DELETE
  TO authenticated
  USING (business_id = public.get_user_business_id());

CREATE TRIGGER update_business_documents_updated_at
  BEFORE UPDATE ON public.business_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_business_documents_business_created
  ON public.business_documents(business_id, created_at DESC);

-- Trace imported transactions back to their source file
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS source_document_id uuid REFERENCES public.business_documents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_source_document
  ON public.bank_transactions(source_document_id);

-- Storage RLS: files must live under {auth.uid()}/...
CREATE POLICY "Users can upload to own folder in financial-imports"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'financial-imports'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can read own folder in financial-imports"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'financial-imports'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update own folder in financial-imports"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'financial-imports'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own folder in financial-imports"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'financial-imports'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
