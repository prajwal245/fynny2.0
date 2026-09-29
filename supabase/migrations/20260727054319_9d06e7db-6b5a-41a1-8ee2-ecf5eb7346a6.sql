
CREATE POLICY "dr tenant w" ON public.deferred_revenue
  FOR ALL TO authenticated
  USING (business_id = public.get_user_business_id())
  WITH CHECK (business_id = public.get_user_business_id());

CREATE POLICY "hsn tenant w" ON public.hsn_master
  FOR ALL TO authenticated
  USING (business_id = public.get_user_business_id())
  WITH CHECK (business_id = public.get_user_business_id());

CREATE POLICY "oauth states owner"
  ON public.integration_oauth_states
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
