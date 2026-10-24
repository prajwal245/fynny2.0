-- Free trial is 14 days everywhere. New businesses get 14 days; existing rows are left as they are
-- so nobody's running trial is shortened.
CREATE OR REPLACE FUNCTION public.set_business_trial_ends_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.trial_ends_at IS NULL THEN
    NEW.trial_ends_at := COALESCE(NEW.created_at, now()) + interval '14 days';
  END IF;
  RETURN NEW;
END;
$$;
