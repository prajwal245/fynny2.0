-- Razorpay plans FynHelp creates on first use, remembered per API key
-- (test and live keys see different plans) and per price.
create table if not exists public.ca_billing_plans (
  key_id text not null,
  plan text not null check (plan in ('starter', 'professional', 'scale')),
  cycle text not null check (cycle in ('monthly', 'annual')),
  amount_paise integer not null check (amount_paise >= 100),
  razorpay_plan_id text not null,
  created_at timestamptz not null default now(),
  primary key (key_id, plan, cycle, amount_paise)
);

alter table public.ca_billing_plans enable row level security;
revoke all on public.ca_billing_plans from anon, authenticated;
grant all on public.ca_billing_plans to service_role;
