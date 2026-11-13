-- A person who has checked that a bank line is a different transaction from an entry already in Tally says so when approving; the
-- connector then writes it without the "already in Tally" look-up.
ALTER TABLE public.ca_tally_postings ADD COLUMN IF NOT EXISTS confirmed_not_duplicate boolean NOT NULL DEFAULT false;
NOTIFY pgrst, 'reload schema';
