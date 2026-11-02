-- What a Content Collaborator may do, and nothing more:
--   * is_blog_admin() now includes them, which is what the blog, media library, glossary, resources and the
--     site-media / resources storage policies check. They are NOT added to is_admin_user(), which guards
--     support tickets, the waitlist, users and other customer data.
--   * Press items are managed through the server (permission press.manage), so nothing is needed here for them.

-- 1. The role may be stored.
alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check
  check (role = any (array['super_admin', 'admin', 'ops_admin', 'support_agent', 'finance_manager', 'analyst', 'blog_admin', 'intern', 'content_collaborator']::public.app_role[]));

-- 2. Content access (same function the blog admin already uses).
create or replace function public.is_blog_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid()
      and role in ('super_admin'::public.app_role, 'admin'::public.app_role, 'blog_admin'::public.app_role, 'content_collaborator'::public.app_role)
  );
$$;

-- 3. They show up in Admin Team.
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
  where r.role::text in ('super_admin', 'admin', 'ops_admin', 'support_agent', 'finance_manager', 'analyst', 'content_collaborator')
  group by u.id, u.email, u.last_sign_in_at, u.banned_until
  order by u.email;
$$;
