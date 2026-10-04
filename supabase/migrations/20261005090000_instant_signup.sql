-- Sign-up no longer waits for a confirmation email: accounts are created
-- confirmed by the server. People who signed up before this change and never
-- clicked the link are confirmed the next time they sign in with their
-- password (the password check itself still happens in Supabase Auth).
CREATE OR REPLACE FUNCTION public.confirm_pending_signup(p_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE auth.users
     SET email_confirmed_at = now()
   WHERE lower(email) = lower(trim(p_email))
     AND email_confirmed_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_pending_signup(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_pending_signup(text) TO service_role;
