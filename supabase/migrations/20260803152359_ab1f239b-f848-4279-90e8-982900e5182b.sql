-- 1. Helper: is the current user an owner or active member of a CA firm?
CREATE OR REPLACE FUNCTION public.user_in_ca_firm(_firm_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _firm_id IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.ca_firms f WHERE f.id = _firm_id AND f.user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.ca_firm_members m
      WHERE m.ca_firm_id = _firm_id AND m.user_id = auth.uid() AND m.status = 'active'
    )
  );
$$;

-- 2. Helper: blog media editors
CREATE OR REPLACE FUNCTION public.is_blog_editor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'super_admin')
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'blog_admin');
$$;

-- 3. blog-images: restrict writes to blog editors
DROP POLICY IF EXISTS "blog images upload by authenticated" ON storage.objects;
DROP POLICY IF EXISTS "blog images update by authenticated" ON storage.objects;
DROP POLICY IF EXISTS "blog images delete by authenticated" ON storage.objects;

CREATE POLICY "blog images insert by editors"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'blog-images' AND public.is_blog_editor());

CREATE POLICY "blog images update by editors"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'blog-images' AND public.is_blog_editor())
WITH CHECK (bucket_id = 'blog-images' AND public.is_blog_editor());

CREATE POLICY "blog images delete by editors"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'blog-images' AND public.is_blog_editor());

-- 4. ca-client-documents: verify firm membership, not folder-name ownership only
DROP POLICY IF EXISTS "CA firm can read own client documents" ON storage.objects;
DROP POLICY IF EXISTS "CA firm can delete own client documents" ON storage.objects;

CREATE POLICY "CA firm can read own client documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'ca-client-documents'
  AND public.user_in_ca_firm(((storage.foldername(name))[1])::uuid)
  AND public.ca_firm_has_client_access(((storage.foldername(name))[1])::uuid, ((storage.foldername(name))[2])::uuid)
);

CREATE POLICY "CA firm can delete own client documents"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'ca-client-documents'
  AND public.user_in_ca_firm(((storage.foldername(name))[1])::uuid)
  AND public.ca_firm_has_client_access(((storage.foldername(name))[1])::uuid, ((storage.foldername(name))[2])::uuid)
);

-- 5. financial-imports UPDATE policy scoped to authenticated
DROP POLICY IF EXISTS "fin_imports_update_business" ON storage.objects;

CREATE POLICY "fin_imports_update_business"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'financial-imports'
  AND get_user_business_id() IS NOT NULL
  AND (storage.foldername(name))[1] = (get_user_business_id())::text
)
WITH CHECK (
  bucket_id = 'financial-imports'
  AND get_user_business_id() IS NOT NULL
  AND (storage.foldername(name))[1] = (get_user_business_id())::text
);

-- 6. hsn_master: tenants may not write is_demo rows
DROP POLICY IF EXISTS "hsn tenant w" ON public.hsn_master;

CREATE POLICY "hsn tenant insert"
ON public.hsn_master FOR INSERT TO authenticated
WITH CHECK (
  business_id = get_user_business_id()
  AND (is_demo IS NOT TRUE OR public.has_role(auth.uid(), 'super_admin'))
);

CREATE POLICY "hsn tenant update"
ON public.hsn_master FOR UPDATE TO authenticated
USING (business_id = get_user_business_id() AND (is_demo IS NOT TRUE OR public.has_role(auth.uid(), 'super_admin')))
WITH CHECK (
  business_id = get_user_business_id()
  AND (is_demo IS NOT TRUE OR public.has_role(auth.uid(), 'super_admin'))
);

CREATE POLICY "hsn tenant delete"
ON public.hsn_master FOR DELETE TO authenticated
USING (business_id = get_user_business_id() AND (is_demo IS NOT TRUE OR public.has_role(auth.uid(), 'super_admin')));