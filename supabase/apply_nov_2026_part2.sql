-- FynHelp: November 2026 database changes, part 2 of 2. Run after part 1. Safe to run again.
-- Adds: sign-up source tracking, the Press & media table, the Content Collaborator access, first and last click campaign tags.

-- ===== 20261104090000_firm_attribution =====
-- Where each firm came from, kept with the firm itself (first touch), so source reports do not depend on a
-- visitor accepting analytics cookies. Only campaign tags and the referring site's host: no personal data.
-- Written by the server when the firm is created; best effort, so a failure here never blocks a sign-up.

ALTER TABLE public.ca_firms
  ADD COLUMN IF NOT EXISTS signup_channel text,
  ADD COLUMN IF NOT EXISTS signup_source text,
  ADD COLUMN IF NOT EXISTS signup_medium text,
  ADD COLUMN IF NOT EXISTS signup_campaign text,
  ADD COLUMN IF NOT EXISTS signup_content text,
  ADD COLUMN IF NOT EXISTS signup_term text,
  ADD COLUMN IF NOT EXISTS signup_landing text,
  ADD COLUMN IF NOT EXISTS signup_referrer_host text,
  ADD COLUMN IF NOT EXISTS signup_ref_code text,
  ADD COLUMN IF NOT EXISTS signup_attributed_at timestamptz;

CREATE INDEX IF NOT EXISTS ca_firms_signup_channel_idx ON public.ca_firms (signup_channel, created_at);

-- ===== 20261105090000_press_items =====
-- Media & press: the articles and press releases shown on /press and in the home page "Featured in" strip.
-- Added by hand in Admin, Press, or automatically through the key-protected endpoint /api/public/press-ingest.
-- Anyone can read published rows (the page is public); only the server (service role) can write.

CREATE TABLE IF NOT EXISTS public.press_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'news' CHECK (kind IN ('news', 'release')),
  outlet text NOT NULL,
  headline text NOT NULL,
  summary text,
  -- The article's address: https://... for an outlet, or a path on this site (/blog/...) for our own release.
  url text NOT NULL UNIQUE CHECK (url ~ '^(https://|/)'),
  published_on date NOT NULL DEFAULT current_date,
  logo_url text,
  -- The logo file is white-on-dark and should be shown black on the light page.
  logo_invert boolean NOT NULL DEFAULT false,
  image_url text,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
  source text NOT NULL DEFAULT 'admin' CHECK (source IN ('admin', 'auto')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS press_items_published_idx ON public.press_items (status, published_on DESC);

ALTER TABLE public.press_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public reads published press" ON public.press_items;
CREATE POLICY "Public reads published press" ON public.press_items FOR SELECT TO anon, authenticated USING (status = 'published');
REVOKE ALL ON public.press_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.press_items TO anon, authenticated;
GRANT ALL ON public.press_items TO service_role;

-- The launch coverage already on the site, so it can be edited in Admin.
INSERT INTO public.press_items (kind, outlet, headline, url, published_on, logo_url, logo_invert) VALUES
 ('news', 'Dailyhunt', 'Every Month, India''s CA Firms Lose a Week to Reconciliation. FynHelp Launches to Win It Back', 'https://m.dailyhunt.in/news/india/english/r+news+india-epaper-dhfacc36dfce9c4bb68db0e89d033c921b/every+month+indias+ca+firms+lose+a+week+to+reconciliation+fynhelp+launches+to+win+it+back-newsid-dhfacc36dfce9c4bb68db0e89d033c921b_2299f150d68311f181fe103af9ee8acf?sm=Y', '2026-11-02', 'https://res.cloudinary.com/ghxledou/image/upload/v1793602195/logo_desktop_dark.svg', true),
 ('news', 'Wow Entrepreneurs', 'Every Month, India''s CA Firms Lose a Week to Reconciliation. FynHelp Launches to Win It Back', 'https://wowentrepreneurs.com/every-month-indias-ca-firms-lose-a-week-to-reconciliation-fynhelp-launches-to-win-it-back/', '2026-11-02', 'https://res.cloudinary.com/ghxledou/image/upload/v1793602195/Wow-Entrepreneurs-Logo-PNG.png', false),
 ('news', 'Deccan Business', 'Every Month, India''s CA Firms Lose a Week to Reconciliation. FynHelp Launches to Win It Back', 'https://deccanbusiness.com/every-month-indias-ca-firms-lose-a-week-to-reconciliation-fynhelp-launches-to-win-it-back/', '2026-11-02', 'https://res.cloudinary.com/ghxledou/image/upload/v1793602195/Deccan-Business-PNG-300x104.png', false),
 ('news', 'Business Reporter', 'Every Month, India''s CA Firms Lose a Week to Reconciliation. FynHelp Launches to Win It Back', 'https://businessreporter.in/every-month-indias-ca-firms-lose-a-week-to-reconciliation-fynhelp-launches-to-win-it-back/', '2026-11-02', 'https://res.cloudinary.com/ghxledou/image/upload/v1793602654/Unconfirmed_848793.png', false),
 ('news', 'Republic News India', 'Every Month, India''s CA Firms Lose a Week to Reconciliation. FynHelp Launches to Win It Back', 'https://business.republicnewsindia.com/every-month-indias-ca-firms-lose-a-week-to-reconciliation-fynhelp-launches-to-win-it-back/', '2026-11-02', 'https://res.cloudinary.com/ghxledou/image/upload/v1793602195/cropped-Republic-News-India-New-Logo-PNG.png', false),
 ('news', 'The Indian Bulletin', 'Every Month, India''s CA Firms Lose a Week to Reconciliation. FynHelp Launches to Win It Back', 'https://biz.theindianbulletin.com/every-month-indias-ca-firms-lose-a-week-to-reconciliation-fynhelp-launches-to-win-it-back/', '2026-11-02', 'https://res.cloudinary.com/ghxledou/image/upload/v1793602195/cropped-The-Indian-Bulletin-LOGO-PNG.png', false),
 ('news', 'Orange City Times', 'CA Firms Don''t Need Another Accounting Software. FynHelp Is Betting Its Launch on It', 'https://orangecitytimes.com/ca-firms-dont-need-another-accounting-software-fynhelp-is-betting-its-launch-on-it/', '2026-11-02', NULL, false),
 ('news', 'Prime Post Daily', 'CA Firms Don''t Need Another Accounting Software. FynHelp Is Betting Its Launch on It', 'https://primepostdaily.com/ca-firms-dont-need-another-accounting-software-fynhelp-is-betting-its-launch-on-it/', '2026-11-02', NULL, false),
 ('news', 'Nation News Brief', 'The Junior Accountant''s Job Is About to Change. FynHelp''s Launch Shows What Comes Next', 'https://www.nationnewsbrief.com/the-junior-accountants-job-is-about-to-change-fynhelps-launch-shows-what-comes-next/', '2026-11-02', NULL, false)
ON CONFLICT (url) DO NOTHING;

-- ===== 20261106090100_content_collaborator_access =====
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

-- ===== 20261107090000_lead_attribution =====
-- First click and last click campaign tags for each firm (utm_source, utm_medium, utm_campaign, utm_content,
-- utm_term, utm_id, gclid, fbclid, landing page), saved when the firm is created. Written by the server.
ALTER TABLE public.ca_firms ADD COLUMN IF NOT EXISTS lead_attribution jsonb;

