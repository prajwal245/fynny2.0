-- The 15-minute Gmail check still called the old Lovable deployment, with its
-- secret written into a migration. Call the live site instead, and read the
-- secret (and optionally the site address) from Supabase Vault:
--   select vault.create_secret('<same value as CA_CRON_SECRET in Vercel>', 'ca_cron_secret');
-- Until that secret exists the job does nothing, rather than calling with a
-- known secret.
create or replace function public.trigger_ca_poll_gmail()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
  v_url text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'ca_cron_secret' limit 1;
  if v_secret is null or v_secret = '' then
    raise log 'ca-poll-gmail: vault secret ca_cron_secret is not set; skipping';
    return;
  end if;
  select coalesce(
    (select decrypted_secret from vault.decrypted_secrets where name = 'app_url' limit 1),
    'https://www.fynhelp.com'
  ) into v_url;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/api/public/ca-poll-gmail',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;
revoke execute on function public.trigger_ca_poll_gmail() from public, anon, authenticated;

-- Every 15 minutes (same job name: re-scheduling replaces it).
select cron.schedule('ca-poll-gmail-15min', '*/15 * * * *', 'select public.trigger_ca_poll_gmail()');

-- Jobs from the old CA portal that still call the retired Lovable deployment.
-- The live app's work (inbox checks, Extract, chasers) runs through
-- ca-poll-gmail and practice-tick on www.fynhelp.com.
do $$
declare j text;
begin
  foreach j in array array['ca-integration-sync-daily', 'ca-brain-master', 'ca-auto-escalate-chasers-daily'] loop
    if exists (select 1 from cron.job where jobname = j) then
      perform cron.unschedule(j);
    end if;
  end loop;
end;
$$;
