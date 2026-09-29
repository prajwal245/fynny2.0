REVOKE ALL ON public.integrations FROM anon, authenticated;
GRANT SELECT (id, organization_id, provider, status, expires_at, created_at, updated_at) ON public.integrations TO authenticated;
GRANT INSERT (id, organization_id, provider, status, metadata, created_at, updated_at) ON public.integrations TO authenticated;
GRANT UPDATE (status, metadata, updated_at) ON public.integrations TO authenticated;
GRANT DELETE ON public.integrations TO authenticated;
GRANT ALL ON public.integrations TO service_role;

DROP POLICY IF EXISTS "Reply select" ON public.ticket_replies;
CREATE POLICY "Reply select" ON public.ticket_replies
FOR SELECT
USING (
  is_admin_user()
  OR (
    is_internal_note = false
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_replies.ticket_id AND t.user_id = auth.uid()
    )
  )
);