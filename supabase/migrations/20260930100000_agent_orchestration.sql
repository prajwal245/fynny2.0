-- Agent orchestration: a durable record of every agent run, retry with
-- backoff for documents that failed for a temporary reason, per-firm pipeline
-- settings, and the agents' memory of human corrections.

-- ── 1. Agent runs: one row per Extract / Recon / Narrate / Chaser run ────────
CREATE TABLE IF NOT EXISTS public.ca_agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  agent text NOT NULL CHECK (agent IN ('extract','recon','narrate','chaser','orchestrator')),
  trigger text NOT NULL CHECK (trigger IN ('user','pipeline','schedule','retry','channel')),
  period text,
  subject_id uuid,
  subject_label text,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','failed','skipped')),
  attempt int NOT NULL DEFAULT 1,
  summary text,
  error text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms int,
  created_by uuid
);
CREATE INDEX IF NOT EXISTS ca_agent_runs_firm_idx ON public.ca_agent_runs (ca_firm_id, started_at DESC);
CREATE INDEX IF NOT EXISTS ca_agent_runs_client_idx ON public.ca_agent_runs (business_id, started_at DESC);
CREATE INDEX IF NOT EXISTS ca_agent_runs_subject_idx ON public.ca_agent_runs (subject_id) WHERE subject_id IS NOT NULL;

ALTER TABLE public.ca_agent_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "firm reads agent runs" ON public.ca_agent_runs;
CREATE POLICY "firm reads agent runs" ON public.ca_agent_runs
  FOR SELECT TO authenticated USING (public.user_in_ca_firm(ca_firm_id));

-- ── 2. Retry with backoff for documents that failed for a temporary reason ───
ALTER TABLE public.ca_document_extractions
  ADD COLUMN IF NOT EXISTS extract_next_attempt_at timestamptz;
CREATE INDEX IF NOT EXISTS ca_doc_extractions_retry_idx
  ON public.ca_document_extractions (extract_next_attempt_at)
  WHERE extract_next_attempt_at IS NOT NULL;

-- ── 3. Pipeline settings per firm ────────────────────────────────────────────
ALTER TABLE public.ca_firms
  ADD COLUMN IF NOT EXISTS auto_recon boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_chase_day smallint DEFAULT 5;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ca_firms_auto_chase_day_check') THEN
    ALTER TABLE public.ca_firms
      ADD CONSTRAINT ca_firms_auto_chase_day_check CHECK (auto_chase_day IS NULL OR auto_chase_day BETWEEN 1 AND 28);
  END IF;
END $$;

-- ── 4. Memory: counterparty aliases learned from manual matches ─────────────
ALTER TABLE public.ca_counterparty_aliases
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS hits int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz;

-- ── 5. Memory: how a person corrected an extracted line, per client ─────────
-- pattern is the narration with dates, amounts and reference numbers removed,
-- so next month's "NEFT CR-ICIC0009911-VIREO FOODS" meets last month's lesson.
CREATE TABLE IF NOT EXISTS public.ca_agent_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'extract_correction' CHECK (kind IN ('extract_correction')),
  pattern text NOT NULL,
  lesson jsonb NOT NULL,
  example text,
  times_taught int NOT NULL DEFAULT 1,
  times_applied int NOT NULL DEFAULT 0,
  last_applied_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ca_agent_memory_uidx
  ON public.ca_agent_memory (business_id, kind, pattern);
CREATE INDEX IF NOT EXISTS ca_agent_memory_firm_idx ON public.ca_agent_memory (ca_firm_id);

ALTER TABLE public.ca_agent_memory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "firm reads agent memory" ON public.ca_agent_memory;
CREATE POLICY "firm reads agent memory" ON public.ca_agent_memory
  FOR SELECT TO authenticated USING (public.user_in_ca_firm(ca_firm_id));
