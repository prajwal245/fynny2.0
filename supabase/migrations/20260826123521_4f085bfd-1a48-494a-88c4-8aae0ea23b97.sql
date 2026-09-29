-- 1. Custom field values: allow attaching to a CA client record directly
ALTER TABLE public.ca_custom_field_values
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.ca_clients(id) ON DELETE CASCADE;

ALTER TABLE public.ca_custom_field_values ALTER COLUMN business_id DROP NOT NULL;

ALTER TABLE public.ca_custom_field_values
  ADD CONSTRAINT ca_custom_field_values_target_chk
  CHECK (business_id IS NOT NULL OR client_id IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS ca_cfv_field_business_uidx
  ON public.ca_custom_field_values (field_id, business_id) WHERE business_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ca_cfv_field_client_uidx
  ON public.ca_custom_field_values (field_id, client_id) WHERE client_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.ca_firm_owns_client(_firm_id uuid, _client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ca_clients c
    WHERE c.id = _client_id AND c.ca_firm_id = _firm_id
  )
$$;

DROP POLICY IF EXISTS cf_values_select ON public.ca_custom_field_values;
DROP POLICY IF EXISTS cf_values_write ON public.ca_custom_field_values;

CREATE POLICY cf_values_select ON public.ca_custom_field_values
FOR SELECT TO authenticated
USING (
  user_in_ca_firm(ca_firm_id)
  AND (
    (business_id IS NOT NULL AND ca_firm_has_client_access(ca_firm_id, business_id))
    OR (client_id IS NOT NULL AND ca_firm_owns_client(ca_firm_id, client_id))
  )
);

CREATE POLICY cf_values_write ON public.ca_custom_field_values
FOR ALL TO authenticated
USING (
  user_in_ca_firm(ca_firm_id)
  AND ca_can(ca_firm_id, 'manage_clients')
  AND (
    (business_id IS NOT NULL AND ca_firm_has_client_access(ca_firm_id, business_id))
    OR (client_id IS NOT NULL AND ca_firm_owns_client(ca_firm_id, client_id))
  )
)
WITH CHECK (
  user_in_ca_firm(ca_firm_id)
  AND ca_can(ca_firm_id, 'manage_clients')
  AND (
    (business_id IS NOT NULL AND ca_firm_has_client_access(ca_firm_id, business_id))
    OR (client_id IS NOT NULL AND ca_firm_owns_client(ca_firm_id, client_id))
  )
);

-- 2. Firm-level 2FA enforcement flag
ALTER TABLE public.ca_firms
  ADD COLUMN IF NOT EXISTS require_mfa boolean NOT NULL DEFAULT false;

-- 3. Integration auto-sync settings
ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS auto_sync_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_sync_frequency text NOT NULL DEFAULT 'daily',
  ADD COLUMN IF NOT EXISTS last_auto_sync_at timestamptz;
