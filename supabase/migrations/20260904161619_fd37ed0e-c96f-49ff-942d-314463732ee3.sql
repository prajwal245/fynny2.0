ALTER TABLE public.waitlist
  ADD COLUMN IF NOT EXISTS role text,
  ADD COLUMN IF NOT EXISTS client_entities text,
  ADD COLUMN IF NOT EXISTS hear_about text,
  ADD COLUMN IF NOT EXISTS month_end_pain text,
  ADD COLUMN IF NOT EXISTS utm_source text,
  ADD COLUMN IF NOT EXISTS utm_medium text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS referrer text,
  ADD COLUMN IF NOT EXISTS landing_page text;