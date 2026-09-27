ALTER TABLE public.csv_uploads
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'csv';

ALTER TABLE public.csv_uploads
  DROP CONSTRAINT IF EXISTS csv_uploads_source_type_check;

ALTER TABLE public.csv_uploads
  ADD CONSTRAINT csv_uploads_source_type_check
  CHECK (source_type IN ('csv', 'ai_extracted'));