ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'user';

UPDATE public.bank_transactions
  SET source_type = 'seed'
  WHERE is_demo = true AND source_type = 'user';

CREATE INDEX IF NOT EXISTS bank_transactions_source_type_idx
  ON public.bank_transactions (business_id, source_type);