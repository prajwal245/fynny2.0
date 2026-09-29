CREATE TABLE public.csv_uploads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL,
  uploaded_by UUID,
  upload_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  row_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_csv_uploads_business_created ON public.csv_uploads(business_id, created_at DESC);

ALTER TABLE public.csv_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Business access"
  ON public.csv_uploads FOR SELECT
  USING (business_id = public.get_user_business_id());

CREATE POLICY "Business insert"
  ON public.csv_uploads FOR INSERT
  WITH CHECK (business_id = public.get_user_business_id());