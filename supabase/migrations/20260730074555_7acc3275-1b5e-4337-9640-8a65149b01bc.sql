ALTER TABLE public.ca_gstr2b_uploads
  ADD COLUMN IF NOT EXISTS records_parsed integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS records_matched integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS records_mismatched integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS records_new integer NOT NULL DEFAULT 0;