ALTER TABLE public.ca_document_requests
  ADD COLUMN IF NOT EXISTS last_chased_at timestamptz,
  ADD COLUMN IF NOT EXISTS chaser_count integer NOT NULL DEFAULT 0;