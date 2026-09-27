-- ═══════════════════════════════════════════════════════════════════════════
-- Practice backend (v2): Extract → Review → Recon → Exceptions → Narrate → Chaser
--
-- Adds the canonical transaction store and the tables the four agents need,
-- and extends existing ca_* tables in place so the current screens keep
-- working. Writes happen server-side (service role) after the caller's firm
-- membership is checked; firm members can read their own rows through RLS.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0. v2 clients created before this migration have no businesses row ──────
-- ca_reports_log / ca_activity_log reference businesses(id), so reports and
-- timeline entries for those clients were being rejected. Give each orphan
-- client a minimal businesses row with the same id, plus firm access.
INSERT INTO public.businesses (id, business_name)
SELECT DISTINCT ON (c.business_id) c.business_id, c.client_name
FROM public.ca_clients c
WHERE c.business_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = c.business_id)
ORDER BY c.business_id, c.created_at;

INSERT INTO public.ca_client_access (ca_firm_id, business_id, access_level, is_active, notes)
SELECT c.ca_firm_id, c.business_id, 'full_read', true, 'Backfilled for practice workspace client'
FROM public.ca_clients c
WHERE c.business_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.ca_client_access a WHERE a.ca_firm_id = c.ca_firm_id AND a.business_id = c.business_id
  );

ALTER TABLE public.ca_clients ADD COLUMN IF NOT EXISTS do_not_disturb boolean NOT NULL DEFAULT false;

-- ── 1. Documents: processing state on the existing extraction rows ──────────
ALTER TABLE public.ca_document_extractions
  ADD COLUMN IF NOT EXISTS side text,
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS file_kind text,
  ADD COLUMN IF NOT EXISTS extract_status text,
  ADD COLUMN IF NOT EXISTS extract_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extract_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS extract_finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS row_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS txn_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS review_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duplicate_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS wa_message_id text;

