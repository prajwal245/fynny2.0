create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_tokens_platform_check check (platform in ('ios', 'android', 'web'))
);

create unique index if not exists push_tokens_user_platform_idx
  on public.push_tokens (user_id, platform);

grant select, insert, update, delete on public.push_tokens to authenticated;
grant all on public.push_tokens to service_role;

alter table public.push_tokens enable row level security;

create policy "Users can manage own push tokens"
  on public.push_tokens for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());