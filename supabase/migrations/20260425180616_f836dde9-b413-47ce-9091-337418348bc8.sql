CREATE TABLE public.payroll_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL,
  month TEXT NOT NULL,
  total_gross NUMERIC DEFAULT 0,
  total_net NUMERIC DEFAULT 0,
  total_deductions NUMERIC DEFAULT 0,
  employee_count INTEGER DEFAULT 0,
  pf_total NUMERIC DEFAULT 0,
  esic_total NUMERIC DEFAULT 0,
  tds_total NUMERIC DEFAULT 0,
  processed_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payroll_snapshots_business_id ON public.payroll_snapshots(business_id);
CREATE INDEX idx_payroll_snapshots_month ON public.payroll_snapshots(month);

ALTER TABLE public.payroll_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Business access"
ON public.payroll_snapshots FOR SELECT
USING (business_id = public.get_user_business_id());

CREATE POLICY "Business insert"
ON public.payroll_snapshots FOR INSERT
WITH CHECK (business_id = public.get_user_business_id());

CREATE POLICY "Business update"
ON public.payroll_snapshots FOR UPDATE
USING (business_id = public.get_user_business_id());

CREATE POLICY "Business delete"
ON public.payroll_snapshots FOR DELETE
USING (business_id = public.get_user_business_id());

CREATE TRIGGER update_payroll_snapshots_updated_at
BEFORE UPDATE ON public.payroll_snapshots
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();