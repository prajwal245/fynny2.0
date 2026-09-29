REVOKE ALL ON FUNCTION public.ca_member_role(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ca_can(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.client_portal_business_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ca_audit_events_immutable() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ca_member_role(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ca_can(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.client_portal_business_id() TO authenticated, service_role;