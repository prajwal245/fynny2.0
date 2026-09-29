
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_type text NOT NULL,
  organization_id text,
  payload jsonb NOT NULL,
  processed boolean NOT NULL DEFAULT false,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.webhook_events TO service_role;

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read webhook_events"
  ON public.webhook_events FOR SELECT
  TO authenticated
  USING (public.is_admin_user());

CREATE INDEX IF NOT EXISTS webhook_events_provider_created_idx
  ON public.webhook_events (provider, created_at DESC);
CREATE INDEX IF NOT EXISTS webhook_events_org_idx
  ON public.webhook_events (organization_id);
