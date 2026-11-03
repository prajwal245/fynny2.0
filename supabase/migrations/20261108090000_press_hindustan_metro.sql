-- Hindustan Metro coverage of the FynHelp launch. The headline is taken from the article address:
-- check it against the article in Admin, Press & media and correct it there if it differs.
INSERT INTO public.press_items (kind, outlet, headline, url, published_on, logo_url, logo_invert) VALUES
 ('news', 'Hindustan Metro', 'FynHelp Launch: AI Agents for India CA Firms', 'https://hindustanmetro.com/fynhelp-launch-ai-agents-for-india-ca-firms', '2026-11-03', '/press/logos/hindustanmetro.png', false)
ON CONFLICT (url) DO NOTHING;
