ALTER TABLE public.ca_client_access
ADD COLUMN IF NOT EXISTS client_reference_code text UNIQUE,
ADD COLUMN IF NOT EXISTS storage_namespace text;

CREATE SEQUENCE IF NOT EXISTS public.ca_client_ref_seq START 1000 INCREMENT 1;

CREATE OR REPLACE FUNCTION public.generate_client_reference_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next bigint;
  v_code text;
BEGIN
  IF NEW.client_reference_code IS NULL THEN
    v_next := nextval('public.ca_client_ref_seq');
    v_code := 'FYN-' || LPAD(v_next::text, 5, '0');
    NEW.client_reference_code := v_code;
  END IF;
  IF NEW.storage_namespace IS NULL THEN
    NEW.storage_namespace := NEW.ca_firm_id::text || '/' || NEW.business_id::text;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_client_reference ON public.ca_client_access;

CREATE TRIGGER trg_generate_client_reference
  BEFORE INSERT ON public.ca_client_access
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_client_reference_code();

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY granted_at NULLS LAST, id) AS rn
  FROM public.ca_client_access
  WHERE client_reference_code IS NULL
)
UPDATE public.ca_client_access cca
SET
  client_reference_code = 'FYN-' || LPAD((nextval('public.ca_client_ref_seq'))::text, 5, '0'),
  storage_namespace = cca.ca_firm_id::text || '/' || cca.business_id::text
FROM ranked
WHERE cca.id = ranked.id;

CREATE TABLE IF NOT EXISTS public.ca_client_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  client_reference_code text NOT NULL,
  original_filename text NOT NULL,
  stored_filename text NOT NULL,
  storage_path text NOT NULL,
  file_size_bytes integer,
  mime_type text,
  document_type text NOT NULL DEFAULT 'general',
  filing_period text,
  description text,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ca_client_documents_type_check CHECK (
    document_type IN ('gst_return', 'tds_return', 'bank_statement', 'invoice', 'ledger', 'balance_sheet', 'profit_loss', 'audit_report', 'general')
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_client_documents TO authenticated;
GRANT ALL ON public.ca_client_documents TO service_role;

CREATE INDEX IF NOT EXISTS ca_client_documents_business_idx ON public.ca_client_documents (business_id, ca_firm_id);
CREATE INDEX IF NOT EXISTS ca_client_documents_ref_code_idx ON public.ca_client_documents (client_reference_code);
CREATE INDEX IF NOT EXISTS ca_client_documents_period_idx ON public.ca_client_documents (filing_period) WHERE filing_period IS NOT NULL;

ALTER TABLE public.ca_client_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CA firm can manage own client documents"
  ON public.ca_client_documents FOR ALL
  TO authenticated
  USING (
    ca_firm_id IN (
      SELECT id FROM public.ca_firms WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    ca_firm_id IN (
      SELECT id FROM public.ca_firms WHERE user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.lookup_client_by_reference(p_reference_code text, p_ca_firm_id uuid)
RETURNS TABLE (
  business_id uuid,
  business_name text,
  gstin text,
  storage_namespace text,
  client_reference_code text,
  is_active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.id AS business_id,
    b.business_name,
    b.gstin,
    cca.storage_namespace,
    cca.client_reference_code,
    cca.is_active
  FROM public.ca_client_access cca
  JOIN public.businesses b ON b.id = cca.business_id
  WHERE cca.client_reference_code = UPPER(p_reference_code)
    AND cca.ca_firm_id = p_ca_firm_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_client_by_reference TO authenticated;

CREATE POLICY "CA firm can upload to own client namespace"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'ca-client-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.ca_firms WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "CA firm can read own client documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'ca-client-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.ca_firms WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "CA firm can delete own client documents"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'ca-client-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.ca_firms WHERE user_id = auth.uid()
    )
  );