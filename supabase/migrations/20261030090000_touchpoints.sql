-- Follow-ups for people who stall on the way to a working, paying firm ("abandoned cart" recovery).
-- A row is a person who needs a human touch (a call or a WhatsApp), why, and how it ended. The system opens a
-- row when a stall is detected, closes it by itself when the person moves on (and notes whether our nudge came
-- first), and a person at FynHelp closes the rest with an outcome. Server only: nothing here is readable by a browser.

CREATE TABLE IF NOT EXISTS public.ca_touchpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- What stalled: signup_unfinished, no_client, no_upload, trial_stalled, checkout_abandoned,
  -- trial_ending_unpaid, trial_ended_unpaid, payment_failed, paid_quiet.
  kind text NOT NULL,
  -- Makes a follow-up once-only per stall: "" for once ever, or a month / plan for repeatable ones.
  key text NOT NULL DEFAULT '',
  user_id uuid,
  ca_firm_id uuid REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  email text,
  name text,
  phone text,
  whatsapp_ok boolean NOT NULL DEFAULT false,
  -- A plain sentence for the person doing the follow-up, and the figures behind it.
  headline text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- hot: money is at stake or the trial is about to end.
  hot boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'auto_resolved', 'dismissed')),
  due_at timestamptz NOT NULL DEFAULT now(),
  snoozed_until timestamptz,
  email_sent_at timestamptz,
  -- Who did what: reached, no_answer, not_interested, needs_demo, wrong_number, other.
  outcome text,
  note text,
  done_by text,
  done_at timestamptz,
  -- Closed by the person moving on by themselves. recovered: that happened after we reached out (email or person).
  resolved_at timestamptz,
  recovered boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One follow-up per stall and person (a firm, or a sign-up with no firm yet).
CREATE UNIQUE INDEX IF NOT EXISTS ca_touchpoints_once_idx
  ON public.ca_touchpoints (kind, key, (coalesce(ca_firm_id::text, user_id::text)));
CREATE INDEX IF NOT EXISTS ca_touchpoints_open_idx ON public.ca_touchpoints (status, due_at) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS ca_touchpoints_firm_idx ON public.ca_touchpoints (ca_firm_id);

ALTER TABLE public.ca_touchpoints ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ca_touchpoints FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ca_touchpoints TO service_role;
