-- Drop the overly-permissive public SELECT policy
DROP POLICY IF EXISTS "Anyone can check waitlist count and email existence" ON public.waitlist;

-- Secure helper: returns only whether email exists + total count (no PII leak)
CREATE OR REPLACE FUNCTION public.check_waitlist_status(_email TEXT)
RETURNS TABLE(email_exists BOOLEAN, total_count BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS(SELECT 1 FROM public.waitlist WHERE email = lower(trim(_email))) AS email_exists,
    (SELECT count(*) FROM public.waitlist) AS total_count
$$;

REVOKE ALL ON FUNCTION public.check_waitlist_status(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_waitlist_status(TEXT) TO anon, authenticated;