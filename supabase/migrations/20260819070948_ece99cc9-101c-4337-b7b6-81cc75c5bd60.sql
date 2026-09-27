CREATE OR REPLACE FUNCTION public.admin_ai_usage_overview()
RETURNS TABLE(
  business_id uuid,
  business_name text,
  daily_limit integer,
  used_today integer,
  remaining integer,
  used_7d integer,
  used_30d integer,
  blocked_today integer,
  last_used_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH day_start AS (
    SELECT (date_trunc('day', (now() AT TIME ZONE 'Asia/Kolkata')) AT TIME ZONE 'Asia/Kolkata') AS d
  ),
  default_limit AS (
    SELECT COALESCE((SELECT l.daily_request_limit FROM public.ai_usage_limits l WHERE l.business_id IS NULL LIMIT 1), 100) AS v
  ),
  agg AS (
    SELECT
      g.business_id,
      COUNT(*) FILTER (WHERE g.created_at >= (SELECT d FROM day_start) AND g.status <> 'blocked')::int AS used_today,
      COUNT(*) FILTER (WHERE g.created_at >= (SELECT d FROM day_start) AND g.status = 'blocked')::int AS blocked_today,
      COUNT(*) FILTER (WHERE g.created_at >= now() - interval '7 days' AND g.status <> 'blocked')::int AS used_7d,
      COUNT(*) FILTER (WHERE g.created_at >= now() - interval '30 days' AND g.status <> 'blocked')::int AS used_30d,
      MAX(g.created_at) AS last_used_at
    FROM public.ai_usage_logs g
    WHERE g.business_id IS NOT NULL
    GROUP BY g.business_id
  )
  SELECT
    a.business_id,
    COALESCE(b.business_name, 'Unknown business') AS business_name,
    COALESCE(lim.daily_request_limit, (SELECT v FROM default_limit)) AS daily_limit,
    a.used_today,
    GREATEST(0, COALESCE(lim.daily_request_limit, (SELECT v FROM default_limit)) - a.used_today) AS remaining,
    a.used_7d,
    a.used_30d,
    a.blocked_today,
    a.last_used_at
  FROM agg a
  LEFT JOIN public.businesses b ON b.id = a.business_id
  LEFT JOIN public.ai_usage_limits lim ON lim.business_id = a.business_id
  WHERE public.is_admin_user()
  ORDER BY a.used_today DESC, a.used_30d DESC;
$$;

REVOKE ALL ON FUNCTION public.admin_ai_usage_overview() FROM public;
GRANT EXECUTE ON FUNCTION public.admin_ai_usage_overview() TO authenticated;