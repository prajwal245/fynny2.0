
ALTER TABLE public.ca_firms
ADD COLUMN IF NOT EXISTS icai_membership_number text,
ADD COLUMN IF NOT EXISTS icai_membership_type text,
ADD COLUMN IF NOT EXISTS aadhaar_last4 text,
ADD COLUMN IF NOT EXISTS aadhaar_document_path text,
ADD COLUMN IF NOT EXISTS practice_certificate_path text,
ADD COLUMN IF NOT EXISTS firm_registration_number text,
ADD COLUMN IF NOT EXISTS pan_number text,
ADD COLUMN IF NOT EXISTS years_of_practice integer,
ADD COLUMN IF NOT EXISTS specializations text[],
ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS verification_submitted_at timestamptz,
ADD COLUMN IF NOT EXISTS verification_reviewed_at timestamptz,
ADD COLUMN IF NOT EXISTS verification_rejected_reason text,
ADD COLUMN IF NOT EXISTS onboarding_step integer NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE public.ca_firms ADD CONSTRAINT ca_firms_verification_status_check
    CHECK (verification_status IN ('incomplete','pending','approved','rejected'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.ca_firms ADD CONSTRAINT ca_firms_membership_type_check
    CHECK (icai_membership_type IS NULL OR icai_membership_type IN ('ACA','FCA'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.ca_verification_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  storage_path text NOT NULL,
  original_filename text NOT NULL,
  file_size_bytes integer,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  verified boolean DEFAULT false,
  CONSTRAINT ca_verification_documents_type_check CHECK (
    document_type IN ('aadhaar','practice_certificate','icai_certificate','pan_card','firm_registration')
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_verification_documents TO authenticated;
GRANT ALL ON public.ca_verification_documents TO service_role;

ALTER TABLE public.ca_verification_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CA can manage own verification documents" ON public.ca_verification_documents;
CREATE POLICY "CA can manage own verification documents"
  ON public.ca_verification_documents FOR ALL
  TO authenticated
  USING (ca_firm_id IN (SELECT id FROM public.ca_firms WHERE user_id = auth.uid()))
  WITH CHECK (ca_firm_id IN (SELECT id FROM public.ca_firms WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Admin can view all verification documents" ON public.ca_verification_documents;
CREATE POLICY "Admin can view all verification documents"
  ON public.ca_verification_documents FOR SELECT
  TO authenticated
  USING (public.is_admin_user());

-- Storage RLS
DROP POLICY IF EXISTS "CA can upload own verification documents" ON storage.objects;
CREATE POLICY "CA can upload own verification documents"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'ca-verification-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.ca_firms WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "CA can view own verification documents" ON storage.objects;
CREATE POLICY "CA can view own verification documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'ca-verification-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.ca_firms WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admin can view all ca verification documents" ON storage.objects;
CREATE POLICY "Admin can view all ca verification documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'ca-verification-documents'
    AND public.is_admin_user()
  );
