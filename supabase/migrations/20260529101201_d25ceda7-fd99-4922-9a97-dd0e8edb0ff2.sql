
-- 1. auth_link_events: constrain INSERT to expected values + length caps
DROP POLICY IF EXISTS "Anyone can log auth link events" ON public.auth_link_events;
CREATE POLICY "Anyone can log auth link events"
  ON public.auth_link_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    reason IN ('expired','used','invalid','unknown','verified')
    AND source IN ('url','supabase')
    AND flow IN ('password_recovery','email_verification','magic_link','invite','signup','recovery')
    AND (error_code IS NULL OR length(error_code) <= 128)
    AND (description IS NULL OR length(description) <= 500)
    AND (route IS NULL OR length(route) <= 256)
    AND (user_agent IS NULL OR length(user_agent) <= 500)
  );

-- 2. businesses: tie INSERT to creator via trigger that creates/updates profile,
-- and allow owners to delete their own business.
CREATE OR REPLACE FUNCTION public.link_business_to_creator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'must be authenticated to create a business';
  END IF;

  -- Ensure profile exists and is linked to this business
  INSERT INTO public.profiles (user_id, business_id)
  VALUES (auth.uid(), NEW.id)
  ON CONFLICT (user_id) DO UPDATE
    SET business_id = COALESCE(public.profiles.business_id, EXCLUDED.business_id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_link_business_to_creator ON public.businesses;
CREATE TRIGGER trg_link_business_to_creator
AFTER INSERT ON public.businesses
FOR EACH ROW EXECUTE FUNCTION public.link_business_to_creator();

CREATE POLICY "Owners can delete own business"
  ON public.businesses
  FOR DELETE
  TO authenticated
  USING (id = public.get_user_business_id());

-- 3. ca_client_access: business owners can view + revoke
CREATE POLICY "Business owner can view CA access"
  ON public.ca_client_access
  FOR SELECT
  TO authenticated
  USING (business_id = public.get_user_business_id());

CREATE POLICY "Business owner can revoke CA access"
  ON public.ca_client_access
  FOR DELETE
  TO authenticated
  USING (business_id = public.get_user_business_id());

-- 4. realtime_event_log: allow users to read their own emitted events
CREATE POLICY "Users read own realtime events"
  ON public.realtime_event_log
  FOR SELECT
  TO authenticated
  USING (emitted_by = auth.uid());
