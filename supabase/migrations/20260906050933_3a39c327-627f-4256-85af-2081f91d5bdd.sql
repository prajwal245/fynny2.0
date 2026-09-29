CREATE OR REPLACE FUNCTION public.trigger_ca_auto_escalate_chasers()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://project--db6d6d57-efdb-48fa-b792-71162354b2f8.lovable.app/api/public/ca-auto-escalate-chasers',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','fyn_cron_7bd41e9a2c6f4835ab90d7c15e28f463'),
    body := '{}'::jsonb
  );
END;
$$;

SELECT cron.schedule('ca-auto-escalate-chasers-daily', '0 5 * * *', 'SELECT public.trigger_ca_auto_escalate_chasers()');