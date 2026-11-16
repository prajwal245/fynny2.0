-- Close workflow: exception ownership and history, month-end close confirmations, expected documents.
-- Additive and safe to run again. The app degrades (the new fields stay empty, the checklist shows system steps only) until it is applied.

-- 1. Exceptions: who is handling each one, where it stands, and when it is due.
ALTER TABLE public.ca_exceptions
  ADD COLUMN IF NOT EXISTS kind text,
  ADD COLUMN IF NOT EXISTS work_status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS remark text,
  ADD COLUMN IF NOT EXISTS review_state text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS reviewer_id uuid,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid;
DO $$ BEGIN
  ALTER TABLE public.ca_exceptions ADD CONSTRAINT ca_exceptions_work_status_check
    CHECK (work_status IN ('open','query_sent','answered','resolved','accepted_timing'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.ca_exceptions ADD CONSTRAINT ca_exceptions_review_state_check
    CHECK (review_state IN ('none','with_senior','returned'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS ca_exceptions_owner_idx ON public.ca_exceptions (ca_firm_id, owner_id, work_status);

-- 2. Exception history: append-only. Every assignment, status change, remark and review is a row; none is ever edited or removed.
CREATE TABLE IF NOT EXISTS public.ca_exception_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL,
  business_id uuid,
  exception_id uuid NOT NULL REFERENCES public.ca_exceptions(id) ON DELETE CASCADE,
  actor_id uuid,
  actor_name text,
  event_type text NOT NULL,
  from_value text,
  to_value text,
  note text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ca_exception_events_exc_idx ON public.ca_exception_events (exception_id, created_at);
CREATE INDEX IF NOT EXISTS ca_exception_events_firm_idx ON public.ca_exception_events (ca_firm_id, created_at DESC);
ALTER TABLE public.ca_exception_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "firm staff read exception events" ON public.ca_exception_events;
CREATE POLICY "firm staff read exception events" ON public.ca_exception_events FOR SELECT TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id));
DROP POLICY IF EXISTS "firm staff add exception events" ON public.ca_exception_events;
CREATE POLICY "firm staff add exception events" ON public.ca_exception_events FOR INSERT TO authenticated
  WITH CHECK (public.user_in_ca_firm(ca_firm_id));
REVOKE ALL ON public.ca_exception_events FROM anon, authenticated;
GRANT SELECT, INSERT ON public.ca_exception_events TO authenticated;
GRANT ALL ON public.ca_exception_events TO service_role;
-- Append-only: an update is refused outright, a delete only when it comes from the exception itself being deleted.
CREATE OR REPLACE FUNCTION public.ca_exception_events_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'exception history is append-only'; END IF;
  IF TG_OP = 'DELETE' AND pg_trigger_depth() <= 1 THEN RAISE EXCEPTION 'exception history is append-only'; END IF;
  RETURN COALESCE(OLD, NEW);
END $$;
DROP TRIGGER IF EXISTS ca_exception_events_guard ON public.ca_exception_events;
CREATE TRIGGER ca_exception_events_guard BEFORE UPDATE OR DELETE ON public.ca_exception_events
  FOR EACH ROW EXECUTE FUNCTION public.ca_exception_events_append_only();

-- 3. Month-end close: the steps a person confirms. System steps are worked out when read and are not stored.
CREATE TABLE IF NOT EXISTS public.ca_close_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL,
  business_id uuid NOT NULL,
  period text NOT NULL,
  step_key text NOT NULL,
  confirmed_by uuid,
  confirmed_by_name text,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  note text,
  UNIQUE (business_id, period, step_key)
);
CREATE INDEX IF NOT EXISTS ca_close_steps_firm_idx ON public.ca_close_steps (ca_firm_id, period);
ALTER TABLE public.ca_close_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "firm staff manage close steps" ON public.ca_close_steps;
CREATE POLICY "firm staff manage close steps" ON public.ca_close_steps FOR ALL TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id)) WITH CHECK (public.user_in_ca_firm(ca_firm_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_close_steps TO authenticated;
GRANT ALL ON public.ca_close_steps TO service_role;
-- Who confirmed what, and when, is also kept as events so an un-confirm leaves a trace.
CREATE TABLE IF NOT EXISTS public.ca_close_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL,
  business_id uuid NOT NULL,
  period text NOT NULL,
  step_key text NOT NULL,
  action text NOT NULL CHECK (action IN ('confirmed','unconfirmed')),
  actor_id uuid,
  actor_name text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ca_close_events_idx ON public.ca_close_events (business_id, period, created_at);
ALTER TABLE public.ca_close_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "firm staff read close events" ON public.ca_close_events;
CREATE POLICY "firm staff read close events" ON public.ca_close_events FOR SELECT TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id));
REVOKE ALL ON public.ca_close_events FROM anon, authenticated;
GRANT SELECT ON public.ca_close_events TO authenticated;
GRANT ALL ON public.ca_close_events TO service_role;

-- 4. Expected documents: which bank accounts each client must send every month.
CREATE TABLE IF NOT EXISTS public.ca_client_document_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL,
  business_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'bank_statement',
  label text NOT NULL,
  account_tail text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ca_client_doc_req_idx ON public.ca_client_document_requirements (ca_firm_id, business_id) WHERE is_active;
ALTER TABLE public.ca_client_document_requirements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "firm staff manage document requirements" ON public.ca_client_document_requirements;
CREATE POLICY "firm staff manage document requirements" ON public.ca_client_document_requirements FOR ALL TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id)) WITH CHECK (public.user_in_ca_firm(ca_firm_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_client_document_requirements TO authenticated;
GRANT ALL ON public.ca_client_document_requirements TO service_role;

-- 5. A statement that failed verification can be accepted by a person: the acceptance is kept with the statement's own check.
-- (No new column: it is stored inside ca_document_extractions.extracted -> statement_check -> accepted.)

-- 6. Before this change recon made whoever ran it the owner of every exception, and nothing could change that. Those are not real
-- assignments: open exceptions with no history become unassigned, so "Unassigned" and "My exceptions" mean what they say.
UPDATE public.ca_exceptions x SET owner_id = NULL
 WHERE x.owner_id IS NOT NULL AND x.status = 'open'
   AND NOT EXISTS (SELECT 1 FROM public.ca_exception_events e WHERE e.exception_id = x.id);
