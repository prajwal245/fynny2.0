
-- ============================================================
-- 1) ca_firm_members: prevent self-elevation / unauthorized inserts
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_ca_firm_privileged(_firm_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.ca_firms f WHERE f.id = _firm_id AND f.user_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.ca_firm_members m
        WHERE m.ca_firm_id = _firm_id
          AND m.user_id = auth.uid()
          AND m.status = 'active'
          AND m.role IN ('partner','manager')
      );
$$;

DROP POLICY IF EXISTS "CA member insert" ON public.ca_firm_members;
DROP POLICY IF EXISTS "CA member update" ON public.ca_firm_members;
DROP POLICY IF EXISTS "CA member delete" ON public.ca_firm_members;

-- Only firm owners or active partners/managers can add staff.
-- New rows cannot target auth.uid() (no self-invite creating own row).
CREATE POLICY "CA member insert privileged only"
  ON public.ca_firm_members
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_ca_firm_privileged(ca_firm_id)
    AND user_id <> auth.uid()
  );

-- Only firm owners or active partners/managers can update rows,
-- and no one may edit their own role or status (blocks self-elevation).
CREATE POLICY "CA member update privileged only"
  ON public.ca_firm_members
  FOR UPDATE TO authenticated
  USING (
    public.is_ca_firm_privileged(ca_firm_id)
    AND user_id <> auth.uid()
  )
  WITH CHECK (
    public.is_ca_firm_privileged(ca_firm_id)
    AND user_id <> auth.uid()
  );

CREATE POLICY "CA member delete privileged only"
  ON public.ca_firm_members
  FOR DELETE TO authenticated
  USING (
    public.is_ca_firm_privileged(ca_firm_id)
    AND user_id <> auth.uid()
  );

-- ============================================================
-- 2) ca_firms: block self-approval of verification fields
-- ============================================================

CREATE OR REPLACE FUNCTION public.prevent_ca_firm_verification_self_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.is_senior_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified
     OR NEW.verification_status IS DISTINCT FROM OLD.verification_status
     OR NEW.verification_reviewed_at IS DISTINCT FROM OLD.verification_reviewed_at THEN
    RAISE EXCEPTION 'Only platform administrators can change CA firm verification fields.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_ca_firm_verification_self_update ON public.ca_firms;
CREATE TRIGGER trg_prevent_ca_firm_verification_self_update
  BEFORE UPDATE ON public.ca_firms
  FOR EACH ROW EXECUTE FUNCTION public.prevent_ca_firm_verification_self_update();

-- Also add a WITH CHECK to make intent explicit at the policy layer.
DROP POLICY IF EXISTS "CA firm self update" ON public.ca_firms;
CREATE POLICY "CA firm self update"
  ON public.ca_firms
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- 3) resource-files bucket: no anonymous read of arbitrary files
-- ============================================================

DROP POLICY IF EXISTS "Public read resource files" ON storage.objects;

-- Files are only readable when they are:
--  * referenced by a PUBLISHED row in public.resources (file_path match), or
--  * used as a thumbnail on a PUBLISHED resource_video, or
--  * being fetched by an authenticated content-team member.
CREATE POLICY "Read published resource files"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'resource-files'
    AND (
      EXISTS (
        SELECT 1 FROM public.resources r
        WHERE r.is_published = true
          AND r.file_path = storage.objects.name
      )
      OR EXISTS (
        SELECT 1 FROM public.resource_videos v
        WHERE v.is_published = true
          AND v.thumbnail_url LIKE '%/' || storage.objects.name
      )
      OR (
        auth.uid() IS NOT NULL
        AND auth.uid() IN (
          SELECT user_id FROM public.user_roles
          WHERE role IN ('super_admin','admin','intern','blog_admin')
        )
      )
    )
  );
