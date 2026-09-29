-- Baseline for tables that exist in the live database but were never created
-- by a migration (they were made directly in the hosted project). Without
-- this, a fresh Supabase project cannot be built from supabase/migrations.
-- Every statement is IF NOT EXISTS, so on the existing database this is a no-op.
-- Columns mirror src/integrations/supabase/types.ts.

CREATE TABLE IF NOT EXISTS public.ca_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  business_id uuid,
  client_name text NOT NULL,
  client_email text,
  client_phone text,
  client_status text DEFAULT 'active',
  entity_type text NOT NULL DEFAULT 'Private Limited',
  entity_subtype text,
  gstin text,
  pan text,
  cin text,
  llpin text,
  dpiit_number text,
  udyam_number text,
  incorporation_date date,
  group_id uuid,
  parent_id uuid REFERENCES public.ca_clients(id) ON DELETE SET NULL,
  ownership_pct numeric,
  assigned_to uuid,
  notes text,
  is_demo boolean DEFAULT false,
  onboarded_at timestamptz,
  last_activity_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ca_clients_firm_idx ON public.ca_clients (ca_firm_id);
CREATE INDEX IF NOT EXISTS ca_clients_business_idx ON public.ca_clients (business_id);
ALTER TABLE public.ca_clients ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.ca_client_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  invited_email text NOT NULL,
  client_name text,
  access_level text DEFAULT 'read_only',
  status text DEFAULT 'pending',
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  notes text,
  sent_by uuid,
  expires_at timestamptz DEFAULT (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.ca_client_invitations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.ca_approval_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  action text NOT NULL,
  reason text,
  reviewed_by_email text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.ca_approval_log ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.waitlist_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  full_name text,
  business_name text,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.waitlist_signups ENABLE ROW LEVEL SECURITY;

-- Column added directly in the hosted project.
ALTER TABLE public.ca_firms ADD COLUMN IF NOT EXISTS ca_name text;
