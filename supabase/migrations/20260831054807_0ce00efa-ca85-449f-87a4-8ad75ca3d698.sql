UPDATE public.bank_transactions SET source_type = 'import' WHERE source_type = 'user';
UPDATE public.bank_transactions SET source_type = 'seed' WHERE created_at < '2026-08-01';
ALTER TABLE public.bank_transactions ALTER COLUMN source_type SET DEFAULT 'import';
ALTER TABLE public.bank_transactions DROP CONSTRAINT IF EXISTS bank_transactions_source_type_check;
ALTER TABLE public.bank_transactions ADD CONSTRAINT bank_transactions_source_type_check CHECK (source_type IN ('import','razorpay','zoho','manual','seed'));