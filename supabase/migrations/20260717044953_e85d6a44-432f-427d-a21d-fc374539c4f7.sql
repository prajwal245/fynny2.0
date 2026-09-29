
-- Fix 1: ca_access_requests
DROP POLICY IF EXISTS "Business owner can respond to requests" ON public.ca_access_requests;
CREATE POLICY "Business owner can respond to requests"
ON public.ca_access_requests
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = public.get_user_business_id()
      AND b.gstin IS NOT NULL
      AND b.gstin = ca_access_requests.target_gstin
  )
  AND status = 'pending'
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = public.get_user_business_id()
      AND b.gstin IS NOT NULL
      AND b.gstin = ca_access_requests.target_gstin
  )
  AND status IN ('approved','rejected')
);

CREATE OR REPLACE FUNCTION public.enforce_ca_access_request_immutable_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow senior admins full control
  IF public.is_senior_admin() THEN
    RETURN NEW;
  END IF;

  -- If the caller is the requesting CA firm, existing policy already restricts to cancel; allow.
  IF NEW.ca_firm_id = public.get_user_ca_firm_id() AND OLD.ca_firm_id = NEW.ca_firm_id THEN
    RETURN NEW;
  END IF;

  -- Otherwise (business owner responding): enforce immutability of key fields
  IF NEW.ca_firm_id IS DISTINCT FROM OLD.ca_firm_id
     OR NEW.target_gstin IS DISTINCT FROM OLD.target_gstin
     OR NEW.target_email IS DISTINCT FROM OLD.target_email
     OR NEW.access_level IS DISTINCT FROM OLD.access_level
     OR NEW.business_id IS DISTINCT FROM COALESCE(OLD.business_id, NEW.business_id)
     OR NEW.message IS DISTINCT FROM OLD.message
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Only status/response fields may be updated on ca_access_requests' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_ca_access_request_immutable_fields_trg ON public.ca_access_requests;
CREATE TRIGGER enforce_ca_access_request_immutable_fields_trg
BEFORE UPDATE ON public.ca_access_requests
FOR EACH ROW EXECUTE FUNCTION public.enforce_ca_access_request_immutable_fields();

-- Fix 2: ca_client_messages sender_type enforcement
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
  ELSIF NEW.sender_type NOT IN ('ca_firm','business') THEN
    RAISE EXCEPTION 'invalid sender_type' USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_ca_message_sender_type_trg ON public.ca_client_messages;
CREATE TRIGGER enforce_ca_message_sender_type_trg
BEFORE INSERT OR UPDATE OF sender_type, sender_id ON public.ca_client_messages
FOR EACH ROW EXECUTE FUNCTION public.enforce_ca_message_sender_type();
