CREATE TABLE IF NOT EXISTS public.integrations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id text NOT NULL,
  provider text NOT NULL,
  access_token text NOT NULL,
  refresh_token text,
  expires_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(organization_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_integrations_org_provider ON public.integrations(organization_id, provider);

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for demo"
ON public.integrations
FOR ALL
USING (true)
WITH CHECK (true);

COMMENT ON TABLE public.integrations IS 'OAuth tokens for third-party integrations (Zoho, Razorpay, etc.)';