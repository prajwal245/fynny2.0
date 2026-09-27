CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS http;

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.zoho_credentials (
  id serial PRIMARY KEY,
  client_id text NOT NULL,
  client_secret text NOT NULL,
  redirect_uri text NOT NULL,
  created_at timestamptz DEFAULT now()
);

INSERT INTO private.zoho_credentials (client_id, client_secret, redirect_uri)
SELECT
  '1000.O4BAGD47PXOOMJH72SGKWU8F1ATERU',
  'c57e38c2f99302a084a15885625196980194172d61',
  'https://ukmtzflxtcoqnwujvrqh.supabase.co/functions/v1/zoho-callback'
WHERE NOT EXISTS (SELECT 1 FROM private.zoho_credentials);

CREATE OR REPLACE FUNCTION public.zoho_get_auth_url(p_organization_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private
AS $$
DECLARE v_client_id text; v_redirect_uri text; v_state text; v_auth_url text;
BEGIN
  SELECT client_id, redirect_uri INTO v_client_id, v_redirect_uri FROM private.zoho_credentials LIMIT 1;
  IF v_client_id IS NULL THEN RAISE EXCEPTION 'Zoho credentials not configured'; END IF;
  v_state := p_organization_id || ':' || gen_random_uuid()::text;
  v_auth_url := 'https://accounts.zoho.com/oauth/v2/auth?client_id=' || v_client_id ||
    '&response_type=code&redirect_uri=' || v_redirect_uri ||
    '&scope=ZohoBooks.fullaccess.all&state=' || v_state ||
    '&access_type=offline&prompt=consent';
  RETURN jsonb_build_object('authorization_url', v_auth_url, 'state', v_state);
END; $$;

CREATE OR REPLACE FUNCTION public.zoho_exchange_code(p_code text, p_state text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private
AS $$
DECLARE
  v_organization_id text; v_client_id text; v_client_secret text; v_redirect_uri text;
  v_response jsonb; v_request_id bigint;
BEGIN
  v_organization_id := split_part(p_state, ':', 1);
  SELECT client_id, client_secret, redirect_uri INTO v_client_id, v_client_secret, v_redirect_uri
  FROM private.zoho_credentials LIMIT 1;

  SELECT net.http_post(
    url := 'https://accounts.zoho.com/oauth/v2/token',
    headers := '{"Content-Type": "application/x-www-form-urlencoded"}'::jsonb,
    body := format('grant_type=authorization_code&client_id=%s&client_secret=%s&redirect_uri=%s&code=%s',
      v_client_id, v_client_secret, v_redirect_uri, p_code)::jsonb
  ) INTO v_request_id;

  FOR i IN 1..10 LOOP
    SELECT (response_body)::jsonb INTO v_response FROM net._http_response WHERE id = v_request_id;
    EXIT WHEN v_response IS NOT NULL;
    PERFORM pg_sleep(0.5);
  END LOOP;

  IF v_response IS NULL THEN RAISE EXCEPTION 'Token exchange timeout'; END IF;
  IF v_response->>'error' IS NOT NULL THEN RAISE EXCEPTION 'Token exchange failed: %', v_response->>'error'; END IF;

  INSERT INTO public.integrations (organization_id, provider, access_token, refresh_token, expires_at, metadata)
  VALUES (v_organization_id, 'zoho_books', v_response->>'access_token', v_response->>'refresh_token',
    now() + ((v_response->>'expires_in')::int || ' seconds')::interval,
    jsonb_build_object('api_domain', COALESCE(v_response->>'api_domain', 'https://books.zoho.com'), 'connected_at', now()))
  ON CONFLICT (organization_id, provider) DO UPDATE SET
    access_token = EXCLUDED.access_token, refresh_token = EXCLUDED.refresh_token,
    expires_at = EXCLUDED.expires_at, metadata = EXCLUDED.metadata, updated_at = now();

  RETURN jsonb_build_object('success', true, 'organization_id', v_organization_id);
END; $$;

CREATE OR REPLACE FUNCTION private.zoho_refresh_token(p_organization_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private
AS $$
DECLARE
  v_integration record; v_client_id text; v_client_secret text;
  v_response jsonb; v_request_id bigint;
BEGIN
  SELECT * INTO v_integration FROM public.integrations
  WHERE organization_id = p_organization_id AND provider = 'zoho_books' LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Zoho not connected'; END IF;
  IF v_integration.expires_at > now() THEN RETURN; END IF;

  SELECT client_id, client_secret INTO v_client_id, v_client_secret FROM private.zoho_credentials LIMIT 1;

  SELECT net.http_post(
    url := 'https://accounts.zoho.com/oauth/v2/token',
    headers := '{"Content-Type": "application/x-www-form-urlencoded"}'::jsonb,
    body := format('grant_type=refresh_token&client_id=%s&client_secret=%s&refresh_token=%s',
      v_client_id, v_client_secret, v_integration.refresh_token)::jsonb
  ) INTO v_request_id;

  FOR i IN 1..10 LOOP
    SELECT (response_body)::jsonb INTO v_response FROM net._http_response WHERE id = v_request_id;
    EXIT WHEN v_response IS NOT NULL;
    PERFORM pg_sleep(0.5);
  END LOOP;

  UPDATE public.integrations
  SET access_token = v_response->>'access_token',
      expires_at = now() + ((v_response->>'expires_in')::int || ' seconds')::interval,
      updated_at = now()
  WHERE organization_id = p_organization_id AND provider = 'zoho_books';
END; $$;

CREATE OR REPLACE FUNCTION public.zoho_sync_transactions(p_organization_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private
AS $$
DECLARE v_integration record; v_api_domain text; v_access_token text; v_synced_count int := 0;
BEGIN
  SELECT * INTO v_integration FROM public.integrations
  WHERE organization_id = p_organization_id AND provider = 'zoho_books' LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Zoho Books not connected. Please connect first.'; END IF;

  PERFORM private.zoho_refresh_token(p_organization_id);

  SELECT access_token, metadata->>'api_domain' INTO v_access_token, v_api_domain
  FROM public.integrations WHERE organization_id = p_organization_id AND provider = 'zoho_books';

  v_api_domain := COALESCE(v_api_domain, 'https://books.zoho.com');

  RETURN jsonb_build_object('success', true, 'synced', v_synced_count,
    'message', 'Zoho sync function created - HTTP calls to be implemented');
END; $$;

GRANT EXECUTE ON FUNCTION public.zoho_get_auth_url(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.zoho_exchange_code(text, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.zoho_sync_transactions(text) TO authenticated, anon;