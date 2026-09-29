-- Client-side inserts can no longer forge usage counters; only backend writes.
DROP POLICY "Users insert own AI logs" ON public.ai_usage_logs;
REVOKE INSERT ON public.ai_usage_logs FROM authenticated;
GRANT ALL ON public.ai_usage_logs TO service_role;

-- Feature column so quotas can be attributed per AI surface.
ALTER TABLE public.ai_usage_logs ADD COLUMN IF NOT EXISTS feature text NOT NULL DEFAULT 'chat';
CREATE INDEX IF NOT EXISTS ai_usage_logs_business_day_idx
  ON public.ai_usage_logs (business_id, created_at DESC);

-- Per-business daily caps, with a single global default row (business_id IS NULL).
CREATE TABLE IF NOT EXISTS public.ai_usage_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid UNIQUE,
  daily_request_limit integer NOT NULL DEFAULT 100,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_usage_limits_global_idx
  ON public.ai_usage_limits ((business_id IS NULL)) WHERE business_id IS NULL;

GRANT SELECT ON public.ai_usage_limits TO authenticated;
GRANT ALL ON public.ai_usage_limits TO service_role;
ALTER TABLE public.ai_usage_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own AI limit"
  ON public.ai_usage_limits FOR SELECT TO authenticated
  USING (business_id IS NULL OR business_id = get_user_business_id());

CREATE POLICY "Senior admins manage AI limits"
  ON public.ai_usage_limits FOR ALL TO authenticated
  USING (is_senior_admin()) WITH CHECK (is_senior_admin());

CREATE TRIGGER trg_ai_usage_limits_updated
  BEFORE UPDATE ON public.ai_usage_limits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.ai_usage_limits (business_id, daily_request_limit, notes)
VALUES (NULL, 100, 'Global default daily AI request cap per business')
ON CONFLICT DO NOTHING;

-- Quota check used by edge functions (service role) before every AI call.
CREATE OR REPLACE FUNCTION public.check_ai_quota(_business_id uuid, _user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer;
  v_used integer;
BEGIN
  SELECT daily_request_limit INTO v_limit
    FROM public.ai_usage_limits WHERE business_id = _business_id;
  IF v_limit IS NULL THEN
    SELECT daily_request_limit INTO v_limit
      FROM public.ai_usage_limits WHERE business_id IS NULL;
  END IF;
  v_limit := COALESCE(v_limit, 100);

  SELECT count(*) INTO v_used
    FROM public.ai_usage_logs
   WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'
     AND status <> 'blocked'
     AND (
       (_business_id IS NOT NULL AND business_id = _business_id)
       OR (_business_id IS NULL AND business_id IS NULL AND user_id = _user_id)
     );

  RETURN jsonb_build_object(
    'allowed', v_used < v_limit,
    'used', v_used,
    'daily_limit', v_limit,
    'remaining', GREATEST(0, v_limit - v_used)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_ai_quota(uuid, uuid) FROM anon;