DO $$ BEGIN
  ALTER TABLE public.ca_document_extractions
    ADD CONSTRAINT ca_document_extractions_side_check CHECK (side IS NULL OR side IN ('bank','books'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.ca_document_extractions
    ADD CONSTRAINT ca_document_extractions_extract_status_check
    CHECK (extract_status IS NULL OR extract_status IN ('queued','processing','parsed','needs_review','failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The same file arriving twice (upload + email + WhatsApp) is one document.
CREATE UNIQUE INDEX IF NOT EXISTS ca_document_extractions_firm_hash_uidx
  ON public.ca_document_extractions (ca_firm_id, content_hash) WHERE content_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ca_document_extractions_wa_msg_uidx
  ON public.ca_document_extractions (wa_message_id) WHERE wa_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ca_document_extractions_queue_idx
  ON public.ca_document_extractions (extract_status, created_at) WHERE extract_status IN ('queued','processing');

-- ── 2. Canonical transactions ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ca_txns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  extraction_id uuid REFERENCES public.ca_document_extractions(id) ON DELETE CASCADE,
  review_item_id uuid,
  side text NOT NULL CHECK (side IN ('bank','books')),
  direction text NOT NULL CHECK (direction IN ('in','out')),
  amount numeric(16,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'INR',
  txn_date date NOT NULL,
  counterparty text,
  reference text,
  description text,
  category text,
  balance numeric(16,2),
  confidence numeric(4,3) NOT NULL DEFAULT 1,
  raw_text text,
  row_index int,
  dedupe_key text NOT NULL,
  match_status text NOT NULL DEFAULT 'unmatched' CHECK (match_status IN ('unmatched','matched','exception','ignored')),
  recon_tag text,
  created_via text NOT NULL DEFAULT 'extract' CHECK (created_via IN ('extract','review','manual')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ca_txns_dedupe_uidx ON public.ca_txns (ca_firm_id, dedupe_key);
CREATE INDEX IF NOT EXISTS ca_txns_scope_idx ON public.ca_txns (ca_firm_id, business_id, txn_date);
CREATE INDEX IF NOT EXISTS ca_txns_status_idx ON public.ca_txns (ca_firm_id, business_id, match_status, side);
CREATE INDEX IF NOT EXISTS ca_txns_extraction_idx ON public.ca_txns (extraction_id);

-- ── 3. Review queue (one row per low-confidence line) ───────────────────────
CREATE TABLE IF NOT EXISTS public.ca_review_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  extraction_id uuid NOT NULL REFERENCES public.ca_document_extractions(id) ON DELETE CASCADE,
  row_index int NOT NULL,
  side text NOT NULL CHECK (side IN ('bank','books')),
  raw_text text NOT NULL DEFAULT '',
  proposed jsonb NOT NULL,
  confidence numeric(4,3) NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','confirmed','discarded')),
  corrected jsonb,
  was_corrected boolean NOT NULL DEFAULT false,
  txn_id uuid REFERENCES public.ca_txns(id) ON DELETE SET NULL,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (extraction_id, row_index)
);
CREATE INDEX IF NOT EXISTS ca_review_items_open_idx ON public.ca_review_items (ca_firm_id, status, business_id);

-- ── 4. Matches ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ca_recon_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  recon_run_id uuid REFERENCES public.ca_recon_runs(id) ON DELETE SET NULL,
  period_start date,
  period_end date,
  bank_txn_id uuid NOT NULL REFERENCES public.ca_txns(id) ON DELETE CASCADE,
  book_txn_ids uuid[] NOT NULL DEFAULT '{}',
  match_stage text NOT NULL CHECK (match_stage IN ('exact','fuzzy','rules','manual','external')),
  match_score numeric(5,3) NOT NULL,
  explanation jsonb NOT NULL DEFAULT '{}'::jsonb,
  matched_by uuid, -- null = system
  matched_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','reversed')),
  reversed_by uuid,
  reversed_at timestamptz,
  notes text
);
-- A bank line can be in only one live match: re-running recon is idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS ca_recon_matches_bank_active_uidx
  ON public.ca_recon_matches (bank_txn_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS ca_recon_matches_scope_idx ON public.ca_recon_matches (ca_firm_id, business_id, matched_at DESC);
CREATE INDEX IF NOT EXISTS ca_recon_matches_books_idx ON public.ca_recon_matches USING gin (book_txn_ids);

-- ── 5. Exceptions: link to the transaction and keep the explanation ─────────
ALTER TABLE public.ca_exceptions
  ADD COLUMN IF NOT EXISTS txn_id uuid REFERENCES public.ca_txns(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS txn_side text,
  ADD COLUMN IF NOT EXISTS stage_reached text,
  ADD COLUMN IF NOT EXISTS candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS detail text,
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end date,
  ADD COLUMN IF NOT EXISTS recon_run_id uuid,
  ADD COLUMN IF NOT EXISTS resolution_action text,
  ADD COLUMN IF NOT EXISTS resolution_note text;
CREATE UNIQUE INDEX IF NOT EXISTS ca_exceptions_txn_open_uidx
  ON public.ca_exceptions (txn_id) WHERE status = 'open' AND txn_id IS NOT NULL;

-- ── 6. Recon rules and counterparty aliases (per firm) ──────────────────────
CREATE TABLE IF NOT EXISTS public.ca_recon_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  name text NOT NULL,
  narration_any text[] NOT NULL,
  direction text CHECK (direction IS NULL OR direction IN ('in','out')),
  tag text NOT NULL,
  book_narration_any text[] NOT NULL DEFAULT '{}',
  date_window_days int NOT NULL DEFAULT 31 CHECK (date_window_days BETWEEN 0 AND 120),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ca_counterparty_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  alias text NOT NULL,
  canonical text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ca_counterparty_aliases_uidx ON public.ca_counterparty_aliases (ca_firm_id, lower(alias));

-- ── 7. Every AI call is logged (future fine-tuning data, cost tracking) ─────
CREATE TABLE IF NOT EXISTS public.ca_ai_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  extraction_id uuid REFERENCES public.ca_document_extractions(id) ON DELETE SET NULL,
  report_id uuid,
  purpose text NOT NULL,
  provider text,
  model text,
  input text,
  output text,
  latency_ms int,
  status text NOT NULL CHECK (status IN ('success','error')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ca_ai_calls_firm_idx ON public.ca_ai_calls (ca_firm_id, created_at DESC);

-- ── 8. Chaser: contacts, schedule and auto-resolution on requests ───────────
ALTER TABLE public.ca_document_requests
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS max_follow_ups int NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS schedule_days int[] NOT NULL DEFAULT '{0,3,7}',
  ADD COLUMN IF NOT EXISTS next_follow_up_at timestamptz,
  ADD COLUMN IF NOT EXISTS linked_extraction_id uuid REFERENCES public.ca_document_extractions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_reason text,
  ADD COLUMN IF NOT EXISTS chaser_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_chased_at timestamptz,
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz,
  -- 'practice' = scheduled by the practice Chaser; the legacy rule-based
  -- follow-up cron leaves these rows alone so nobody is emailed twice.
  ADD COLUMN IF NOT EXISTS managed_by text;
CREATE INDEX IF NOT EXISTS ca_document_requests_due_idx
  ON public.ca_document_requests (next_follow_up_at) WHERE status = 'open' AND escalated_at IS NULL;

-- Chaser timeline gains the WhatsApp quick-send event.
ALTER TABLE public.ca_chaser_events DROP CONSTRAINT IF EXISTS ca_chaser_events_event_type_check;
ALTER TABLE public.ca_chaser_events ADD CONSTRAINT ca_chaser_events_event_type_check
  CHECK (event_type IN ('created','sent','replied','escalated','resolved','skipped','auto_resolved','auto_escalated','whatsapp_quick_send','reopened'));
ALTER TABLE public.ca_chaser_events
  ADD COLUMN IF NOT EXISTS channel text,
  ADD COLUMN IF NOT EXISTS template_id text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ── 9. WhatsApp Business numbers → firm routing ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.ca_whatsapp_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  phone_number_id text NOT NULL UNIQUE,
  display_phone text,
  is_active boolean NOT NULL DEFAULT true,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── 10. Reports: keep the period bounds used ────────────────────────────────
ALTER TABLE public.ca_reports_log ADD COLUMN IF NOT EXISTS input_hash text;

-- ── 11. Row level security ──────────────────────────────────────────────────
ALTER TABLE public.ca_txns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_review_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_recon_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_recon_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_counterparty_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_ai_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_whatsapp_channels ENABLE ROW LEVEL SECURITY;

-- Read-only for firm members: agent tables change only through the server,
-- which records who did what.
DROP POLICY IF EXISTS "firm reads txns" ON public.ca_txns;
CREATE POLICY "firm reads txns" ON public.ca_txns FOR SELECT TO authenticated USING (public.user_in_ca_firm(ca_firm_id));
DROP POLICY IF EXISTS "firm reads review items" ON public.ca_review_items;
CREATE POLICY "firm reads review items" ON public.ca_review_items FOR SELECT TO authenticated USING (public.user_in_ca_firm(ca_firm_id));
DROP POLICY IF EXISTS "firm reads matches" ON public.ca_recon_matches;
CREATE POLICY "firm reads matches" ON public.ca_recon_matches FOR SELECT TO authenticated USING (public.user_in_ca_firm(ca_firm_id));
DROP POLICY IF EXISTS "firm reads ai calls" ON public.ca_ai_calls;
CREATE POLICY "firm reads ai calls" ON public.ca_ai_calls FOR SELECT TO authenticated USING (public.user_in_ca_firm(ca_firm_id));
DROP POLICY IF EXISTS "firm reads whatsapp channels" ON public.ca_whatsapp_channels;
CREATE POLICY "firm reads whatsapp channels" ON public.ca_whatsapp_channels FOR SELECT TO authenticated USING (public.user_in_ca_firm(ca_firm_id));

-- Rules and aliases are firm configuration: members manage them directly.
DROP POLICY IF EXISTS "firm manages recon rules" ON public.ca_recon_rules;
CREATE POLICY "firm manages recon rules" ON public.ca_recon_rules FOR ALL TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id)) WITH CHECK (public.user_in_ca_firm(ca_firm_id));
DROP POLICY IF EXISTS "firm manages aliases" ON public.ca_counterparty_aliases;
CREATE POLICY "firm manages aliases" ON public.ca_counterparty_aliases FOR ALL TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id)) WITH CHECK (public.user_in_ca_firm(ca_firm_id));

-- ── 12. updated_at on transactions ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ca_txns_touch() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS ca_txns_touch ON public.ca_txns;
CREATE TRIGGER ca_txns_touch BEFORE UPDATE ON public.ca_txns FOR EACH ROW EXECUTE FUNCTION public.ca_txns_touch();
