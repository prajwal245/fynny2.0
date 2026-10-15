-- More people who may set up admin access from /admin/setup. They get the
-- role only once their email is confirmed (see 20261014180000), and choose
-- their own password through the emailed link.
insert into public.admin_bootstrap_emails (email, role) values
  ('nidhi@fynhelp.com', 'super_admin'),
  ('tarun@fynhelp.com', 'super_admin'),
  ('nitya@fynny.com', 'super_admin'),
  ('daruna@fynny.com', 'super_admin')
on conflict (email) do nothing;

-- Accounts that already exist and are confirmed.
insert into public.user_roles (user_id, role)
select u.id, b.role
from auth.users u
join public.admin_bootstrap_emails b on b.email = lower(u.email)
where u.email_confirmed_at is not null
  and b.email in ('nidhi@fynhelp.com', 'tarun@fynhelp.com', 'nitya@fynny.com', 'daruna@fynny.com')
on conflict (user_id, role) do nothing;
