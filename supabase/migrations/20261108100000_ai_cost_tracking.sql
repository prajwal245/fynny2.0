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
