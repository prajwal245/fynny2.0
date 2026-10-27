-- WhatsApp for follow-ups: what was sent, what the person answered, and who asked us to stop.
ALTER TABLE public.ca_touchpoints
  ADD COLUMN IF NOT EXISTS whatsapp_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_wamid text,
  ADD COLUMN IF NOT EXISTS whatsapp_template text,
  ADD COLUMN IF NOT EXISTS whatsapp_error text,
  -- The person tapped "Call me" or wrote back: a human should act today.
  ADD COLUMN IF NOT EXISTS callback_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS replied_at timestamptz;

-- Numbers that said "Stop messages". Keyed by the last 10 digits, the same key everywhere else uses.
CREATE TABLE IF NOT EXISTS public.ca_touch_optout (
  phone_key text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ca_touch_optout ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ca_touch_optout FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ca_touch_optout TO service_role;
