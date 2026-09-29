
-- Create businesses table
CREATE TABLE public.businesses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_name TEXT NOT NULL,
  gstin TEXT,
  industry TEXT,
  turnover_range TEXT,
  state TEXT,
  msme_udyam TEXT,
  employee_count TEXT,
  business_type TEXT,
  plan TEXT DEFAULT 'starter',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL,
  full_name TEXT,
  mobile TEXT,
  language_preference TEXT DEFAULT 'en',
  role TEXT DEFAULT 'owner',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create bank_accounts table
CREATE TABLE public.bank_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL,
  account_number TEXT,
  balance NUMERIC DEFAULT 0,
  last_sync TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

-- Create transactions table
CREATE TABLE public.transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  bank_account_id UUID REFERENCES public.bank_accounts(id),
  date DATE NOT NULL,
  amount NUMERIC NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  category TEXT,
  description TEXT,
  counterparty TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Create receivables table
CREATE TABLE public.receivables (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  invoice_number TEXT,
  invoice_date DATE,
  due_date DATE,
  amount NUMERIC NOT NULL DEFAULT 0,
  received NUMERIC DEFAULT 0,
  outstanding NUMERIC DEFAULT 0,
  risk_score INTEGER,
  last_chase TIMESTAMPTZ,
  status TEXT DEFAULT 'outstanding',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.receivables ENABLE ROW LEVEL SECURITY;

-- Create payables table
CREATE TABLE public.payables (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  vendor_name TEXT NOT NULL,
  invoice_number TEXT,
  due_date DATE,
  amount NUMERIC NOT NULL DEFAULT 0,
  paid NUMERIC DEFAULT 0,
  outstanding NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payables ENABLE ROW LEVEL SECURITY;

-- Create gst_itc_lines table
CREATE TABLE public.gst_itc_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  itc_safe NUMERIC DEFAULT 0,
  itc_at_risk NUMERIC DEFAULT 0,
  mismatch_count INTEGER DEFAULT 0,
  vendor_gstin TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.gst_itc_lines ENABLE ROW LEVEL SECURITY;

-- Create payroll_records table
CREATE TABLE public.payroll_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  headcount INTEGER DEFAULT 0,
  total_payroll NUMERIC DEFAULT 0,
  pf_due NUMERIC DEFAULT 0,
  esic_due NUMERIC DEFAULT 0,
  next_payroll_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payroll_records ENABLE ROW LEVEL SECURITY;

-- Create compliance_events table
CREATE TABLE public.compliance_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  filing_type TEXT NOT NULL,
  filing_name TEXT NOT NULL,
  due_date DATE NOT NULL,
  status TEXT DEFAULT 'pending',
  urgency TEXT DEFAULT 'normal',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.compliance_events ENABLE ROW LEVEL SECURITY;

-- Create alerts table
CREATE TABLE public.alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  title TEXT NOT NULL,
  body TEXT,
  action_url TEXT,
  dismissed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

-- Create simulations table
CREATE TABLE public.simulations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  scenario_type TEXT NOT NULL,
  parameters JSONB DEFAULT '{}'::jsonb,
  results JSONB DEFAULT '{}'::jsonb,
  shared_link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.simulations ENABLE ROW LEVEL SECURITY;

-- Create nidhi_conversations table
CREATE TABLE public.nidhi_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'nidhi')),
  content TEXT NOT NULL,
  language TEXT DEFAULT 'en',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.nidhi_conversations ENABLE ROW LEVEL SECURITY;

-- Create nidhi_briefs table
CREATE TABLE public.nidhi_briefs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  brief_date DATE NOT NULL DEFAULT CURRENT_DATE,
  content TEXT NOT NULL,
  delivered BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.nidhi_briefs ENABLE ROW LEVEL SECURITY;

-- Create vendor_gst_health table
CREATE TABLE public.vendor_gst_health (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  vendor_name TEXT NOT NULL,
  vendor_gstin TEXT,
  compliance_score INTEGER DEFAULT 0,
  last_filed TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.vendor_gst_health ENABLE ROW LEVEL SECURITY;

-- Create gst_notice_risk_scores table
CREATE TABLE public.gst_notice_risk_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  score INTEGER NOT NULL DEFAULT 0,
  factors JSONB DEFAULT '{}'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.gst_notice_risk_scores ENABLE ROW LEVEL SECURITY;

-- Create receivable_chases table
CREATE TABLE public.receivable_chases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  receivable_id UUID NOT NULL REFERENCES public.receivables(id) ON DELETE CASCADE,
  chase_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  method TEXT DEFAULT 'whatsapp',
  notes TEXT
);
ALTER TABLE public.receivable_chases ENABLE ROW LEVEL SECURITY;

-- Helper function to get user's business_id
CREATE OR REPLACE FUNCTION public.get_user_business_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT business_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
$$;

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers for updated_at
CREATE TRIGGER update_businesses_updated_at BEFORE UPDATE ON public.businesses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for businesses
CREATE POLICY "Users can view own business" ON public.businesses FOR SELECT USING (id = public.get_user_business_id());
CREATE POLICY "Users can update own business" ON public.businesses FOR UPDATE USING (id = public.get_user_business_id());
CREATE POLICY "Authenticated can create business" ON public.businesses FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Macro for business-scoped RLS on all other tables
-- bank_accounts
CREATE POLICY "Business access" ON public.bank_accounts FOR SELECT USING (business_id = public.get_user_business_id());
CREATE POLICY "Business insert" ON public.bank_accounts FOR INSERT WITH CHECK (business_id = public.get_user_business_id());
CREATE POLICY "Business update" ON public.bank_accounts FOR UPDATE USING (business_id = public.get_user_business_id());
CREATE POLICY "Business delete" ON public.bank_accounts FOR DELETE USING (business_id = public.get_user_business_id());

