CREATE TABLE IF NOT EXISTS public.ca_client_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  sender_type text NOT NULL,
  sender_id uuid NOT NULL REFERENCES auth.users(id),
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ca_client_messages_sender_type_check CHECK (sender_type IN ('ca', 'client'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_client_messages TO authenticated;
GRANT ALL ON public.ca_client_messages TO service_role;

CREATE INDEX IF NOT EXISTS ca_client_messages_thread_idx ON public.ca_client_messages (ca_firm_id, business_id, created_at);

ALTER TABLE public.ca_client_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CA or client can view their thread"
  ON public.ca_client_messages FOR SELECT
  TO authenticated
  USING (
    ca_firm_id IN (SELECT id FROM public.ca_firms WHERE user_id = auth.uid())
    OR business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "CA or client can send messages"
  ON public.ca_client_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      ca_firm_id IN (SELECT id FROM public.ca_firms WHERE user_id = auth.uid())
      OR business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Recipients can mark messages read"
  ON public.ca_client_messages FOR UPDATE
  TO authenticated
  USING (
    ca_firm_id IN (SELECT id FROM public.ca_firms WHERE user_id = auth.uid())
    OR business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid())
  )
  WITH CHECK (
    ca_firm_id IN (SELECT id FROM public.ca_firms WHERE user_id = auth.uid())
    OR business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid())
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.ca_client_messages;