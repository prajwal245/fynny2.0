-- lovable-cron-fallback-reviewed: 96 runs/day; Gmail push (Pub/Sub) is not available in this project, so polling is the only way to pick up client email attachments within the required 15 minute window.
CREATE OR REPLACE FUNCTION public.trigger_ca_poll_gmail()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM net.http_post(
    url := 'https://project--db6d6d57-efdb-48fa-b792-71162354b2f8.lovable.app/api/public/ca-poll-gmail',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','fyn_cron_7bd41e9a2c6f4835ab90d7c15e28f463'),
    body := '{}'::jsonb
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.trigger_ca_poll_gmail() FROM public, anon, authenticated;

SELECT cron.schedule('ca-poll-gmail-15min', '*/15 * * * *', 'SELECT public.trigger_ca_poll_gmail()');