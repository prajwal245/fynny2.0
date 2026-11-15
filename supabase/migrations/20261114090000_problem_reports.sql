-- Problem reports: a firm tells FynHelp something looked wrong (a statement read badly, a match that makes no sense, a message that
-- did not go). Each carries what the page was showing, so the team can reproduce it, and moves new -> looking -> fixed.
-- Written and read only by the server (service role); firms see their own through the app, the team sees all in Admin.

CREATE TABLE IF NOT EXISTS public.ca_problem_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  user_id uuid,
  user_email text,
  firm_name text,
  is_test boolean NOT NULL DEFAULT false,
  category text NOT NULL,
  summary text NOT NULL,
  what_happened text,
  expected text,
  document_id uuid,
  document_name text,
  page text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'looking', 'fixed', 'wont_fix')),
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS ca_problem_reports_status_idx ON public.ca_problem_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS ca_problem_reports_firm_idx ON public.ca_problem_reports (ca_firm_id, created_at DESC);

ALTER TABLE public.ca_problem_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ca_problem_reports FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ca_problem_reports TO service_role;
