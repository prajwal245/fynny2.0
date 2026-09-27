DROP POLICY "CA or client can send messages" ON public.ca_client_messages;
CREATE POLICY "CA or client can send messages" ON public.ca_client_messages
FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND ca_firm_has_client_access(ca_firm_id, business_id)
  AND (
    (sender_type = 'ca' AND ca_firm_id IN (SELECT f.id FROM ca_firms f WHERE f.user_id = auth.uid()))
    OR
    (sender_type = 'client' AND business_id IN (SELECT p.business_id FROM profiles p WHERE p.user_id = auth.uid()))
  )
);

DROP POLICY "Anyone reads feature flags" ON public.feature_flags;
CREATE POLICY "Signed-in users read enabled feature flags" ON public.feature_flags
FOR SELECT TO authenticated
USING (enabled = true);