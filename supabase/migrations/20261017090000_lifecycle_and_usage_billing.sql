-- Monthly billing of extra active clients and document overage (in arrears),
-- and the lifecycle emails (trial nudges, usage summaries, retention).
-- Only the server (service role) reads or writes these tables.

-- One row per firm per billed month: what the firm used and how the extras
-- were charged. The unique key makes a month impossible to bill twice.
create table if not exists public.ca_usage_charges (
  id uuid primary key default gen_random_uuid(),
  ca_firm_id uuid not null references public.ca_firms(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  plan text not null check (plan in ('starter', 'professional', 'scale')),
  cycle text not null check (cycle in ('monthly', 'annual')),
  active_clients integer not null default 0,
  documents integer not null default 0,
  extra_clients integer not null default 0,
  extra_clients_amount numeric(12, 2) not null default 0,
  overage_blocks integer not null default 0,
  overage_amount numeric(12, 2) not null default 0,
  subtotal numeric(12, 2) not null default 0,
  gst numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  -- addon: added to the next monthly subscription payment
  -- invoice: a Razorpay invoice (payment link) for yearly plans
  -- none: nothing over the plan that month
  method text not null default 'none' check (method in ('none', 'addon', 'invoice')),
  status text not null default 'pending'
    check (status in ('pending', 'none', 'billed', 'paid', 'failed', 'waived')),
  razorpay_ref text,
  pay_url text,
  attempts integer not null default 0,
  error text,
  billed_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ca_firm_id, month)
);
create index if not exists ca_usage_charges_ref_idx on public.ca_usage_charges (razorpay_ref);

alter table public.ca_usage_charges enable row level security;
revoke all on public.ca_usage_charges from anon, authenticated;
grant all on public.ca_usage_charges to service_role;

-- Every lifecycle email a firm was sent, once per kind and key (e.g. a month).
create table if not exists public.ca_lifecycle_emails (
  ca_firm_id uuid not null references public.ca_firms(id) on delete cascade,
  kind text not null,
  key text not null default '',
  sent_at timestamptz not null default now(),
  provider_id text,
  primary key (ca_firm_id, kind, key)
);
create index if not exists ca_lifecycle_emails_firm_sent_idx on public.ca_lifecycle_emails (ca_firm_id, sent_at desc);

alter table public.ca_lifecycle_emails enable row level security;
revoke all on public.ca_lifecycle_emails from anon, authenticated;
grant all on public.ca_lifecycle_emails to service_role;

-- Background jobs that should run once per period, whichever cron tick gets there first.
create table if not exists public.ca_job_runs (
  job text not null,
  key text not null,
  ran_at timestamptz not null default now(),
  result jsonb,
  primary key (job, key)
);

alter table public.ca_job_runs enable row level security;
revoke all on public.ca_job_runs from anon, authenticated;
grant all on public.ca_job_runs to service_role;
