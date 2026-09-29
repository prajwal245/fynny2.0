CREATE OR REPLACE FUNCTION public.enforce_ca_message_sender_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_ca boolean;
  v_is_business boolean;
BEGIN
  -- Normalise legacy sender_type values used by the portal UI.
  IF NEW.sender_type IN ('ca', 'ca_firm') THEN
    NEW.sender_type := 'ca_firm';
  ELSIF NEW.sender_type IN ('client', 'business') THEN
    NEW.sender_type := 'business';
  ELSE
    RAISE EXCEPTION 'invalid sender_type' USING ERRCODE = '22023';
  END IF;

  -- Automated/system inserts (cron, server-side jobs) run as service_role.
  IF auth.uid() IS NULL AND current_setting('request.jwt.claims', true) IS NULL THEN
    IF NEW.sender_type <> 'ca_firm' THEN
      RAISE EXCEPTION 'system messages must be sent as the CA firm' USING ERRCODE = '42501';
    END IF;
    IF NEW.sender_id IS NULL THEN
      SELECT f.user_id INTO NEW.sender_id FROM public.ca_firms f WHERE f.id = NEW.ca_firm_id;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.sender_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'sender_id must match authenticated user' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.ca_firms f WHERE f.id = NEW.ca_firm_id AND f.user_id = auth.uid()
    UNION
    SELECT 1 FROM public.ca_firm_members m
      WHERE m.ca_firm_id = NEW.ca_firm_id AND m.user_id = auth.uid() AND m.status = 'active'
  ) INTO v_is_ca;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.business_id = NEW.business_id
  ) INTO v_is_business;

  IF NEW.sender_type = 'ca_firm' AND NOT v_is_ca THEN
    RAISE EXCEPTION 'sender_type ca_firm requires membership in the CA firm' USING ERRCODE = '42501';
  ELSIF NEW.sender_type = 'business' AND NOT v_is_business THEN
    RAISE EXCEPTION 'sender_type business requires ownership of the business' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;