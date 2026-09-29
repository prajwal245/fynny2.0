DROP POLICY IF EXISTS "hsn shared reference read" ON public.hsn_master;
REVOKE SELECT ON public.hsn_master FROM anon;