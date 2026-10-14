-- Founder admin role only for a confirmed email: claiming a listed address
-- then needs access to its inbox.
create or replace function public.grant_bootstrap_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email_confirmed_at is null then
    return new;
  end if;
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
  after insert or update of email, email_confirmed_at on auth.users
  for each row execute function public.grant_bootstrap_admin();

-- Take the role back from any listed account that has not confirmed its email;
-- it returns automatically on confirmation.
delete from public.user_roles r
using auth.users u, public.admin_bootstrap_emails b
where r.user_id = u.id
  and b.email = lower(u.email)
  and r.role = b.role
  and u.email_confirmed_at is null;
