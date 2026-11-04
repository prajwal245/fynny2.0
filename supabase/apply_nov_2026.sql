-- FynHelp: database changes of early November 2026, in order. Safe to run again.
-- Run in Supabase -> SQL Editor. One transaction: if a line fails, nothing changes.
BEGIN;

-- Shared API rate limiter. One row per (bucket, time window); the server asks
-- rate_limit_hit() once per request and weighs the current and previous
-- windows (sliding-window counter), so limits hold across every server
-- instance. Only the server (service role) can touch this.
CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  bucket       text    NOT NULL,
  window_start bigint  NOT NULL,
  hits         integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.api_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.api_rate_limits TO service_role;
CREATE INDEX IF NOT EXISTS api_rate_limits_window_idx ON public.api_rate_limits (window_start);

CREATE OR REPLACE FUNCTION public.rate_limit_hit(p_bucket text, p_window integer, p_cost integer DEFAULT 1)
 RETURNS TABLE(o_current integer, o_previous integer, o_window bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  w bigint := (floor(extract(epoch FROM now()) / p_window) * p_window)::bigint;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'server only' USING ERRCODE = '42501';
  END IF;
  IF p_window < 1 OR p_window > 86400 THEN
    RAISE EXCEPTION 'bad window' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.api_rate_limits AS r (bucket, window_start, hits)
  VALUES (p_bucket, w, GREATEST(p_cost, 1))
  ON CONFLICT (bucket, window_start) DO UPDATE SET hits = r.hits + GREATEST(p_cost, 1)
  RETURNING r.hits INTO o_current;
  SELECT r.hits INTO o_previous FROM public.api_rate_limits r
   WHERE r.bucket = p_bucket AND r.window_start = w - p_window;
  o_previous := COALESCE(o_previous, 0);
  o_window := w;
  RETURN NEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rate_limit_prune()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE n integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'server only' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.api_rate_limits WHERE window_start < extract(epoch FROM now())::bigint - 172800;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$function$;

REVOKE ALL ON FUNCTION public.rate_limit_hit(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rate_limit_prune() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_hit(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.rate_limit_prune() TO service_role;

-- Cost and usage for the practice agents' AI and OCR calls (document reading,
-- report insights). Tokens come from the provider's answer; cost_usd is an
-- estimate from list prices. Read by the admin AI monitoring page.
ALTER TABLE public.ca_ai_calls
  ADD COLUMN IF NOT EXISTS input_tokens integer,
  ADD COLUMN IF NOT EXISTS output_tokens integer,
  ADD COLUMN IF NOT EXISTS cost_usd numeric(12,6),
  ADD COLUMN IF NOT EXISTS units integer;
CREATE INDEX IF NOT EXISTS ca_ai_calls_created_idx ON public.ca_ai_calls (created_at DESC);

-- One answer for the admin screen: totals, by day, by provider/model/purpose, by firm.
CREATE OR REPLACE FUNCTION public.admin_practice_ai_overview(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  since timestamptz := now() - make_interval(days => GREATEST(1, LEAST(COALESCE(p_days, 30), 365)));
  out jsonb;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'admins only' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'totals', (SELECT jsonb_build_object(
        'calls', count(*), 'errors', count(*) FILTER (WHERE status = 'error'),
        'input_tokens', COALESCE(sum(input_tokens), 0), 'output_tokens', COALESCE(sum(output_tokens), 0),
        'cost_usd', COALESCE(sum(cost_usd), 0), 'avg_latency_ms', COALESCE(round(avg(latency_ms)), 0),
        'calls_without_usage', count(*) FILTER (WHERE status = 'success' AND input_tokens IS NULL AND output_tokens IS NULL AND provider <> 'ocr.space'))
      FROM public.ca_ai_calls WHERE created_at >= since),
    'by_day', COALESCE((SELECT jsonb_agg(t ORDER BY t.day) FROM (
        SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date AS day, count(*) AS calls,
               count(*) FILTER (WHERE status = 'error') AS errors, COALESCE(sum(cost_usd), 0) AS cost_usd
        FROM public.ca_ai_calls WHERE created_at >= since GROUP BY 1) t), '[]'::jsonb),
    'by_model', COALESCE((SELECT jsonb_agg(t ORDER BY t.cost_usd DESC, t.calls DESC) FROM (
        SELECT COALESCE(provider, 'none') AS provider, COALESCE(model, '-') AS model, purpose, count(*) AS calls,
               count(*) FILTER (WHERE status = 'error') AS errors, COALESCE(sum(input_tokens), 0) AS input_tokens,
               COALESCE(sum(output_tokens), 0) AS output_tokens, COALESCE(sum(cost_usd), 0) AS cost_usd,
               COALESCE(round(avg(latency_ms)), 0) AS avg_latency_ms
        FROM public.ca_ai_calls WHERE created_at >= since GROUP BY 1, 2, 3) t), '[]'::jsonb),
    'by_firm', COALESCE((SELECT jsonb_agg(t ORDER BY t.cost_usd DESC, t.calls DESC) FROM (
        SELECT c.ca_firm_id, COALESCE(f.firm_name, 'Unknown firm') AS firm_name, count(*) AS calls,
               count(*) FILTER (WHERE c.status = 'error') AS errors, COALESCE(sum(c.cost_usd), 0) AS cost_usd
        FROM public.ca_ai_calls c LEFT JOIN public.ca_firms f ON f.id = c.ca_firm_id
        WHERE c.created_at >= since GROUP BY c.ca_firm_id, f.firm_name ORDER BY 5 DESC, 3 DESC LIMIT 20) t), '[]'::jsonb)
  ) INTO out;
  RETURN out;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_practice_ai_overview(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_practice_ai_overview(integer) TO authenticated;

COMMIT;
