-- Each firm chooses the WhatsApp number used for the Chaser and for receiving documents:
-- FynHelp's shared number, or its own.

-- Own number: an optional access token for numbers on the firm's own Meta business account
-- (stored encrypted; empty means FynHelp's server token is used) and the WhatsApp Business Account id.
ALTER TABLE public.ca_whatsapp_channels
  ADD COLUMN IF NOT EXISTS access_token_enc text,
  ADD COLUMN IF NOT EXISTS waba_id text;

-- Shared number: a short code a client can send ("JOIN K7M2QX") to link their phone to a firm.
ALTER TABLE public.ca_firms ADD COLUMN IF NOT EXISTS whatsapp_join_code text;
CREATE UNIQUE INDEX IF NOT EXISTS ca_firms_whatsapp_join_code_idx
  ON public.ca_firms (whatsapp_join_code) WHERE whatsapp_join_code IS NOT NULL;

-- Shared number: which firm a client's phone belongs to, so replies and documents reach the right firm.
-- Set when a firm chases that phone, or when the client sends the firm's join code. One firm per phone.
CREATE TABLE IF NOT EXISTS public.ca_whatsapp_routes (
  phone_key text PRIMARY KEY,
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  via text NOT NULL DEFAULT 'chase',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ca_whatsapp_routes_firm_idx ON public.ca_whatsapp_routes (ca_firm_id);
GRANT ALL ON public.ca_whatsapp_routes TO service_role;
ALTER TABLE public.ca_whatsapp_routes ENABLE ROW LEVEL SECURITY;  -- server only; no policies

-- A number on the firm's own Meta app signs its webhooks with that app's secret (stored encrypted).
ALTER TABLE public.ca_whatsapp_channels ADD COLUMN IF NOT EXISTS app_secret_enc text;
