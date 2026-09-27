ALTER TABLE public.ca_clients ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.ca_clients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ca_clients_parent_id ON public.ca_clients(parent_id);

ALTER TABLE public.ca_report_shares ADD COLUMN IF NOT EXISTS share_token text;
ALTER TABLE public.ca_report_shares ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE public.ca_report_shares ADD COLUMN IF NOT EXISTS share_url text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ca_report_shares_token ON public.ca_report_shares(share_token);

ALTER TABLE public.ca_client_documents ADD COLUMN IF NOT EXISTS matched_request_id uuid REFERENCES public.ca_document_requests(id) ON DELETE SET NULL;
ALTER TABLE public.ca_client_documents ADD COLUMN IF NOT EXISTS auto_matched boolean NOT NULL DEFAULT false;

ALTER TABLE public.ca_client_documents ADD COLUMN IF NOT EXISTS virus_scan_status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.ca_client_documents ADD COLUMN IF NOT EXISTS virus_scan_at timestamptz;
DO $$ BEGIN
  ALTER TABLE public.ca_client_documents ADD CONSTRAINT ca_client_documents_virus_scan_status_check CHECK (virus_scan_status IN ('pending','clean','infected','skipped'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;