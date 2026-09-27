GRANT EXECUTE ON FUNCTION public.is_admin_user() TO anon;
GRANT EXECUTE ON FUNCTION public.is_senior_admin() TO anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon;