DROP POLICY IF EXISTS "Authenticated can update waitlist" ON public.waitlist;
DROP POLICY IF EXISTS "Authenticated can delete waitlist" ON public.waitlist;

CREATE POLICY "Admins can update waitlist"
ON public.waitlist
FOR UPDATE
TO authenticated
USING (public.is_admin_user())
WITH CHECK (public.is_admin_user());

CREATE POLICY "Admins can delete waitlist"
ON public.waitlist
FOR DELETE
TO authenticated
USING (public.is_admin_user());