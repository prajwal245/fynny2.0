-- Least privilege for SECURITY DEFINER functions (Supabase security advisor:
-- anon_security_definer_function_executable). Signed-out visitors keep EXECUTE
-- only where a public page needs it (listed with reasons in
-- .github/security/lint-baseline.json); signed-in users and the server keep
-- access to everything else. Trigger functions run as triggers either way.
DO $$
DECLARE fn regprocedure;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.proname = ANY (ARRAY[
        'accept_ca_invitation',
        'admin_ai_usage_overview',
        'ca_firm_has_all_client_access',
        'check_ai_quota',
        'check_and_increment_rate_limit',
        'clear_ca_demo_data',
        'compute_client_health_score',
        'decline_ca_invitation',
        'enforce_ca_access_request_immutable_fields',
        'enforce_ca_message_sender_type',
        'generate_client_reference_code',
        'generate_compliance_calendar',
        'get_latest_demo_insight',
        'is_blog_admin',
        'is_blog_editor',
        'is_ca_firm_privileged',
        'link_business_to_creator',
        'lookup_client_by_reference',
        'mark_overdue_filings',
        'prevent_ca_client_access_repoint',
        'prevent_ca_firm_verification_self_update',
        'reset_rate_limit',
        'track_extraction_correction',
        'zoho_exchange_code',
        'zoho_get_auth_url',
        'zoho_sync_transactions'
      ])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
END $$;
