ALTER TABLE public.ca_clients ADD COLUMN IF NOT EXISTS entity_type text NOT NULL DEFAULT 'Private Limited';
ALTER TABLE public.ca_clients ADD COLUMN IF NOT EXISTS entity_subtype text;
ALTER TABLE public.ca_clients ADD COLUMN IF NOT EXISTS incorporation_date date;
ALTER TABLE public.ca_clients ADD COLUMN IF NOT EXISTS cin text;
ALTER TABLE public.ca_clients ADD COLUMN IF NOT EXISTS llpin text;
ALTER TABLE public.ca_clients ADD COLUMN IF NOT EXISTS udyam_number text;
ALTER TABLE public.ca_clients ADD COLUMN IF NOT EXISTS dpiit_number text;

CREATE TABLE IF NOT EXISTS public.ca_document_versions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  business_id uuid,
  extraction_id uuid REFERENCES public.ca_document_extractions(id) ON DELETE CASCADE,
  version_number int NOT NULL DEFAULT 1,
  storage_path text NOT NULL,
  original_filename text,
  replaced_by uuid,
  uploaded_by uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_document_versions TO authenticated;
GRANT ALL ON public.ca_document_versions TO service_role;

ALTER TABLE public.ca_document_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "firm access doc versions" ON public.ca_document_versions
  FOR ALL TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id))
  WITH CHECK (public.user_in_ca_firm(ca_firm_id));

CREATE INDEX IF NOT EXISTS idx_ca_doc_versions_extraction ON public.ca_document_versions(extraction_id);

CREATE TRIGGER update_ca_document_versions_updated_at
  BEFORE UPDATE ON public.ca_document_versions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();