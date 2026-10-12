-- Billing: every firm starts on a 14-day Starter trial; a Razorpay
-- subscription takes over when a partner chooses a plan.
-- Only the server (service role) reads or writes these tables.

create table if not exists public.ca_billing (
  ca_firm_id uuid primary key references public.ca_firms(id) on delete cascade,
  plan text not null default 'starter' check (plan in ('starter', 'professional', 'scale')),
  cycle text not null default 'monthly' check (cycle in ('monthly', 'annual')),
  status text not null default 'trialing'
    check (status in ('trialing', 'pending', 'active', 'past_due', 'halted', 'cancelled')),
  trial_ends_at timestamptz not null default (now() + interval '14 days'),
  current_period_end timestamptz,
  razorpay_subscription_id text unique,
  razorpay_customer_id text,
  pending_plan text check (pending_plan in ('starter', 'professional', 'scale')),
  pending_cycle text check (pending_cycle in ('monthly', 'annual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ca_billing enable row level security;
revoke all on public.ca_billing from anon, authenticated;
grant all on public.ca_billing to service_role;

-- Razorpay webhook deliveries, kept once each so a redelivery is ignored.
create table if not exists public.ca_billing_events (
  id text primary key,
  event text not null,
  ca_firm_id uuid references public.ca_firms(id) on delete set null,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

alter table public.ca_billing_events enable row level security;
revoke all on public.ca_billing_events from anon, authenticated;
grant all on public.ca_billing_events to service_role;

-- Firms that signed up before the trial existed get a fresh 14 days from now,
-- so nobody is paused the day this ships.
insert into public.ca_billing (ca_firm_id, trial_ends_at)
select id, now() + interval '14 days' from public.ca_firms
on conflict (ca_firm_id) do nothing;

-- The walkthrough post names the sign-up button, which now reads "Start free trial".
update public.blog_posts
   set content = replace(content, 'Click <strong>Start free</strong> on the home page.', 'Click <strong>Start free trial</strong> on the home page. Every firm gets 14 days of Starter free, no card needed.')
 where slug = 'month-end-close-walkthrough-sample-files';
