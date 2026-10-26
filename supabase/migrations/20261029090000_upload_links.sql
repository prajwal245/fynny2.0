-- Upload links: a client taps "Upload documents" in a WhatsApp reminder and lands on a page that needs no login.
-- The link carries a random token; only its SHA-256 hash is stored, so a database leak does not expose live links.
-- A link belongs to one chase (and so one client), expires, and takes a limited number of files.

CREATE TABLE IF NOT EXISTS public.ca_upload_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  business_id uuid,
  request_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  files_uploaded int NOT NULL DEFAULT 0,
  max_files int NOT NULL DEFAULT 25 CHECK (max_files BETWEEN 1 AND 100),
  last_used_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS ca_upload_links_firm_idx ON public.ca_upload_links (ca_firm_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ca_upload_links_request_idx ON public.ca_upload_links (request_id) WHERE request_id IS NOT NULL;

-- Only the server (service role) reads or writes links. Nothing here is reachable from the browser.
ALTER TABLE public.ca_upload_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ca_upload_links FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ca_upload_links TO service_role;

-- Counts one more file against a link, but only while the link is live and under its limit. Returns true if taken.
CREATE OR REPLACE FUNCTION public.ca_upload_link_take(p_link uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE n int;
BEGIN
  UPDATE public.ca_upload_links
     SET files_uploaded = files_uploaded + 1, last_used_at = now()
   WHERE id = p_link AND revoked_at IS NULL AND expires_at > now() AND files_uploaded < max_files;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n = 1;
END;
$$;
-- Gives a file slot back when the file could not be kept.
CREATE OR REPLACE FUNCTION public.ca_upload_link_give_back(p_link uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ UPDATE public.ca_upload_links SET files_uploaded = greatest(files_uploaded - 1, 0) WHERE id = p_link; $$;

REVOKE EXECUTE ON FUNCTION public.ca_upload_link_take(uuid), public.ca_upload_link_give_back(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ca_upload_link_take(uuid), public.ca_upload_link_give_back(uuid) TO service_role;
