REVOKE ALL ON FUNCTION public.ca_firm_owns_client(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ca_firm_owns_client(uuid, uuid) TO service_role;
