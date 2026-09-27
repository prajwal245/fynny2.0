
CREATE TABLE IF NOT EXISTS public.integration_oauth_states (
  nonce uuid PRIMARY KEY,
  provider text NOT NULL,
  organization_id text NOT NULL,
  user_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.integration_oauth_states TO service_role;
-- No grants to anon/authenticated: only the server (service_role in edge functions) touches this table.

ALTER TABLE public.integration_oauth_states ENABLE ROW LEVEL SECURITY;

-- No policies = no client access. service_role bypasses RLS by design.

CREATE INDEX IF NOT EXISTS idx_integration_oauth_states_expires
  ON public.integration_oauth_states (expires_at);
