CREATE OR REPLACE FUNCTION public.get_shared_mis_report(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_share public.ca_report_shares%ROWTYPE;
  v_log public.ca_reports_log%ROWTYPE;
  v_firm_name text;
  v_client_name text;
BEGIN
  IF p_token IS NULL OR length(p_token) < 8 THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT * INTO v_share FROM public.ca_report_shares
  WHERE share_token = p_token
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT * INTO v_log FROM public.ca_reports_log WHERE id = v_share.report_log_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT firm_name INTO v_firm_name FROM public.ca_firms WHERE id = v_share.ca_firm_id;
  SELECT client_name INTO v_client_name FROM public.ca_clients
    WHERE ca_firm_id = v_share.ca_firm_id AND business_id = v_share.business_id LIMIT 1;

  RETURN jsonb_build_object(
    'found', true,
    'firm_name', coalesce(v_firm_name, 'Your CA firm'),
    'client_name', coalesce(v_client_name, 'Client'),
    'report_id', v_log.id,
    'report_name', v_log.report_name,
    'report_type', v_log.report_type,
    'period', v_log.period,
    'period_start', v_log.period_start,
    'period_end', v_log.period_end,
    'generated_at', v_log.created_at,
    'content', v_log.content,
    'expires_at', v_share.expires_at,
    'note', v_share.note
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_shared_mis_report(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_mis_report(text) TO anon, authenticated, service_role;