
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_reminder_7d_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trial_reminder_1d_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trial_expired_notified boolean NOT NULL DEFAULT false;

-- Backfill existing rows
UPDATE public.businesses
   SET trial_ends_at = created_at + interval '30 days'
 WHERE trial_ends_at IS NULL;

-- Trigger to always set trial_ends_at on insert
CREATE OR REPLACE FUNCTION public.set_business_trial_ends_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.trial_ends_at IS NULL THEN
    NEW.trial_ends_at := COALESCE(NEW.created_at, now()) + interval '30 days';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_business_trial_ends_at ON public.businesses;
CREATE TRIGGER set_business_trial_ends_at
BEFORE INSERT ON public.businesses
FOR EACH ROW
EXECUTE FUNCTION public.set_business_trial_ends_at();

CREATE INDEX IF NOT EXISTS idx_businesses_trial_ends_at
  ON public.businesses (trial_ends_at);
