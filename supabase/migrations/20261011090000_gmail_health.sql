-- Gmail health: show the subject of each email FynHelp looked at, and when the
-- background job last checked the inbox on its own (not "Check now").
ALTER TABLE public.ca_gmail_processed
  ADD COLUMN IF NOT EXISTS subject text;

ALTER TABLE public.ca_gmail_connections
  ADD COLUMN IF NOT EXISTS last_auto_poll_at timestamptz;
