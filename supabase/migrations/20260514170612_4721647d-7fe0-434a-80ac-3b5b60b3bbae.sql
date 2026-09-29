
DROP POLICY IF EXISTS "User insert" ON public.nidhi_conversations;
CREATE POLICY "User insert" ON public.nidhi_conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND business_id = public.get_user_business_id()
  );
