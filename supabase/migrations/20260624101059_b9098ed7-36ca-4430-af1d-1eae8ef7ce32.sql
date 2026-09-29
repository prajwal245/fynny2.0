
-- Tighten demo policies on generated_reports
DROP POLICY IF EXISTS "Demo reports are publicly readable" ON public.generated_reports;
DROP POLICY IF EXISTS "Users can insert reports for their business or demo" ON public.generated_reports;
DROP POLICY IF EXISTS "Users can update their business reports" ON public.generated_reports;

-- Read: only authenticated users may view demo reports (not anon)
CREATE POLICY "Demo reports readable by authenticated"
ON public.generated_reports FOR SELECT TO authenticated
USING (business_id = '4b30494f-4c30-4a74-a6bb-6bf56493a97d'::uuid);

-- Insert: only into your own business; demo writes are server-only (service_role)
CREATE POLICY "Users can insert reports for their business"
ON public.generated_reports FOR INSERT TO authenticated
WITH CHECK (business_id = public.get_user_business_id());

-- Update: only your own business reports; demo writes are server-only
CREATE POLICY "Users can update their business reports"
ON public.generated_reports FOR UPDATE TO authenticated
USING (business_id = public.get_user_business_id())
WITH CHECK (business_id = public.get_user_business_id());
