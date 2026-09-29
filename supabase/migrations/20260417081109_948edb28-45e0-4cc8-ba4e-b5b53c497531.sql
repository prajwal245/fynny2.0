-- Table for pending CA-to-business access requests
CREATE TABLE public.ca_access_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ca_firm_id UUID NOT NULL,
  target_gstin TEXT NOT NULL,
  target_email TEXT,
  business_id UUID, -- resolved when business is matched
  access_level TEXT NOT NULL DEFAULT 'read_only',
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected | cancelled
  responded_by UUID,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_car_ca_firm ON public.ca_access_requests(ca_firm_id);
CREATE INDEX idx_car_gstin ON public.ca_access_requests(target_gstin);
CREATE INDEX idx_car_business ON public.ca_access_requests(business_id);
CREATE INDEX idx_car_status ON public.ca_access_requests(status);

ALTER TABLE public.ca_access_requests ENABLE ROW LEVEL SECURITY;

-- CA firm: create + view + cancel own requests
CREATE POLICY "CA firm can create requests"
ON public.ca_access_requests FOR INSERT
WITH CHECK (ca_firm_id = public.get_user_ca_firm_id());

CREATE POLICY "CA firm can view own requests"
ON public.ca_access_requests FOR SELECT
USING (ca_firm_id = public.get_user_ca_firm_id());

CREATE POLICY "CA firm can cancel own pending requests"
ON public.ca_access_requests FOR UPDATE
USING (ca_firm_id = public.get_user_ca_firm_id());

-- Business owner: view + respond to requests targeting their business
-- Match by GSTIN of the user's business
CREATE POLICY "Business owner can view targeting requests"
ON public.ca_access_requests FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = public.get_user_business_id()
      AND b.gstin IS NOT NULL
      AND b.gstin = ca_access_requests.target_gstin
  )
);

CREATE POLICY "Business owner can respond to requests"
ON public.ca_access_requests FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = public.get_user_business_id()
      AND b.gstin IS NOT NULL
      AND b.gstin = ca_access_requests.target_gstin
  )
);

-- Updated-at trigger
CREATE TRIGGER update_ca_access_requests_updated_at
BEFORE UPDATE ON public.ca_access_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- When a business owner approves a request, auto-create the access grant
CREATE OR REPLACE FUNCTION public.handle_ca_request_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_business_id UUID;
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    -- Resolve business by GSTIN
    SELECT id INTO v_business_id
    FROM public.businesses
    WHERE gstin = NEW.target_gstin
    LIMIT 1;

    IF v_business_id IS NOT NULL THEN
      NEW.business_id := v_business_id;
      NEW.responded_by := auth.uid();
      NEW.responded_at := now();

      INSERT INTO public.ca_client_access (ca_firm_id, business_id, access_level, granted_by, is_active)
      VALUES (NEW.ca_firm_id, v_business_id, NEW.access_level, auth.uid(), true)
      ON CONFLICT DO NOTHING;
    END IF;
  ELSIF NEW.status = 'rejected' AND (OLD.status IS DISTINCT FROM 'rejected') THEN
    NEW.responded_by := auth.uid();
    NEW.responded_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ca_request_approval_trigger
BEFORE UPDATE ON public.ca_access_requests
FOR EACH ROW
EXECUTE FUNCTION public.handle_ca_request_approval();