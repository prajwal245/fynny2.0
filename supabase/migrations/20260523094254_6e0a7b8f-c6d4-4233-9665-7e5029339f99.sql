-- 1. integrations: remove permissive public policy. Tokens must never be readable by anon/auth users.
DROP POLICY IF EXISTS "Allow all for demo" ON public.integrations;

-- Lock down to admins only via the existing has_role helper.
-- Service role bypasses RLS and is what edge functions use to read/write tokens.
CREATE POLICY "Admins can view integrations"
  ON public.integrations
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can manage integrations"
  ON public.integrations
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


-- 2. auth_link_events: add INSERT policy so client/edge logging works.
-- Required for password-recovery / magic-link diagnostics. SELECT remains admin-only.
CREATE POLICY "Anyone can log auth link events"
  ON public.auth_link_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);


-- 3. demo_organizations: tighten the INSERT WITH CHECK to prevent garbage / pollution.
-- Replaces the unrestricted insert policy with a validating one.
DROP POLICY IF EXISTS "Anyone can create demo organizations" ON public.demo_organizations;

CREATE POLICY "Anyone can create demo organizations"
  ON public.demo_organizations
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    demo_org_id IS NOT NULL
    AND length(demo_org_id) BETWEEN 6 AND 64
    AND demo_org_id ~ '^[A-Za-z0-9_-]+$'
    AND business_name IS NOT NULL
    AND length(business_name) BETWEEN 1 AND 200
    AND (email IS NULL OR (length(email) <= 320 AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'))
    AND (name IS NULL OR length(name) <= 200)
    AND (industry IS NULL OR length(industry) <= 100)
    AND (employees IS NULL OR length(employees) <= 50)
    AND (monthly_revenue IS NULL OR length(monthly_revenue) <= 50)
    AND (challenge IS NULL OR length(challenge) <= 2000)
  );