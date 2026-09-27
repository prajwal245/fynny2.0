ALTER TABLE public.ca_compliance_events
  ADD COLUMN IF NOT EXISTS filed_at timestamptz,
  ADD COLUMN IF NOT EXISTS filed_by uuid;

ALTER TABLE public.ca_notifications
  ADD COLUMN IF NOT EXISTS compliance_event_id uuid REFERENCES public.ca_compliance_events(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS ca_notifications_compliance_event_uniq
  ON public.ca_notifications(compliance_event_id)
  WHERE compliance_event_id IS NOT NULL;