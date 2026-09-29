ALTER TABLE public.ca_firm_members ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
UPDATE public.ca_firm_members SET is_active = (status = 'active') WHERE is_active IS NULL;