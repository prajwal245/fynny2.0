-- Job ids are specific to the original hosted project; only adjust it where it exists.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobid = 9) THEN
    PERFORM cron.alter_job(9, schedule := '0 */6 * * *');
  END IF;
END $$;
