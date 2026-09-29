DROP POLICY "CA access update" ON public.ca_client_access;
CREATE POLICY "CA access update" ON public.ca_client_access
FOR UPDATE TO authenticated
USING (ca_firm_id = get_user_ca_firm_id())
WITH CHECK (ca_firm_id = get_user_ca_firm_id());

CREATE OR REPLACE FUNCTION public.prevent_ca_client_access_repoint()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NEW.business_id IS DISTINCT FROM OLD.business_id
     OR NEW.ca_firm_id IS DISTINCT FROM OLD.ca_firm_id THEN
    RAISE EXCEPTION 'Cannot change the firm or client on an existing access grant';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_ca_client_access_repoint ON public.ca_client_access;
CREATE TRIGGER trg_prevent_ca_client_access_repoint
BEFORE UPDATE ON public.ca_client_access
FOR EACH ROW EXECUTE FUNCTION public.prevent_ca_client_access_repoint();