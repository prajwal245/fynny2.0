CREATE TABLE IF NOT EXISTS public.ca_chaser_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chaser_id UUID NOT NULL,
  ca_firm_id UUID NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  business_id UUID,
  event_type TEXT NOT NULL CHECK (event_type IN ('created','sent','replied','escalated','resolved','skipped','auto_resolved','auto_escalated')),
  actor_id UUID,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ca_chaser_events_chaser_idx ON public.ca_chaser_events (chaser_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ca_chaser_events_firm_idx ON public.ca_chaser_events (ca_firm_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_chaser_events TO authenticated;
GRANT ALL ON public.ca_chaser_events TO service_role;

ALTER TABLE public.ca_chaser_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "firm members can manage chaser events" ON public.ca_chaser_events;
CREATE POLICY "firm members can manage chaser events"
ON public.ca_chaser_events FOR ALL TO authenticated
USING (ca_firm_id IN (SELECT ca_firm_id FROM public.ca_firm_members WHERE user_id = auth.uid()))
WITH CHECK (ca_firm_id IN (SELECT ca_firm_id FROM public.ca_firm_members WHERE user_id = auth.uid()));

ALTER TABLE public.ca_document_requests ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;