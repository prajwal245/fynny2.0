-- Passwords of locked files a client sent through the upload link. Stored encrypted (AES-GCM, the same key as other secrets) so the
-- firm can open the original file and re-read it. Only the server (service role) can read this table: no policy is granted to
-- signed-in users, and the password is shown to a partner or manager only through a logged action.
CREATE TABLE IF NOT EXISTS public.ca_file_passwords (
  extraction_id uuid PRIMARY KEY REFERENCES public.ca_document_extractions(id) ON DELETE CASCADE,
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  password_enc text NOT NULL,
  created_via text NOT NULL DEFAULT 'upload_link',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ca_file_passwords_firm_idx ON public.ca_file_passwords (ca_firm_id);
ALTER TABLE public.ca_file_passwords ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ca_file_passwords FROM anon, authenticated;
GRANT ALL ON public.ca_file_passwords TO service_role;
