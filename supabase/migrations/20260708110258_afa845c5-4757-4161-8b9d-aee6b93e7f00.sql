
-- HSN codes are shared GST reference data — allow all authenticated users to read
CREATE POLICY "hsn shared reference read"
  ON public.hsn_master
  FOR SELECT
  TO authenticated
  USING (true);
