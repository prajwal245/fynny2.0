CREATE POLICY "ca firm reads client bank txns" ON public.bank_transactions FOR SELECT TO authenticated
  USING (public.ca_firm_has_client_access(public.get_user_ca_firm_id(), business_id));
CREATE POLICY "ca firm posts client bank txns" ON public.bank_transactions FOR INSERT TO authenticated
  WITH CHECK (public.ca_firm_has_client_access(public.get_user_ca_firm_id(), business_id)
    AND public.ca_can(public.get_user_ca_firm_id(), 'process'));

CREATE POLICY "ca firm reads client invoices" ON public.invoices FOR SELECT TO authenticated
  USING (public.ca_firm_has_client_access(public.get_user_ca_firm_id(), business_id));
CREATE POLICY "ca firm posts client invoices" ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (public.ca_firm_has_client_access(public.get_user_ca_firm_id(), business_id)
    AND public.ca_can(public.get_user_ca_firm_id(), 'process'));

CREATE POLICY "ca firm reads client expenses" ON public.expenses FOR SELECT TO authenticated
  USING (public.ca_firm_has_client_access(public.get_user_ca_firm_id(), business_id));
CREATE POLICY "ca firm posts client expenses" ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (public.ca_firm_has_client_access(public.get_user_ca_firm_id(), business_id)
    AND public.ca_can(public.get_user_ca_firm_id(), 'process'));