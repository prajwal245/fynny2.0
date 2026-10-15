-- The founder admin role is granted only to an account created through the
-- emailed admin invite (/admin/setup) and confirmed from that inbox. Ordinary
-- sign-up creates accounts already confirmed, so "confirmed" alone was not
-- proof that the person controls the address.
create or replace function public.grant_bootstrap_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email_confirmed_at is null or new.invited_at is null then
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
  after insert or update of email, email_confirmed_at, invited_at on auth.users
  for each row execute function public.grant_bootstrap_admin();

-- Undo any role the previous migration gave to an existing account for the
-- newly listed addresses that was not created through the admin invite.
delete from public.user_roles r
using auth.users u
where r.user_id = u.id
  and r.role = 'super_admin'
  and lower(u.email) in ('nidhi@fynhelp.com', 'tarun@fynhelp.com', 'nitya@fynny.com', 'daruna@fynny.com')
  and u.invited_at is null;
