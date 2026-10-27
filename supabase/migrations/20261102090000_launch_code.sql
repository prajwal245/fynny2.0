-- Launch offer: the first 100 firms get 30 days of free trial. The trial is 14 days from the first upload, so the code
-- adds 16. People arriving from the launch page get it applied automatically when they create their firm.
INSERT INTO public.ca_coupons (code, kind, value, max_redemptions, per_firm_limit, active, note)
VALUES ('FYNLAUNCH30', 'trial_days', 16, 100, 1, true, 'Launch offer: 30 days free for the first 100 firms (14 + 16).')
ON CONFLICT (code) DO NOTHING;
