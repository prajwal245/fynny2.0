ALTER TABLE public.csv_uploads
  ADD COLUMN IF NOT EXISTS file_hash TEXT,
  ADD COLUMN IF NOT EXISTS min_date DATE,
  ADD COLUMN IF NOT EXISTS max_date DATE;

CREATE INDEX IF NOT EXISTS idx_csv_uploads_business_hash
  ON public.csv_uploads(business_id, file_hash);

CREATE INDEX IF NOT EXISTS idx_csv_uploads_business_type_dates
  ON public.csv_uploads(business_id, upload_type, min_date, max_date);