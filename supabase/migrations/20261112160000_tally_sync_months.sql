-- A person can ask for any month to be fetched again from Tally (entries added or changed after the month was first sent).
ALTER TABLE public.ca_tally_connectors ADD COLUMN IF NOT EXISTS sync_months text[];
NOTIFY pgrst, 'reload schema';
