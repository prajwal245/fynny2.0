
-- Make access_token optional (file uploads, built-ins don't have one)
ALTER TABLE public.integrations
  ALTER COLUMN access_token DROP NOT NULL;

-- Add status column
ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- Allow business owners/members to manage their own org's integrations
CREATE POLICY "Users can view own org integrations"
  ON public.integrations
  FOR SELECT
  TO authenticated
  USING (organization_id = (public.get_user_business_id())::text);

CREATE POLICY "Users can insert own org integrations"
  ON public.integrations
  FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = (public.get_user_business_id())::text);

CREATE POLICY "Users can update own org integrations"
  ON public.integrations
  FOR UPDATE
  TO authenticated
  USING (organization_id = (public.get_user_business_id())::text)
  WITH CHECK (organization_id = (public.get_user_business_id())::text);

CREATE POLICY "Users can delete own org integrations"
  ON public.integrations
  FOR DELETE
  TO authenticated
  USING (organization_id = (public.get_user_business_id())::text);

-- Ensure authenticated role can reach the table
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integrations TO authenticated;
GRANT ALL ON public.integrations TO service_role;
