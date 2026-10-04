-- Gmail intake: one row per email part FynHelp has looked at, so an email is
-- never processed twice (two checks at once, retries, overlapping windows)
-- and the firm can see what was skipped and why.
CREATE TABLE IF NOT EXISTS public.ca_gmail_processed (
  connection_id uuid NOT NULL REFERENCES public.ca_gmail_connections(id) ON DELETE CASCADE,
  ca_firm_id uuid NOT NULL,
  message_id text NOT NULL,
  -- '*' marks the email as a whole (for example "no documents in it").
  part_id text NOT NULL DEFAULT '*',
  filename text,
  outcome text NOT NULL DEFAULT 'processing',
  reason text,
  extraction_id uuid,
  business_id uuid,
  sender_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (connection_id, message_id, part_id)
);

CREATE INDEX IF NOT EXISTS ca_gmail_processed_firm_idx
  ON public.ca_gmail_processed (ca_firm_id, created_at DESC);

ALTER TABLE public.ca_gmail_processed ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Firm members read Gmail intake log" ON public.ca_gmail_processed;
CREATE POLICY "Firm members read Gmail intake log" ON public.ca_gmail_processed
  FOR SELECT TO authenticated USING (public.user_in_ca_firm(ca_firm_id));

-- What the last check found, for Settings ("3 documents, 2 signature images skipped").
ALTER TABLE public.ca_gmail_connections
  ADD COLUMN IF NOT EXISTS last_poll_stats jsonb;

-- Atomic "may I refresh this inbox's Google token?" so two checks running at
-- once never refresh the same token. True for exactly one caller per minute.
CREATE OR REPLACE FUNCTION public.claim_gmail_token_refresh(p_connection_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH claimed AS (
    UPDATE public.ca_gmail_connections
       SET refresh_locked_until = now() + interval '60 seconds'
     WHERE id = p_connection_id
       AND (refresh_locked_until IS NULL OR refresh_locked_until < now())
    RETURNING id
  )
  SELECT EXISTS (SELECT 1 FROM claimed);
$$;

REVOKE ALL ON FUNCTION public.claim_gmail_token_refresh(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_gmail_token_refresh(uuid) TO service_role;
