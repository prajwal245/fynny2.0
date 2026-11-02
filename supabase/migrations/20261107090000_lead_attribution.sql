-- First click and last click campaign tags for each firm (utm_source, utm_medium, utm_campaign, utm_content,
-- utm_term, utm_id, gclid, fbclid, landing page), saved when the firm is created. Written by the server.
ALTER TABLE public.ca_firms ADD COLUMN IF NOT EXISTS lead_attribution jsonb;
