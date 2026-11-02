-- Where each firm came from, kept with the firm itself (first touch), so source reports do not depend on a
-- visitor accepting analytics cookies. Only campaign tags and the referring site's host: no personal data.
-- Written by the server when the firm is created; best effort, so a failure here never blocks a sign-up.

ALTER TABLE public.ca_firms
  ADD COLUMN IF NOT EXISTS signup_channel text,
  ADD COLUMN IF NOT EXISTS signup_source text,
  ADD COLUMN IF NOT EXISTS signup_medium text,
  ADD COLUMN IF NOT EXISTS signup_campaign text,
  ADD COLUMN IF NOT EXISTS signup_content text,
  ADD COLUMN IF NOT EXISTS signup_term text,
  ADD COLUMN IF NOT EXISTS signup_landing text,
  ADD COLUMN IF NOT EXISTS signup_referrer_host text,
  ADD COLUMN IF NOT EXISTS signup_ref_code text,
  ADD COLUMN IF NOT EXISTS signup_attributed_at timestamptz;

CREATE INDEX IF NOT EXISTS ca_firms_signup_channel_idx ON public.ca_firms (signup_channel, created_at);
