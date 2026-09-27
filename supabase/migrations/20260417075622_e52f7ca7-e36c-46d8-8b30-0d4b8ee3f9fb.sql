-- =====================================================
-- CA PARTNER PORTAL — schema
-- =====================================================

-- 1. CA firms
CREATE TABLE public.ca_firms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  firm_name TEXT NOT NULL,
  membership_number TEXT,
  phone TEXT,
  email TEXT,
  city TEXT,
  state TEXT DEFAULT 'karnataka',
  is_verified BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  plan_type TEXT DEFAULT 'ca_partner',
  max_clients INTEGER DEFAULT 50,
  whatsapp_phone TEXT,
  logo_url TEXT,
  notification_prefs JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. CA <-> Client mapping
CREATE TABLE public.ca_client_access (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ca_firm_id UUID REFERENCES public.ca_firms(id) ON DELETE CASCADE NOT NULL,
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE NOT NULL,
  access_level TEXT DEFAULT 'read_only' CHECK (access_level IN (
    'read_only','full_read','report_download','data_entry'
  )),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  granted_by UUID REFERENCES auth.users(id),
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  CONSTRAINT uq_ca_client UNIQUE (ca_firm_id, business_id)
);

-- 3. Activity log
CREATE TABLE public.ca_activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ca_firm_id UUID REFERENCES public.ca_firms(id) ON DELETE CASCADE NOT NULL,
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. CA notifications
CREATE TABLE public.ca_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ca_firm_id UUID REFERENCES public.ca_firms(id) ON DELETE CASCADE NOT NULL,
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. CA firm members (team)
CREATE TABLE public.ca_firm_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ca_firm_id UUID REFERENCES public.ca_firms(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_email TEXT NOT NULL,
  role TEXT DEFAULT 'staff' CHECK (role IN ('partner','manager','senior','junior','staff')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','active','revoked')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Reports log
CREATE TABLE public.ca_reports_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ca_firm_id UUID REFERENCES public.ca_firms(id) ON DELETE CASCADE NOT NULL,
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL,
  period TEXT,
  file_url TEXT,
  sent_to TEXT,
  status TEXT DEFAULT 'generated',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- Helper function: get current user's ca_firm_id
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_user_ca_firm_id()
RETURNS UUID
LANGUAGE SQL
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.ca_firms WHERE user_id = auth.uid() LIMIT 1
$$;

-- =====================================================
-- Enable RLS
-- =====================================================
ALTER TABLE public.ca_firms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_client_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_firm_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_reports_log ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- Policies
-- =====================================================

-- ca_firms: only owner
CREATE POLICY "CA firm self select" ON public.ca_firms
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "CA firm self insert" ON public.ca_firms
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "CA firm self update" ON public.ca_firms
  FOR UPDATE USING (user_id = auth.uid());

-- ca_client_access: only the owning CA firm
CREATE POLICY "CA access select" ON public.ca_client_access
  FOR SELECT USING (ca_firm_id = public.get_user_ca_firm_id());
CREATE POLICY "CA access insert" ON public.ca_client_access
  FOR INSERT WITH CHECK (ca_firm_id = public.get_user_ca_firm_id());
CREATE POLICY "CA access update" ON public.ca_client_access
  FOR UPDATE USING (ca_firm_id = public.get_user_ca_firm_id());
CREATE POLICY "CA access delete" ON public.ca_client_access
  FOR DELETE USING (ca_firm_id = public.get_user_ca_firm_id());

-- ca_activity_log: only the owning CA firm
CREATE POLICY "CA activity select" ON public.ca_activity_log
  FOR SELECT USING (ca_firm_id = public.get_user_ca_firm_id());
CREATE POLICY "CA activity insert" ON public.ca_activity_log
  FOR INSERT WITH CHECK (ca_firm_id = public.get_user_ca_firm_id());

-- ca_notifications: only the owning CA firm
CREATE POLICY "CA notif select" ON public.ca_notifications
  FOR SELECT USING (ca_firm_id = public.get_user_ca_firm_id());
CREATE POLICY "CA notif insert" ON public.ca_notifications
  FOR INSERT WITH CHECK (ca_firm_id = public.get_user_ca_firm_id());
CREATE POLICY "CA notif update" ON public.ca_notifications
  FOR UPDATE USING (ca_firm_id = public.get_user_ca_firm_id());

-- ca_firm_members: visible to all members of same firm
CREATE POLICY "CA member select" ON public.ca_firm_members
  FOR SELECT USING (ca_firm_id = public.get_user_ca_firm_id());
CREATE POLICY "CA member insert" ON public.ca_firm_members
  FOR INSERT WITH CHECK (ca_firm_id = public.get_user_ca_firm_id());
CREATE POLICY "CA member update" ON public.ca_firm_members
  FOR UPDATE USING (ca_firm_id = public.get_user_ca_firm_id());
CREATE POLICY "CA member delete" ON public.ca_firm_members
  FOR DELETE USING (ca_firm_id = public.get_user_ca_firm_id());

-- ca_reports_log: only the owning CA firm
CREATE POLICY "CA reports select" ON public.ca_reports_log
  FOR SELECT USING (ca_firm_id = public.get_user_ca_firm_id());
CREATE POLICY "CA reports insert" ON public.ca_reports_log
  FOR INSERT WITH CHECK (ca_firm_id = public.get_user_ca_firm_id());

-- =====================================================
-- updated_at trigger on ca_firms
-- =====================================================
CREATE TRIGGER ca_firms_set_updated_at
  BEFORE UPDATE ON public.ca_firms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- Indexes
-- =====================================================
CREATE INDEX idx_ca_client_access_firm ON public.ca_client_access(ca_firm_id) WHERE is_active = TRUE;
CREATE INDEX idx_ca_client_access_business ON public.ca_client_access(business_id);
CREATE INDEX idx_ca_notif_firm_unread ON public.ca_notifications(ca_firm_id, is_read, created_at DESC);
CREATE INDEX idx_ca_activity_firm ON public.ca_activity_log(ca_firm_id, created_at DESC);
CREATE INDEX idx_ca_reports_firm ON public.ca_reports_log(ca_firm_id, created_at DESC);