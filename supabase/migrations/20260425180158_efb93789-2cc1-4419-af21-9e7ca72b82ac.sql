CREATE TABLE public.employees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  department TEXT,
  designation TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  date_of_joining DATE,
  date_of_exit DATE,
  ctc_annual NUMERIC,
  salary_monthly NUMERIC,
  pf_number TEXT,
  esic_number TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_employees_org_id ON public.employees(org_id);
CREATE INDEX idx_employees_status ON public.employees(status);

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Business access"
ON public.employees FOR SELECT
USING (org_id = public.get_user_business_id());

CREATE POLICY "Business insert"
ON public.employees FOR INSERT
WITH CHECK (org_id = public.get_user_business_id());

CREATE POLICY "Business update"
ON public.employees FOR UPDATE
USING (org_id = public.get_user_business_id());

CREATE POLICY "Business delete"
ON public.employees FOR DELETE
USING (org_id = public.get_user_business_id());

CREATE TRIGGER update_employees_updated_at
BEFORE UPDATE ON public.employees
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();