-- transactions
CREATE POLICY "Business access" ON public.transactions FOR SELECT USING (business_id = public.get_user_business_id());
CREATE POLICY "Business insert" ON public.transactions FOR INSERT WITH CHECK (business_id = public.get_user_business_id());
CREATE POLICY "Business update" ON public.transactions FOR UPDATE USING (business_id = public.get_user_business_id());
CREATE POLICY "Business delete" ON public.transactions FOR DELETE USING (business_id = public.get_user_business_id());

-- receivables
CREATE POLICY "Business access" ON public.receivables FOR SELECT USING (business_id = public.get_user_business_id());
CREATE POLICY "Business insert" ON public.receivables FOR INSERT WITH CHECK (business_id = public.get_user_business_id());
CREATE POLICY "Business update" ON public.receivables FOR UPDATE USING (business_id = public.get_user_business_id());
CREATE POLICY "Business delete" ON public.receivables FOR DELETE USING (business_id = public.get_user_business_id());

-- payables
CREATE POLICY "Business access" ON public.payables FOR SELECT USING (business_id = public.get_user_business_id());
CREATE POLICY "Business insert" ON public.payables FOR INSERT WITH CHECK (business_id = public.get_user_business_id());
CREATE POLICY "Business update" ON public.payables FOR UPDATE USING (business_id = public.get_user_business_id());
CREATE POLICY "Business delete" ON public.payables FOR DELETE USING (business_id = public.get_user_business_id());

-- gst_itc_lines
CREATE POLICY "Business access" ON public.gst_itc_lines FOR SELECT USING (business_id = public.get_user_business_id());
CREATE POLICY "Business insert" ON public.gst_itc_lines FOR INSERT WITH CHECK (business_id = public.get_user_business_id());
CREATE POLICY "Business update" ON public.gst_itc_lines FOR UPDATE USING (business_id = public.get_user_business_id());

-- payroll_records
CREATE POLICY "Business access" ON public.payroll_records FOR SELECT USING (business_id = public.get_user_business_id());
CREATE POLICY "Business insert" ON public.payroll_records FOR INSERT WITH CHECK (business_id = public.get_user_business_id());
CREATE POLICY "Business update" ON public.payroll_records FOR UPDATE USING (business_id = public.get_user_business_id());

-- compliance_events
CREATE POLICY "Business access" ON public.compliance_events FOR SELECT USING (business_id = public.get_user_business_id());
CREATE POLICY "Business insert" ON public.compliance_events FOR INSERT WITH CHECK (business_id = public.get_user_business_id());
CREATE POLICY "Business update" ON public.compliance_events FOR UPDATE USING (business_id = public.get_user_business_id());

-- alerts
CREATE POLICY "Business access" ON public.alerts FOR SELECT USING (business_id = public.get_user_business_id());
CREATE POLICY "Business insert" ON public.alerts FOR INSERT WITH CHECK (business_id = public.get_user_business_id());
CREATE POLICY "Business update" ON public.alerts FOR UPDATE USING (business_id = public.get_user_business_id());

-- simulations
CREATE POLICY "Business access" ON public.simulations FOR SELECT USING (business_id = public.get_user_business_id());
CREATE POLICY "Business insert" ON public.simulations FOR INSERT WITH CHECK (business_id = public.get_user_business_id());

-- nidhi_conversations
CREATE POLICY "Business access" ON public.nidhi_conversations FOR SELECT USING (business_id = public.get_user_business_id());
CREATE POLICY "User insert" ON public.nidhi_conversations FOR INSERT WITH CHECK (user_id = auth.uid());

-- nidhi_briefs
CREATE POLICY "Business access" ON public.nidhi_briefs FOR SELECT USING (business_id = public.get_user_business_id());
CREATE POLICY "Business insert" ON public.nidhi_briefs FOR INSERT WITH CHECK (business_id = public.get_user_business_id());

-- vendor_gst_health
CREATE POLICY "Business access" ON public.vendor_gst_health FOR SELECT USING (business_id = public.get_user_business_id());
CREATE POLICY "Business insert" ON public.vendor_gst_health FOR INSERT WITH CHECK (business_id = public.get_user_business_id());
CREATE POLICY "Business update" ON public.vendor_gst_health FOR UPDATE USING (business_id = public.get_user_business_id());

-- gst_notice_risk_scores
CREATE POLICY "Business access" ON public.gst_notice_risk_scores FOR SELECT USING (business_id = public.get_user_business_id());
CREATE POLICY "Business insert" ON public.gst_notice_risk_scores FOR INSERT WITH CHECK (business_id = public.get_user_business_id());

-- receivable_chases (join through receivables)
CREATE POLICY "Chase access" ON public.receivable_chases FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.receivables r WHERE r.id = receivable_id AND r.business_id = public.get_user_business_id())
);
CREATE POLICY "Chase insert" ON public.receivable_chases FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.receivables r WHERE r.id = receivable_id AND r.business_id = public.get_user_business_id())
);
