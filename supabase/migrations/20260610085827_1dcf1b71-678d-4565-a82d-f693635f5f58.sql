
-- 1. Add is_demo column to the 8 demo-capable tables
ALTER TABLE public.customers         ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.vendors           ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.invoices          ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.expenses          ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.bank_transactions ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.employees_demo    ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.gst_filings_demo  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.clients           ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

-- 2. Flag existing seed (single demo business id) as demo
UPDATE public.customers         SET is_demo = true WHERE business_id = '4b30494f-4c30-4a74-a6bb-6bf56493a97d';
UPDATE public.vendors           SET is_demo = true WHERE business_id = '4b30494f-4c30-4a74-a6bb-6bf56493a97d';
UPDATE public.invoices          SET is_demo = true WHERE business_id = '4b30494f-4c30-4a74-a6bb-6bf56493a97d';
UPDATE public.expenses          SET is_demo = true WHERE business_id = '4b30494f-4c30-4a74-a6bb-6bf56493a97d';
UPDATE public.bank_transactions SET is_demo = true WHERE business_id = '4b30494f-4c30-4a74-a6bb-6bf56493a97d';
UPDATE public.employees_demo    SET is_demo = true WHERE business_id = '4b30494f-4c30-4a74-a6bb-6bf56493a97d';
UPDATE public.gst_filings_demo  SET is_demo = true WHERE business_id = '4b30494f-4c30-4a74-a6bb-6bf56493a97d';
UPDATE public.clients           SET is_demo = true WHERE business_id = '4b30494f-4c30-4a74-a6bb-6bf56493a97d';

-- 3. Grant SELECT to anon (RLS will still gate per-row)
GRANT SELECT ON public.customers         TO anon;
GRANT SELECT ON public.vendors           TO anon;
GRANT SELECT ON public.invoices          TO anon;
GRANT SELECT ON public.expenses          TO anon;
GRANT SELECT ON public.bank_transactions TO anon;
GRANT SELECT ON public.employees_demo    TO anon;
GRANT SELECT ON public.gst_filings_demo  TO anon;
GRANT SELECT ON public.clients           TO anon;

-- 4. Public read policy: anyone (anon or authenticated) can SELECT demo rows
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['customers','vendors','invoices','expenses','bank_transactions','employees_demo','gst_filings_demo','clients']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%I demo public read" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "%I demo public read" ON public.%I FOR SELECT TO anon, authenticated USING (is_demo = true)',
      t, t
    );
  END LOOP;
END$$;
