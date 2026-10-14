-- Admin panel security: login throttling, server-side admin sessions with an
-- idle timeout, firm suspension, coupons, and two locked-down helpers.
-- Every table here is reachable only with the service role (the app server).

create table if not exists public.admin_login_attempts (
  id bigserial primary key,
  email text not null,
  ip text,
  success boolean not null,
  at timestamptz not null default now()
);
create index if not exists admin_login_attempts_email_at on public.admin_login_attempts (lower(email), at desc);
create index if not exists admin_login_attempts_ip_at on public.admin_login_attempts (ip, at desc);

create table if not exists public.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  auth_session_id uuid,
  ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists admin_sessions_user on public.admin_sessions (user_id, created_at desc);

alter table public.ca_firms
  add column if not exists admin_status text not null default 'active'
    check (admin_status in ('active', 'suspended', 'flagged')),
  add column if not exists admin_note text;

create table if not exists public.ca_coupons (
  code text primary key check (code = upper(code) and length(code) between 3 and 32),
  kind text not null check (kind in ('percent', 'flat', 'trial_days')),
  value numeric not null check (value > 0),
  razorpay_offer_id text,
  plans text[],
  cycles text[],
  expires_at timestamptz,
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  per_firm_limit integer not null default 1 check (per_firm_limit > 0),
  active boolean not null default true,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  -- A money discount is applied by Razorpay, so it needs the Razorpay offer.
  constraint ca_coupons_offer check (kind = 'trial_days' or razorpay_offer_id is not null)
);

create table if not exists public.ca_coupon_redemptions (
  id bigserial primary key,
  code text not null references public.ca_coupons(code) on delete cascade,
  ca_firm_id uuid not null references public.ca_firms(id) on delete cascade,
  subscription_id text,
  plan text,
  cycle text,
  at timestamptz not null default now()
);
create index if not exists ca_coupon_redemptions_code on public.ca_coupon_redemptions (code);

alter table public.ca_billing add column if not exists coupon_code text;

do $$
declare t text;
begin
  foreach t in array array['admin_login_attempts', 'admin_sessions', 'ca_coupons', 'ca_coupon_redemptions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
grant usage, select on sequence public.admin_login_attempts_id_seq, public.ca_coupon_redemptions_id_seq to service_role;

-- Admins with their roles, MFA status and last sign-in, for Admin Team.
create or replace function public.admin_team()
returns table (user_id uuid, email text, roles text[], mfa_enabled boolean, last_sign_in_at timestamptz, banned_until timestamptz)
language sql
security definer
set search_path = ''
as $$
  select u.id, u.email::text,
         array_agg(distinct r.role::text order by r.role::text),
         exists (select 1 from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified'),
         u.last_sign_in_at,
         u.banned_until
  from auth.users u
  join public.user_roles r on r.user_id = u.id
  where r.role::text in ('super_admin', 'admin', 'ops_admin', 'support_agent', 'finance_manager', 'analyst')
  group by u.id, u.email, u.last_sign_in_at, u.banned_until
  order by u.email;
$$;

-- Signs a person out everywhere: their refresh tokens stop working at once.
create or replace function public.admin_revoke_sessions(target uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer;
begin
  delete from auth.sessions where user_id = target;
  get diagnostics n = row_count;
  update public.admin_sessions set revoked_at = now() where user_id = target and revoked_at is null;
  return n;
end;
$$;

-- How each firm owner signed up (email, google, ...) and when they last signed in.
create or replace function public.admin_user_logins(ids uuid[])
returns table (user_id uuid, provider text, last_sign_in_at timestamptz)
language sql
security definer
set search_path = ''
as $$
  select u.id, coalesce(u.raw_app_meta_data->>'provider', 'email'), u.last_sign_in_at
  from auth.users u
  where u.id = any(ids);
$$;

revoke all on function public.admin_user_logins(uuid[]) from public, anon, authenticated;
grant execute on function public.admin_user_logins(uuid[]) to service_role;
revoke all on function public.admin_team() from public, anon, authenticated;
revoke all on function public.admin_revoke_sessions(uuid) from public, anon, authenticated;
grant execute on function public.admin_team() to service_role;
grant execute on function public.admin_revoke_sessions(uuid) to service_role;
