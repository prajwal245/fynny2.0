-- When a client last wrote to the firm's WhatsApp number. Inside 24 hours the firm may send
-- free-form text; outside it only an approved template. One row per firm and number, so the
-- lookup at send time is a single indexed read however many chases there are.
CREATE TABLE IF NOT EXISTS public.ca_whatsapp_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  phone_key text NOT NULL,
  last_inbound_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ca_firm_id, phone_key)
);
CREATE INDEX IF NOT EXISTS ca_whatsapp_contacts_age_idx ON public.ca_whatsapp_contacts (last_inbound_at);

GRANT SELECT ON public.ca_whatsapp_contacts TO authenticated;
GRANT ALL ON public.ca_whatsapp_contacts TO service_role;
ALTER TABLE public.ca_whatsapp_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "firm reads whatsapp contacts" ON public.ca_whatsapp_contacts;
CREATE POLICY "firm reads whatsapp contacts" ON public.ca_whatsapp_contacts
  FOR SELECT TO authenticated USING (public.user_in_ca_firm(ca_firm_id));

-- Counting a firm's WhatsApp sends today (the daily cap) reads by firm, channel and time.
CREATE INDEX IF NOT EXISTS ca_chaser_events_wa_sent_idx
  ON public.ca_chaser_events (ca_firm_id, created_at DESC)
  WHERE channel = 'whatsapp' AND event_type = 'sent';
