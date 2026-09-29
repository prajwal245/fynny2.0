CREATE TABLE IF NOT EXISTS public.demo_transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id text NOT NULL,
  date date NOT NULL,
  description text NOT NULL,
  amount numeric NOT NULL,
  type text NOT NULL CHECK (type IN ('inflow', 'outflow', 'subscription', 'expense', 'salary', 'purchase', 'sale')),
  category text,
  vendor text,
  customer text,
  invoice_number text,
  gst_amount numeric DEFAULT 0,
  payment_method text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_demo_transactions_org ON public.demo_transactions(organization_id);
CREATE INDEX IF NOT EXISTS idx_demo_transactions_date ON public.demo_transactions(date DESC);
CREATE INDEX IF NOT EXISTS idx_demo_transactions_type ON public.demo_transactions(type);
CREATE INDEX IF NOT EXISTS idx_demo_transactions_category ON public.demo_transactions(category);

ALTER TABLE public.demo_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations for demo"
ON public.demo_transactions
FOR ALL
USING (true)
WITH CHECK (true);

CREATE TRIGGER update_demo_transactions_updated_at
BEFORE UPDATE ON public.demo_transactions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.demo_transactions IS 'Demo transaction data for FYNHelp CFO Intelligence calculations';
COMMENT ON COLUMN public.demo_transactions.type IS 'Transaction type: inflow, outflow, subscription, expense, salary, purchase, sale';
COMMENT ON COLUMN public.demo_transactions.amount IS 'Transaction amount in paisa (multiply by 100 for rupees)';