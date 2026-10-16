-- Pricing of 16 Oct 2026: the trial clock starts at the first upload (14 days),
-- and grows to 30 days once the firm has run a reconciliation and made an MIS.
alter table public.ca_billing add column if not exists trial_started_at timestamptz;
alter table public.ca_billing add column if not exists activated_at timestamptz;

-- Trials already running finish on their original terms: treat them as started
-- when the firm signed up, keeping their current end date.
update public.ca_billing
   set trial_started_at = coalesce(trial_started_at, created_at)
 where trial_started_at is null;

-- Speeds up the monthly count of active clients and documents.
create index if not exists ca_document_extractions_firm_created_idx on public.ca_document_extractions (ca_firm_id, created_at);
create index if not exists ca_agent_runs_firm_agent_started_idx on public.ca_agent_runs (ca_firm_id, agent, started_at);
