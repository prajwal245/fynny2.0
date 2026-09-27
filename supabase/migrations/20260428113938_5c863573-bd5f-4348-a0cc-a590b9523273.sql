CREATE TABLE IF NOT EXISTS public.auth_link_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  flow TEXT NOT NULL DEFAULT 'password_recovery',
  reason TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'url',
  error_code TEXT,
  description TEXT,
  route TEXT,
  user_agent TEXT,
  CONSTRAINT auth_link_events_reason_chk CHECK (reason IN ('expired','used','invalid','unknown','verified')),
  CONSTRAINT auth_link_events_source_chk CHECK (source IN ('url','supabase'))
);

CREATE INDEX IF NOT EXISTS auth_link_events_created_at_idx ON public.auth_link_events (created_at DESC);
CREATE INDEX IF NOT EXISTS auth_link_events_reason_idx ON public.auth_link_events (reason);

ALTER TABLE public.auth_link_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can record auth link events" ON public.auth_link_events;
CREATE POLICY "Anyone can record auth link events"
  ON public.auth_link_events FOR INSERT TO public WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can view auth link events" ON public.auth_link_events;
CREATE POLICY "Admins can view auth link events"
  ON public.auth_link_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));