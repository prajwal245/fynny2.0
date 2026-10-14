-- Founder admin accounts. Anyone on this list is a Super Admin: at once if the
-- account exists, otherwise the moment that email signs up. They still need a
-- password of their own and an authenticator app on first admin sign-in.
create table if not exists public.admin_bootstrap_emails (
  email text primary key check (email = lower(email)),
  role public.app_role not null default 'super_admin',
  added_at timestamptz not null default now()
);
alter table public.admin_bootstrap_emails enable row level security;
revoke all on public.admin_bootstrap_emails from anon, authenticated;
grant all on public.admin_bootstrap_emails to service_role;

insert into public.admin_bootstrap_emails (email, role) values
  ('adireddytarun@fynhelp.com', 'super_admin'),
  ('prajwal@fynhelp.com', 'super_admin')
on conflict (email) do nothing;

-- Accounts that already exist.
insert into public.user_roles (user_id, role)
select u.id, b.role
from auth.users u
join public.admin_bootstrap_emails b on b.email = lower(u.email)
on conflict (user_id, role) do nothing;

-- Accounts created later.
create or replace function public.grant_bootstrap_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_roles (user_id, role)
  select new.id, b.role
  from public.admin_bootstrap_emails b
  where b.email = lower(new.email)
  on conflict (user_id, role) do nothing;
  return new;
end;
$$;
revoke all on function public.grant_bootstrap_admin() from public, anon, authenticated;

drop trigger if exists grant_bootstrap_admin on auth.users;
create trigger grant_bootstrap_admin
  after insert or update of email on auth.users
  for each row execute function public.grant_bootstrap_admin();
