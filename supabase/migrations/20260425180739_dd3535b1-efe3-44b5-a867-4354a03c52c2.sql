CREATE TABLE public.gst_filings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL,
  return_type TEXT NOT NULL,
  filing_period TEXT NOT NULL,
  due_date DATE NOT NULL,
  filed_date DATE,
  status TEXT NOT NULL DEFAULT 'pending',
  taxable_sales NUMERIC DEFAULT 0,
  output_tax NUMERIC DEFAULT 0,
  input_tax_credit NUMERIC DEFAULT 0,
  tax_payable NUMERIC DEFAULT 0,
  arn_number TEXT,
  acknowledgement_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_gst_filings_business_id ON public.gst_filings(business_id);
CREATE INDEX idx_gst_filings_due_date ON public.gst_filings(due_date);

ALTER TABLE public.gst_filings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Business access"
ON public.gst_filings FOR SELECT
USING (business_id = public.get_user_business_id());

CREATE POLICY "Business insert"
ON public.gst_filings FOR INSERT
WITH CHECK (business_id = public.get_user_business_id());

CREATE POLICY "Business update"
ON public.gst_filings FOR UPDATE
USING (business_id = public.get_user_business_id());

CREATE POLICY "Business delete"
ON public.gst_filings FOR DELETE
USING (business_id = public.get_user_business_id());

CREATE TRIGGER update_gst_filings_updated_at
BEFORE UPDATE ON public.gst_filings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();