DROP POLICY IF EXISTS "CA member select" ON public.ca_firm_members;

CREATE POLICY "CA member select"
ON public.ca_firm_members
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_ca_firm_privileged(ca_firm_id)
);