-- ============================================================================
-- Realtime event audit log + admin role infrastructure
-- ============================================================================

-- 1. Roles infrastructure (only created if missing) ---------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role    public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Users may read their own role rows; nothing else from clients.
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- SECURITY DEFINER role check (bypasses RLS recursion).
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
GRANT  EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- 2. Realtime event audit log -------------------------------------------------
CREATE TABLE public.realtime_event_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  -- Who emitted (whoever the client SDK is logged in as).
  emitted_by      uuid,                       -- auth.uid() at insert time
  channel_name    text NOT NULL,
  schema_name     text NOT NULL DEFAULT 'public',
  table_name      text NOT NULL,
  event_type      text NOT NULL,              -- INSERT | UPDATE | DELETE
  -- Scoping context for debugging mis-scoped deliveries.
  business_id     uuid,
  ca_firm_id      uuid,
  -- Row identity (no PII payload).
  row_id          uuid,
  -- Optional small metadata blob (e.g. {"queryKey":"alerts"}).
  context         jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Was the event handled successfully on the client?
  handler_status  text NOT NULL DEFAULT 'received'
    -- received | invalidated | error | filtered_out
);

CREATE INDEX realtime_event_log_occurred_at_idx
  ON public.realtime_event_log (occurred_at DESC);
CREATE INDEX realtime_event_log_business_idx
  ON public.realtime_event_log (business_id, occurred_at DESC)
  WHERE business_id IS NOT NULL;
CREATE INDEX realtime_event_log_ca_firm_idx
  ON public.realtime_event_log (ca_firm_id, occurred_at DESC)
  WHERE ca_firm_id IS NOT NULL;
CREATE INDEX realtime_event_log_table_idx
  ON public.realtime_event_log (table_name, occurred_at DESC);

ALTER TABLE public.realtime_event_log ENABLE ROW LEVEL SECURITY;

-- INSERT: any authenticated client may record an event, but only "as themselves"
-- and only for the tenant context they actually belong to. This prevents
-- attackers from spoofing audit rows for other tenants.
CREATE POLICY "Authenticated can record their own events"
ON public.realtime_event_log
FOR INSERT
TO authenticated
WITH CHECK (
  emitted_by = auth.uid()
  AND (
    business_id IS NULL
    OR business_id = public.get_user_business_id()
  )
  AND (
    ca_firm_id IS NULL
    OR ca_firm_id = public.get_user_ca_firm_id()
  )
);

-- SELECT: admins only. Debugging surface; never exposed to tenants.
CREATE POLICY "Admins can view all realtime events"
ON public.realtime_event_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- No UPDATE / DELETE policies → log is append-only by design.

-- Validation trigger: enforces handler_status enum without a CHECK constraint,
-- and clamps occurred_at to server time for INSERTs from clients that try to
-- backdate rows.
CREATE OR REPLACE FUNCTION public.validate_realtime_event_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.event_type NOT IN ('INSERT','UPDATE','DELETE','*') THEN
    RAISE EXCEPTION 'invalid event_type: %', NEW.event_type;
  END IF;
  IF NEW.handler_status NOT IN ('received','invalidated','error','filtered_out') THEN
    RAISE EXCEPTION 'invalid handler_status: %', NEW.handler_status;
  END IF;
  -- Don't allow client-supplied future timestamps or stale ones >5min off.
  IF NEW.occurred_at IS NULL
     OR NEW.occurred_at > now() + interval '1 minute'
     OR NEW.occurred_at < now() - interval '5 minutes' THEN
    NEW.occurred_at := now();
  END IF;
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.validate_realtime_event_log() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_realtime_event_log() FROM anon;
REVOKE EXECUTE ON FUNCTION public.validate_realtime_event_log() FROM authenticated;

CREATE TRIGGER trg_validate_realtime_event_log
BEFORE INSERT ON public.realtime_event_log
FOR EACH ROW EXECUTE FUNCTION public.validate_realtime_event_log();