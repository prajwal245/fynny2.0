CREATE TABLE public.ca_brain_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ca_firm_id uuid NOT NULL,
  business_id uuid,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid,
  processed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.ca_brain_events TO authenticated;
GRANT ALL ON public.ca_brain_events TO service_role;

ALTER TABLE public.ca_brain_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Firm members read own brain events"
ON public.ca_brain_events FOR SELECT TO authenticated
USING (public.user_in_ca_firm(ca_firm_id));

CREATE POLICY "Firm members insert own brain events"
ON public.ca_brain_events FOR INSERT TO authenticated
WITH CHECK (public.user_in_ca_firm(ca_firm_id));

CREATE INDEX ca_brain_events_firm_created_idx ON public.ca_brain_events (ca_firm_id, created_at DESC);
CREATE INDEX ca_brain_events_type_idx ON public.ca_brain_events (event_type);
