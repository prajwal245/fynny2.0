-- Billing lifecycle: cancel at period end, scheduled downgrades, the 7-day
-- refund on a first annual payment, GST details for invoices, and the annual
-- renewal reminder.
alter table public.ca_billing
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists cancel_requested_at timestamptz,
  add column if not exists scheduled_plan text check (scheduled_plan in ('starter', 'professional', 'scale')),
  add column if not exists scheduled_cycle text check (scheduled_cycle in ('monthly', 'annual')),
  add column if not exists billing_name text,
  add column if not exists billing_gstin text,
  add column if not exists first_payment_id text,
  add column if not exists first_paid_at timestamptz,
  add column if not exists first_paid_cycle text check (first_paid_cycle in ('monthly', 'annual')),
  add column if not exists refund_used boolean not null default false,
  add column if not exists renewal_reminded_for timestamptz;
