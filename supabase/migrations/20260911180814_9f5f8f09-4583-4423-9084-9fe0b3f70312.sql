CREATE TABLE IF NOT EXISTS public.ca_gmail_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id UUID NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  gmail_address TEXT NOT NULL,
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT NOT NULL,
  token_expiry TIMESTAMPTZ NOT NULL,
  last_polled_at TIMESTAMPTZ,
  last_history_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ca_firm_id, gmail_address)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_gmail_connections TO authenticated;
GRANT ALL ON public.ca_gmail_connections TO service_role;
ALTER TABLE public.ca_gmail_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "firm members manage gmail connections"
ON public.ca_gmail_connections FOR ALL TO authenticated
USING (ca_firm_id IN (SELECT ca_firm_id FROM public.ca_firm_members WHERE user_id = auth.uid()))
WITH CHECK (ca_firm_id IN (SELECT ca_firm_id FROM public.ca_firm_members WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.ca_email_sender_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id UUID NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  business_id UUID NOT NULL,
  sender_email TEXT NOT NULL,
  sender_domain TEXT,
  sender_name TEXT,
  match_method TEXT CHECK (match_method IN ('exact','domain','name','gstin','manual')),
  confidence NUMERIC NOT NULL DEFAULT 0,
  confirmed_by_user_id UUID,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ca_firm_id, sender_email)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_email_sender_mappings TO authenticated;
GRANT ALL ON public.ca_email_sender_mappings TO service_role;
ALTER TABLE public.ca_email_sender_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "firm members manage sender mappings"
ON public.ca_email_sender_mappings FOR ALL TO authenticated
USING (ca_firm_id IN (SELECT ca_firm_id FROM public.ca_firm_members WHERE user_id = auth.uid()))
WITH CHECK (ca_firm_id IN (SELECT ca_firm_id FROM public.ca_firm_members WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_sender_mappings_firm_email ON public.ca_email_sender_mappings (ca_firm_id, sender_email);

ALTER TABLE public.ca_document_extractions ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'upload';
ALTER TABLE public.ca_document_extractions ADD COLUMN IF NOT EXISTS gmail_message_id TEXT;
ALTER TABLE public.ca_document_extractions ADD COLUMN IF NOT EXISTS gmail_sender_email TEXT;
ALTER TABLE public.ca_document_extractions ADD COLUMN IF NOT EXISTS gmail_subject TEXT;
ALTER TABLE public.ca_document_extractions ADD COLUMN IF NOT EXISTS gmail_match_method TEXT;
ALTER TABLE public.ca_document_extractions ADD COLUMN IF NOT EXISTS gmail_match_confidence NUMERIC;
ALTER TABLE public.ca_document_extractions ALTER COLUMN business_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_extractions_gmail_message ON public.ca_document_extractions (ca_firm_id, gmail_message_id, original_filename) WHERE gmail_message_id IS NOT NULL;