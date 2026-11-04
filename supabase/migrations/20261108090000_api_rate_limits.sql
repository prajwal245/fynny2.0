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
