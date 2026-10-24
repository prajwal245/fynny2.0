-- On FynHelp's shared WhatsApp number, a client who writes first is matched to their firm by the
-- phone number saved in the firm's client list. This stores the last 10 digits (formatting removed)
-- so that lookup is one indexed read instead of a scan of every client.
ALTER TABLE public.ca_clients
  ADD COLUMN IF NOT EXISTS phone_tail text
  GENERATED ALWAYS AS (right(regexp_replace(coalesce(client_phone, ''), '\D', '', 'g'), 10)) STORED;
CREATE INDEX IF NOT EXISTS ca_clients_phone_tail_idx ON public.ca_clients (phone_tail) WHERE length(phone_tail) = 10;
