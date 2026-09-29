
-- Restrict waitlist SELECT to admins only
DROP POLICY IF EXISTS "Authenticated can read waitlist" ON public.waitlist;
CREATE POLICY "Admins can read waitlist" ON public.waitlist
  FOR SELECT TO authenticated
  USING (is_admin_user());

-- Remove sensitive tables from realtime publication
ALTER PUBLICATION supabase_realtime DROP TABLE public.admin_audit_logs;
ALTER PUBLICATION supabase_realtime DROP TABLE public.support_tickets;
ALTER PUBLICATION supabase_realtime DROP TABLE public.ticket_replies;
