
DROP POLICY IF EXISTS "CA or client can send messages" ON public.ca_client_messages;

CREATE POLICY "CA or client can send messages"
ON public.ca_client_messages
FOR INSERT
TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND (
    (
      ca_firm_id IN (SELECT id FROM public.ca_firms WHERE user_id = auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.ca_client_access cca
        WHERE cca.ca_firm_id = ca_client_messages.ca_firm_id
          AND cca.business_id = ca_client_messages.business_id
          AND cca.is_active = true
      )
    )
    OR
    (
      business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.ca_client_access cca
        WHERE cca.ca_firm_id = ca_client_messages.ca_firm_id
          AND cca.business_id = ca_client_messages.business_id
          AND cca.is_active = true
      )
    )
  )
);
