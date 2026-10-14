-- 1. Allow the Finance Manager role (the check listed the roles one by one).
alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check
  check (role = any (array['super_admin', 'admin', 'ops_admin', 'support_agent', 'finance_manager', 'analyst', 'blog_admin', 'intern']::public.app_role[]));

-- 2. The founder's account is a Super Admin. Runs only if the account exists;
--    on first admin sign-in they set up an authenticator app.
insert into public.user_roles (user_id, role)
select id, 'super_admin'::public.app_role
from auth.users
where lower(email) = 'adireddytarun@fynhelp.com'
on conflict (user_id, role) do nothing;
