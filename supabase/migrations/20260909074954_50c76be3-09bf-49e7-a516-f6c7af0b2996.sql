CREATE INDEX IF NOT EXISTS ca_brain_events_firm_type_created_idx
  ON public.ca_brain_events (ca_firm_id, event_type, created_at DESC);