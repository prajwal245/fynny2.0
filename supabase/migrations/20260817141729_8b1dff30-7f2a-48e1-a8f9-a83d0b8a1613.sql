-- 1) integration_tokens: no readable access for any signed-in user; service_role only
DROP POLICY IF EXISTS "Senior admins read integration tokens metadata" ON public.integration_tokens;
REVOKE ALL ON TABLE public.integration_tokens FROM authenticated, anon;
GRANT ALL ON TABLE public.integration_tokens TO service_role;

-- 2) hsn_master: demo reference rows readable only by signed-in users
DROP POLICY IF EXISTS "hsn demo anon read" ON public.hsn_master;
REVOKE ALL ON TABLE public.hsn_master FROM anon;