CREATE TABLE public.demo_organizations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_name TEXT NOT NULL,
  industry TEXT,
  employees TEXT,
  monthly_revenue TEXT,
  challenge TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.demo_organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can create demo organizations"
ON public.demo_organizations
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Admins can view demo organizations"
ON public.demo_organizations
FOR SELECT
TO authenticated
USING (public.is_admin_user());

CREATE POLICY "Admins can update demo organizations"
ON public.demo_organizations
FOR UPDATE
TO authenticated
USING (public.is_admin_user());

CREATE POLICY "Admins can delete demo organizations"
ON public.demo_organizations
FOR DELETE
TO authenticated
USING (public.is_admin_user());