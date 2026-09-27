
-- 1. CA firms: allow members to read their firm
CREATE POLICY "CA firm members can view their firm"
ON public.ca_firms
FOR SELECT
TO authenticated
USING (id = public.get_user_ca_firm_id());

-- 2. Profiles: prevent self-assigned roles
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (role IS NULL OR role = 'owner')
);

-- Block the 'role' column from user-driven updates via column-level privileges.
-- Admins / service_role bypass RLS and column grants are irrelevant for them.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (
  business_id,
  full_name,
  mobile,
  language_preference,
  display_name,
  whatsapp_phone,
  avatar_url,
  notification_prefs,
  updated_at
) ON public.profiles TO authenticated;

-- 3. Waitlist: validate fields on public insert
DROP POLICY IF EXISTS "Anyone can join waitlist" ON public.waitlist;
CREATE POLICY "Anyone can join waitlist"
ON public.waitlist
FOR INSERT
TO anon, authenticated
WITH CHECK (
  name IS NOT NULL
  AND length(name) BETWEEN 1 AND 200
  AND email IS NOT NULL
  AND length(email) <= 320
  AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  AND (phone IS NULL OR length(phone) <= 32)
  AND (company_name IS NULL OR length(company_name) <= 200)
  AND (company_type IS NULL OR length(company_type) <= 100)
  AND (company_size IS NULL OR length(company_size) <= 50)
  AND (location IS NULL OR length(location) <= 200)
);
