-- 1) Restrict ca_firm_members SELECT so only partners/managers see colleagues' invited_email
DROP POLICY IF EXISTS "CA member select" ON public.ca_firm_members;

CREATE POLICY "CA member select"
ON public.ca_firm_members
FOR SELECT
USING (
  ca_firm_id = public.get_user_ca_firm_id()
  AND (
    -- Members can always see their own row
    user_id = auth.uid()
    -- Partners/managers can see all members of their firm
    OR EXISTS (
      SELECT 1
      FROM public.ca_firm_members m
      WHERE m.ca_firm_id = ca_firm_members.ca_firm_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
        AND m.role IN ('partner', 'manager')
    )
    -- Firm owner can see all members
    OR EXISTS (
      SELECT 1 FROM public.ca_firms f
      WHERE f.id = ca_firm_members.ca_firm_id
        AND f.user_id = auth.uid()
    )
  )
);

-- 2) Validate demo_insights inserts to prevent storage exhaustion / poisoning
DROP POLICY IF EXISTS "Anyone can create demo insights" ON public.demo_insights;

CREATE POLICY "Anyone can create demo insights"
ON public.demo_insights
FOR INSERT
TO anon, authenticated
WITH CHECK (
  org_id IS NOT NULL
  AND length(org_id) BETWEEN 1 AND 128
  AND org_id ~ '^[A-Za-z0-9_-]+$'
  AND data IS NOT NULL
  AND pg_column_size(data) <= 51200
);