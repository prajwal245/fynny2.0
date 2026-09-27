-- Track "Notify me" signups for upcoming Intelligence Suites
CREATE TABLE IF NOT EXISTS public.early_access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  requested_module TEXT NOT NULL,
  user_id UUID NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT early_access_email_format
    CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  CONSTRAINT early_access_email_length
    CHECK (length(email) BETWEEN 3 AND 320),
  CONSTRAINT early_access_module_length
    CHECK (length(requested_module) BETWEEN 1 AND 120)
);

CREATE INDEX IF NOT EXISTS idx_early_access_requests_module
  ON public.early_access_requests (requested_module);
CREATE INDEX IF NOT EXISTS idx_early_access_requests_user
  ON public.early_access_requests (user_id);

ALTER TABLE public.early_access_requests ENABLE ROW LEVEL SECURITY;

-- Anyone (anon or signed-in) can submit a request.
-- Signed-in users must attach their own user_id (or leave it null);
-- anon users must leave it null. This prevents impersonation.
DROP POLICY IF EXISTS "Anyone can request early access"
  ON public.early_access_requests;
CREATE POLICY "Anyone can request early access"
  ON public.early_access_requests
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    user_id IS NULL OR user_id = auth.uid()
  );

-- Signed-in users can see their own requests
DROP POLICY IF EXISTS "Users can view own requests"
  ON public.early_access_requests;
CREATE POLICY "Users can view own requests"
  ON public.early_access_requests
  FOR SELECT
  TO authenticated
  USING (user_id IS NOT NULL AND user_id = auth.uid());

-- Admins can see and manage everything
DROP POLICY IF EXISTS "Admins can view all early access requests"
  ON public.early_access_requests;
CREATE POLICY "Admins can view all early access requests"
  ON public.early_access_requests
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can delete early access requests"
  ON public.early_access_requests;
CREATE POLICY "Admins can delete early access requests"
  ON public.early_access_requests
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
