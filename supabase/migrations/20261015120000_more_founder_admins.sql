-- More people who may set up admin access from /admin/setup. They get the
-- role only once their email is confirmed (see 20261014180000), and choose
-- their own password through the emailed link.
insert into public.admin_bootstrap_emails (email, role) values
  ('nidhi@fynhelp.com', 'super_admin'),
  ('tarun@fynhelp.com', 'super_admin'),
  ('nitya@fynny.com', 'super_admin'),
  ('daruna@fynny.com', 'super_admin')
on conflict (email) do nothing;

-- Existing accounts are not given the role here: the role comes only through
-- the emailed invite (see 20261015130000). A Super Admin can add an existing
-- account from Admin Team.
