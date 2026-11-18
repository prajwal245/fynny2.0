-- Narration to ledger learning: the ledger a person chose for a kind of bank line is remembered per client,
-- so the next such line is suggested that ledger first. Adds one allowed kind to the agent memory table.
ALTER TABLE public.ca_agent_memory DROP CONSTRAINT IF EXISTS ca_agent_memory_kind_check;
ALTER TABLE public.ca_agent_memory
  ADD CONSTRAINT ca_agent_memory_kind_check CHECK (kind IN ('extract_correction', 'recon_decision', 'ledger_choice'));
