ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.resource_glossary ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.resource_videos ADD COLUMN IF NOT EXISTS archived_at timestamptz;