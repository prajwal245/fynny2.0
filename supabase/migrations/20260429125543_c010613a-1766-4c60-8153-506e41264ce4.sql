-- Restrict write access on the `resources` storage bucket to admins only.
-- Public read stays (bucket is public + we add an explicit SELECT policy as defense-in-depth).

-- Clean slate for our named policies (safe if they don't exist yet)
DROP POLICY IF EXISTS "Resources: public read" ON storage.objects;
DROP POLICY IF EXISTS "Resources: admin insert" ON storage.objects;
DROP POLICY IF EXISTS "Resources: admin update" ON storage.objects;
DROP POLICY IF EXISTS "Resources: admin delete" ON storage.objects;

-- Anyone (incl. anon) can read objects in the resources bucket
CREATE POLICY "Resources: public read"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'resources');

-- Only admins can upload to the resources bucket
CREATE POLICY "Resources: admin insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'resources'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- Only admins can update (replace/move) objects in the resources bucket
CREATE POLICY "Resources: admin update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'resources'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  bucket_id = 'resources'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- Only admins can delete from the resources bucket
CREATE POLICY "Resources: admin delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'resources'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);
