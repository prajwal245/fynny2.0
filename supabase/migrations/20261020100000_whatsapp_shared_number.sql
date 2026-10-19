-- WhatsApp follow-ups from FynHelp's own number. A firm switches it on once,
-- confirms its clients agreed to be messaged, and the chaser then sends
-- approved templates (or drafts them for a partner to approve). Everything is
-- read and written by the server (service role).

-- One row per firm: on/off, who approves, and a daily ceiling.
create table if not exists public.ca_wa_settings (
  ca_firm_id uuid primary key references public.ca_firms(id) on delete cascade,
  enabled boolean not null default false,
  mode text not null default 'approve' check (mode in ('approve', 'auto')),
  daily_limit int not null default 100 check (daily_limit between 1 and 1000),
  consent_confirmed_at timestamptz,
  consent_confirmed_by uuid,
  updated_at timestamptz not null default now()
);

-- Every WhatsApp message FynHelp sends for a firm, from draft to read.
create table if not exists public.ca_wa_messages (
  id uuid primary key default gen_random_uuid(),
  ca_firm_id uuid not null references public.ca_firms(id) on delete cascade,
  business_id uuid,
  chase_id uuid,
  follow_up_number int not null default 1,
  to_phone text not null,
  to_last10 text not null,
  template text not null,
  params jsonb not null default '[]'::jsonb,
  body text not null,
  status text not null default 'draft' check (status in ('draft', 'sending', 'sent', 'delivered', 'read', 'failed', 'cancelled')),
  wamid text,
  error text,
  approved_by uuid,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists ca_wa_messages_firm_idx on public.ca_wa_messages (ca_firm_id, created_at desc);
create index if not exists ca_wa_messages_phone_idx on public.ca_wa_messages (to_last10, created_at desc);
create index if not exists ca_wa_messages_chase_idx on public.ca_wa_messages (chase_id, follow_up_number);
create unique index if not exists ca_wa_messages_wamid_uidx on public.ca_wa_messages (wamid) where wamid is not null;

-- Numbers that replied STOP. Across all firms: one STOP ends it everywhere.
create table if not exists public.ca_wa_optouts (
  phone_last10 text primary key,
  source text not null default 'reply',
  created_at timestamptz not null default now()
);

alter table public.ca_wa_settings enable row level security;
alter table public.ca_wa_messages enable row level security;
alter table public.ca_wa_optouts enable row level security;
revoke all on public.ca_wa_settings from anon, authenticated;
revoke all on public.ca_wa_messages from anon, authenticated;
revoke all on public.ca_wa_optouts from anon, authenticated;

-- The chase timeline records when a WhatsApp round was prepared and is waiting for a partner.
alter table public.ca_chaser_events drop constraint if exists ca_chaser_events_event_type_check;
alter table public.ca_chaser_events add constraint ca_chaser_events_event_type_check
  check (event_type in ('created','sent','replied','escalated','resolved','skipped','auto_resolved','auto_escalated','whatsapp_quick_send','reopened','whatsapp_draft'));
