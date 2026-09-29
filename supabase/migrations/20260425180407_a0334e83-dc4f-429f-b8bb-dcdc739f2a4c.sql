CREATE TABLE public.tds_filings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL,
  quarter TEXT NOT NULL,
  form_type TEXT NOT NULL,
  due_date DATE NOT NULL,
  filed_date DATE,
  status TEXT NOT NULL DEFAULT 'pending',
  total_tds_deducted NUMERIC DEFAULT 0,
  total_tds_deposited NUMERIC DEFAULT 0,
  acknowledgement_number TEXT,
  challan_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tds_filings_business_id ON public.tds_filings(business_id);
CREATE INDEX idx_tds_filings_due_date ON public.tds_filings(due_date);

ALTER TABLE public.tds_filings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Business access"
ON public.tds_filings FOR SELECT
USING (business_id = public.get_user_business_id());

CREATE POLICY "Business insert"
ON public.tds_filings FOR INSERT
WITH CHECK (business_id = public.get_user_business_id());

CREATE POLICY "Business update"
ON public.tds_filings FOR UPDATE
USING (business_id = public.get_user_business_id());

CREATE POLICY "Business delete"
ON public.tds_filings FOR DELETE
USING (business_id = public.get_user_business_id());

CREATE TRIGGER update_tds_filings_updated_at
BEFORE UPDATE ON public.tds_filings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();