-- Callback requests submitted from the pricing page popup
CREATE TABLE public.callback_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  phone TEXT NOT NULL,
  name TEXT,
  source TEXT NOT NULL DEFAULT 'pricing_popup',
  status TEXT NOT NULL DEFAULT 'new',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Validate Indian phone numbers (10 digits, optional +91)
CREATE OR REPLACE FUNCTION public.validate_callback_phone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  digits TEXT;
BEGIN
  digits := regexp_replace(coalesce(NEW.phone, ''), '\D', '', 'g');
  IF length(digits) = 12 AND left(digits, 2) = '91' THEN
    digits := substring(digits FROM 3);
  END IF;
  IF length(digits) <> 10 OR substring(digits FROM 1 FOR 1) NOT IN ('6','7','8','9') THEN
    RAISE EXCEPTION 'invalid Indian phone number';
  END IF;
  NEW.phone := digits;
  IF NEW.name IS NOT NULL THEN
    NEW.name := nullif(btrim(NEW.name), '');
    IF NEW.name IS NOT NULL AND length(NEW.name) > 100 THEN
      RAISE EXCEPTION 'name too long';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_callback_phone
BEFORE INSERT OR UPDATE ON public.callback_requests
FOR EACH ROW EXECUTE FUNCTION public.validate_callback_phone();

CREATE TRIGGER trg_callback_requests_updated_at
BEFORE UPDATE ON public.callback_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.callback_requests ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon visitors) can submit a callback request
CREATE POLICY "Anyone can submit a callback request"
ON public.callback_requests
FOR INSERT
TO anon, authenticated
WITH CHECK (
  -- If user is logged in, user_id must match; if anon, must be null
  (auth.uid() IS NULL AND user_id IS NULL)
  OR (auth.uid() IS NOT NULL AND user_id = auth.uid())
);

-- Users can view their own requests
CREATE POLICY "Users can view their own callback requests"
ON public.callback_requests
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Admins can view/update all
CREATE POLICY "Admins can view all callback requests"
ON public.callback_requests
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update callback requests"
ON public.callback_requests
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_callback_requests_created_at ON public.callback_requests (created_at DESC);
CREATE INDEX idx_callback_requests_user_id ON public.callback_requests (user_id);