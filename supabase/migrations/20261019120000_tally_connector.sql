-- Tally Prime connector. A small agent on the client's Windows PC reads Tally
-- on localhost and pushes ledger snapshots here, outbound over HTTPS only.
-- Read-only: nothing is ever written back to Tally. Every table is read and
-- written by the server (service role); the agent token is stored as a hash.

-- One-time pairing codes a partner generates in Settings (valid 30 minutes).
create table if not exists public.ca_tally_pairings (
  id uuid primary key default gen_random_uuid(),
  ca_firm_id uuid not null references public.ca_firms(id) on delete cascade,
  created_by uuid not null,
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- One agent per Windows PC. The bearer token is shown to the agent once.
create table if not exists public.ca_tally_agents (
  id uuid primary key default gen_random_uuid(),
  ca_firm_id uuid not null references public.ca_firms(id) on delete cascade,
  label text not null,
  token_hash text not null unique,
  agent_version text,
  tally_version text,
  status text not null default 'active' check (status in ('active', 'revoked')),
  paired_by uuid not null,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ca_tally_agents_firm_idx on public.ca_tally_agents (ca_firm_id);

-- A Tally company the agent can see, optionally linked to one FynHelp client.
create table if not exists public.ca_tally_companies (
  id uuid primary key default gen_random_uuid(),
  ca_firm_id uuid not null references public.ca_firms(id) on delete cascade,
  agent_id uuid not null references public.ca_tally_agents(id) on delete cascade,
  name text not null,
  business_id uuid,
  fy_start date,
  sync_enabled boolean not null default true,
  last_synced_at timestamptz,
  last_as_on date,
  last_sync_note text,
  created_at timestamptz not null default now()
);
create unique index if not exists ca_tally_companies_agent_name_uidx on public.ca_tally_companies (agent_id, name);
create index if not exists ca_tally_companies_firm_idx on public.ca_tally_companies (ca_firm_id);
create index if not exists ca_tally_companies_client_idx on public.ca_tally_companies (ca_firm_id, business_id);

-- Every ledger's balance as on a date. Balances are cumulative from fy_start,
-- stored debit positive. A month's own figures are one snapshot less the last.
create table if not exists public.ca_tally_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.ca_tally_companies(id) on delete cascade,
  ca_firm_id uuid not null references public.ca_firms(id) on delete cascade,
  fy_start date not null,
  as_on date not null,
  content_hash text not null,
  groups jsonb not null default '[]'::jsonb,
  ledgers jsonb not null default '[]'::jsonb,
  ledger_count int not null default 0,
  stock_adjustment numeric(16,2) not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists ca_tally_snapshots_company_asof_uidx on public.ca_tally_snapshots (company_id, fy_start, as_on);
create index if not exists ca_tally_snapshots_company_idx on public.ca_tally_snapshots (company_id, as_on desc);

alter table public.ca_tally_pairings enable row level security;
alter table public.ca_tally_agents enable row level security;
alter table public.ca_tally_companies enable row level security;
alter table public.ca_tally_snapshots enable row level security;
revoke all on public.ca_tally_pairings from anon, authenticated;
revoke all on public.ca_tally_agents from anon, authenticated;
revoke all on public.ca_tally_companies from anon, authenticated;
revoke all on public.ca_tally_snapshots from anon, authenticated;
