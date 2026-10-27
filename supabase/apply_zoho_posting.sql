-- Run once in the Supabase SQL editor. Adds Zoho posting tables/columns; everything defaults to off.
BEGIN;

alter table public.ca_zoho_connections add column if not exists write_enabled boolean not null default false;
alter table public.ca_zoho_links add column if not exists posting_enabled boolean not null default false;

create table if not exists public.ca_zoho_postings (
  id uuid primary key default gen_random_uuid(),
  ca_firm_id uuid not null references public.ca_firms(id) on delete cascade,
  link_id uuid not null references public.ca_zoho_links(id) on delete cascade,
  business_id uuid not null,
  txn_id uuid not null,
  kind text not null check (kind in ('bank_charge', 'receipt')),
  amount numeric(14,2) not null,
  txn_date date not null,
  summary text not null,
  zoho_type text not null check (zoho_type in ('expense', 'customerpayment')),
  zoho_id text,
  status text not null default 'pending' check (status in ('pending', 'posted', 'failed', 'undone')),
  error text,
  approved_by uuid not null,
  undone_by uuid,
  created_at timestamptz not null default now(),
  posted_at timestamptz,
  undone_at timestamptz
);
create unique index if not exists ca_zoho_postings_one_live
  on public.ca_zoho_postings (ca_firm_id, txn_id) where status in ('pending', 'posted');
create index if not exists ca_zoho_postings_firm_idx on public.ca_zoho_postings (ca_firm_id, created_at desc);

alter table public.ca_zoho_postings enable row level security;
revoke all on public.ca_zoho_postings from anon, authenticated;
COMMIT;
