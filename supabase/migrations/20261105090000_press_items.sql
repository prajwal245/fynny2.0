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
