-- Extend ca_reports_log with richer fields
ALTER TABLE public.ca_reports_log
  ADD COLUMN IF NOT EXISTS report_name TEXT,
  ADD COLUMN IF NOT EXISTS period_start DATE,
  ADD COLUMN IF NOT EXISTS period_end DATE,
  ADD COLUMN IF NOT EXISTS generated_by_user_id UUID,
  ADD COLUMN IF NOT EXISTS file_path TEXT,
  ADD COLUMN IF NOT EXISTS file_size BIGINT;

-- Create ca_report_schedules
CREATE TABLE IF NOT EXISTS public.ca_report_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id UUID NOT NULL,
  report_type TEXT NOT NULL,
  report_name TEXT,
  frequency TEXT NOT NULL,
  day_of_month INT,
  clients JSONB DEFAULT '[]'::jsonb,
  scope TEXT DEFAULT 'all',
  delivery JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  last_generated_at TIMESTAMPTZ,
  next_generation_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ca_report_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CA schedule select"
ON public.ca_report_schedules FOR SELECT
USING (ca_firm_id = public.get_user_ca_firm_id());

CREATE POLICY "CA schedule insert"
ON public.ca_report_schedules FOR INSERT
WITH CHECK (ca_firm_id = public.get_user_ca_firm_id());

CREATE POLICY "CA schedule update"
ON public.ca_report_schedules FOR UPDATE
USING (ca_firm_id = public.get_user_ca_firm_id());

CREATE POLICY "CA schedule delete"
ON public.ca_report_schedules FOR DELETE
USING (ca_firm_id = public.get_user_ca_firm_id());

CREATE TRIGGER update_ca_report_schedules_updated_at
BEFORE UPDATE ON public.ca_report_schedules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();