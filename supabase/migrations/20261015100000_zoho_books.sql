-- Zoho Books, read-only: one connection per firm (the Zoho login that can see
-- the clients' organisations) and a link from each client to one of its Zoho
-- bank accounts. Both are read and written only by the server (service role);
-- the refresh token is AES-GCM encrypted before it is stored.

create table if not exists public.ca_zoho_connections (
  id uuid primary key default gen_random_uuid(),
  ca_firm_id uuid not null unique references public.ca_firms(id) on delete cascade,
  connected_by uuid not null,
  accounts_server text not null,
  api_domain text not null,
  refresh_token_enc text not null,
  status text not null default 'connected' check (status in ('connected', 'error')),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ca_zoho_links (
  id uuid primary key default gen_random_uuid(),
  ca_firm_id uuid not null references public.ca_firms(id) on delete cascade,
  business_id uuid not null,
  organization_id text not null,
  organization_name text not null,
  account_id text not null,
  account_name text not null,
  created_by uuid not null,
  last_synced_at timestamptz,
  last_sync_note text,
  created_at timestamptz not null default now(),
  unique (ca_firm_id, business_id, account_id)
);
create index if not exists ca_zoho_links_firm_idx on public.ca_zoho_links (ca_firm_id);

alter table public.ca_zoho_connections enable row level security;
alter table public.ca_zoho_links enable row level security;
revoke all on public.ca_zoho_connections from anon, authenticated;
revoke all on public.ca_zoho_links from anon, authenticated;

-- Short-lived access token, kept so syncs stay inside Zoho's token limits.
alter table public.ca_zoho_connections add column if not exists access_token_enc text;
alter table public.ca_zoho_connections add column if not exists access_expires_at timestamptz;
