-- 1. Access check relies on active grant only
CREATE OR REPLACE FUNCTION public.ca_firm_has_client_access(_firm_id uuid, _business_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _firm_id IS NOT NULL AND _business_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.ca_client_access cca
    WHERE cca.ca_firm_id = _firm_id AND cca.business_id = _business_id AND cca.is_active = true
  );
$$;

-- 2. ca_clients policies
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_clients TO authenticated;
GRANT ALL ON public.ca_clients TO service_role;
ALTER TABLE public.ca_clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "CA firm manages own clients" ON public.ca_clients;
CREATE POLICY "CA firm manages own clients" ON public.ca_clients FOR ALL TO authenticated
  USING (ca_firm_id = public.get_user_ca_firm_id())
  WITH CHECK (ca_firm_id = public.get_user_ca_firm_id());

-- 3. ca_client_invitations policies
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_client_invitations TO authenticated;
GRANT ALL ON public.ca_client_invitations TO service_role;
ALTER TABLE public.ca_client_invitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "CA firm manages own invitations" ON public.ca_client_invitations;
CREATE POLICY "CA firm manages own invitations" ON public.ca_client_invitations FOR ALL TO authenticated
  USING (ca_firm_id = public.get_user_ca_firm_id())
  WITH CHECK (ca_firm_id = public.get_user_ca_firm_id());

-- 4. Firm owner may create their own first membership row
DROP POLICY IF EXISTS "CA firm owner self membership" ON public.ca_firm_members;
CREATE POLICY "CA firm owner self membership" ON public.ca_firm_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.ca_firms f WHERE f.id = ca_firm_id AND f.user_id = auth.uid())
  );

-- 5. Invitation lookup / accept / decline (security definer, token-scoped)
CREATE OR REPLACE FUNCTION public.get_ca_invitation(_token uuid)
RETURNS TABLE (firm_name text, client_name text, access_level text, status text, expires_at timestamptz, invited_email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT f.firm_name, i.client_name, i.access_level, i.status, i.expires_at, i.invited_email
  FROM public.ca_client_invitations i
  JOIN public.ca_firms f ON f.id = i.ca_firm_id
  WHERE i.token = _token
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.decline_ca_invitation(_token uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE inv public.ca_client_invitations;
BEGIN
  SELECT * INTO inv FROM public.ca_client_invitations WHERE token = _token;
  IF inv IS NULL THEN RETURN 'not_found'; END IF;
  IF inv.status <> 'pending' THEN RETURN inv.status; END IF;
  UPDATE public.ca_client_invitations SET status = 'declined' WHERE id = inv.id;
  RETURN 'declined';
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_ca_invitation(_token uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  inv public.ca_client_invitations;
  biz uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN 'not_authenticated'; END IF;
  SELECT * INTO inv FROM public.ca_client_invitations WHERE token = _token;
  IF inv IS NULL THEN RETURN 'not_found'; END IF;
  IF inv.status <> 'pending' THEN RETURN 'not_pending'; END IF;
  IF inv.expires_at IS NOT NULL AND inv.expires_at < now() THEN RETURN 'expired'; END IF;

  SELECT business_id INTO biz FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  IF biz IS NULL THEN RETURN 'no_business'; END IF;

  INSERT INTO public.ca_client_access (ca_firm_id, business_id, access_level, granted_at, granted_by, is_active)
  VALUES (inv.ca_firm_id, biz, COALESCE(inv.access_level, 'read'), now(), auth.uid(), true);

  UPDATE public.ca_client_invitations
     SET status = 'accepted', accepted_at = now(), business_id = biz
   WHERE id = inv.id;

  UPDATE public.ca_clients
     SET business_id = biz, client_status = 'active', last_activity_at = now()
   WHERE ca_firm_id = inv.ca_firm_id AND lower(client_email) = lower(inv.invited_email);

  RETURN 'accepted';
END;
$$;

REVOKE ALL ON FUNCTION public.get_ca_invitation(uuid) FROM public;
REVOKE ALL ON FUNCTION public.accept_ca_invitation(uuid) FROM public;
REVOKE ALL ON FUNCTION public.decline_ca_invitation(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_ca_invitation(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_ca_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_ca_invitation(uuid) TO anon, authenticated;