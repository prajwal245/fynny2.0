
DROP POLICY IF EXISTS "Business access" ON public.employees;
DROP POLICY IF EXISTS "Business delete" ON public.employees;
DROP POLICY IF EXISTS "Business insert" ON public.employees;
DROP POLICY IF EXISTS "Business update" ON public.employees;

CREATE POLICY "Business access" ON public.employees FOR SELECT TO authenticated USING (org_id = get_user_business_id());
CREATE POLICY "Business delete" ON public.employees FOR DELETE TO authenticated USING (org_id = get_user_business_id());
CREATE POLICY "Business insert" ON public.employees FOR INSERT TO authenticated WITH CHECK (org_id = get_user_business_id());
CREATE POLICY "Business update" ON public.employees FOR UPDATE TO authenticated USING (org_id = get_user_business_id()) WITH CHECK (org_id = get_user_business_id());

DROP POLICY IF EXISTS "Chase access" ON public.receivable_chases;
DROP POLICY IF EXISTS "Chase insert" ON public.receivable_chases;

CREATE POLICY "Chase access" ON public.receivable_chases FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.receivables r WHERE r.id = receivable_chases.receivable_id AND r.business_id = get_user_business_id())
);
CREATE POLICY "Chase insert" ON public.receivable_chases FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.receivables r WHERE r.id = receivable_chases.receivable_id AND r.business_id = get_user_business_id())
);

REVOKE ALL ON public.employees FROM anon;
REVOKE ALL ON public.receivable_chases FROM anon;
