CREATE POLICY "Authenticated can read waitlist"
ON public.waitlist
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated can update waitlist"
ON public.waitlist
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Authenticated can delete waitlist"
ON public.waitlist
FOR DELETE
TO authenticated
USING (true);