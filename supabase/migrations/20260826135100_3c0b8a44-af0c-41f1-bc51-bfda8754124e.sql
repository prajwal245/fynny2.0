-- 1. Shared reports -------------------------------------------------
CREATE TABLE public.ca_report_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  report_log_id uuid NOT NULL REFERENCES public.ca_reports_log(id) ON DELETE CASCADE,
  shared_by uuid,
  note text,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_log_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_report_shares TO authenticated;
GRANT ALL ON public.ca_report_shares TO service_role;
ALTER TABLE public.ca_report_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "firm manages report shares" ON public.ca_report_shares FOR ALL TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id))
  WITH CHECK (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id));
CREATE POLICY "client reads own shared reports" ON public.ca_report_shares FOR SELECT TO authenticated
  USING (revoked_at IS NULL AND business_id = public.client_portal_business_id());

-- Client portal must be able to read the shared report rows themselves.
CREATE POLICY "client reads shared report log rows" ON public.ca_reports_log FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ca_report_shares s
    WHERE s.report_log_id = ca_reports_log.id
      AND s.revoked_at IS NULL
      AND s.business_id = public.client_portal_business_id()
  ));

-- 2. Invoice payments -------------------------------------------------
CREATE TABLE public.ca_invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  invoice_id uuid NOT NULL REFERENCES public.ca_invoices(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'razorpay',
  provider_payment_id text,
  provider_link_id text,
  payment_url text,
  amount numeric NOT NULL,
  method text,
  status text NOT NULL DEFAULT 'created',
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
CREATE UNIQUE INDEX ca_invoice_payments_provider_payment_id_key
  ON public.ca_invoice_payments (provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_invoice_payments TO authenticated;
GRANT ALL ON public.ca_invoice_payments TO service_role;
ALTER TABLE public.ca_invoice_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "firm manages invoice payments" ON public.ca_invoice_payments FOR ALL TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id))
  WITH CHECK (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id));
CREATE POLICY "client reads own invoice payments" ON public.ca_invoice_payments FOR SELECT TO authenticated
  USING (business_id = public.client_portal_business_id());

CREATE POLICY "client reads own ca invoices" ON public.ca_invoices FOR SELECT TO authenticated
  USING (business_id = public.client_portal_business_id());

-- 3. Time capture -------------------------------------------------
ALTER TABLE public.ca_firm_members
  ADD COLUMN IF NOT EXISTS cost_rate numeric,
  ADD COLUMN IF NOT EXISTS billing_rate numeric,
  ADD COLUMN IF NOT EXISTS capacity_hours_per_week numeric NOT NULL DEFAULT 40;

CREATE TABLE public.ca_time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  business_id uuid,
  engagement_id uuid REFERENCES public.ca_engagements(id) ON DELETE SET NULL,
  task_id uuid REFERENCES public.ca_tasks(id) ON DELETE SET NULL,
  member_user_id uuid NOT NULL,
  entry_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date,
  started_at timestamptz,
  ended_at timestamptz,
  minutes integer NOT NULL DEFAULT 0,
  billable boolean NOT NULL DEFAULT true,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ca_time_entries_firm_date_idx ON public.ca_time_entries (ca_firm_id, entry_date);
CREATE INDEX ca_time_entries_member_idx ON public.ca_time_entries (member_user_id, entry_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_time_entries TO authenticated;
GRANT ALL ON public.ca_time_entries TO service_role;
ALTER TABLE public.ca_time_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "firm members read firm time" ON public.ca_time_entries FOR SELECT TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id));
CREATE POLICY "members log their own time" ON public.ca_time_entries FOR INSERT TO authenticated
  WITH CHECK (public.user_in_ca_firm(ca_firm_id) AND member_user_id = auth.uid());
CREATE POLICY "members edit their own time" ON public.ca_time_entries FOR UPDATE TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id) AND (member_user_id = auth.uid() OR public.is_ca_firm_privileged(ca_firm_id)))
  WITH CHECK (public.user_in_ca_firm(ca_firm_id));
CREATE POLICY "members delete their own time" ON public.ca_time_entries FOR DELETE TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id) AND (member_user_id = auth.uid() OR public.is_ca_firm_privileged(ca_firm_id)));
CREATE TRIGGER ca_time_entries_updated_at BEFORE UPDATE ON public.ca_time_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Notification outbox -------------------------------------------------
CREATE TABLE public.ca_notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  business_id uuid,
  channel text NOT NULL DEFAULT 'in_app',
  template text NOT NULL,
  recipient text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  provider text,
  provider_message_id text,
  last_error text,
  dedupe_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE UNIQUE INDEX ca_notification_outbox_dedupe_idx
  ON public.ca_notification_outbox (ca_firm_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX ca_notification_outbox_due_idx ON public.ca_notification_outbox (status, next_attempt_at);
GRANT SELECT, INSERT, UPDATE ON public.ca_notification_outbox TO authenticated;
GRANT ALL ON public.ca_notification_outbox TO service_role;
ALTER TABLE public.ca_notification_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "firm reads its outbox" ON public.ca_notification_outbox FOR SELECT TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id));
CREATE POLICY "firm queues messages" ON public.ca_notification_outbox FOR INSERT TO authenticated
  WITH CHECK (public.user_in_ca_firm(ca_firm_id));
CREATE POLICY "privileged updates outbox" ON public.ca_notification_outbox FOR UPDATE TO authenticated
  USING (public.is_ca_firm_privileged(ca_firm_id))
  WITH CHECK (public.is_ca_firm_privileged(ca_firm_id));

-- 5. Account aggregator bank feeds -------------------------------------------------
CREATE TABLE public.ca_bank_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'mock',
  consent_handle text,
  consent_id text,
  status text NOT NULL DEFAULT 'pending',
  redirect_url text,
  requested_by uuid,
  expires_at timestamptz,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_bank_consents TO authenticated;
GRANT ALL ON public.ca_bank_consents TO service_role;
ALTER TABLE public.ca_bank_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "firm manages bank consents" ON public.ca_bank_consents FOR ALL TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id))
  WITH CHECK (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id));
CREATE POLICY "client reads own bank consents" ON public.ca_bank_consents FOR SELECT TO authenticated
  USING (business_id = public.client_portal_business_id());
CREATE TRIGGER ca_bank_consents_updated_at BEFORE UPDATE ON public.ca_bank_consents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.ca_bank_accounts_linked (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consent_row_id uuid NOT NULL REFERENCES public.ca_bank_consents(id) ON DELETE CASCADE,
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  fip_name text,
  masked_account_number text,
  ifsc text,
  account_type text,
  currency text NOT NULL DEFAULT 'INR',
  link_ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_bank_accounts_linked TO authenticated;
GRANT ALL ON public.ca_bank_accounts_linked TO service_role;
ALTER TABLE public.ca_bank_accounts_linked ENABLE ROW LEVEL SECURITY;
CREATE POLICY "firm manages linked accounts" ON public.ca_bank_accounts_linked FOR ALL TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id))
  WITH CHECK (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id));
CREATE POLICY "client reads own linked accounts" ON public.ca_bank_accounts_linked FOR SELECT TO authenticated
  USING (business_id = public.client_portal_business_id());

CREATE TABLE public.ca_bank_fetch_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consent_row_id uuid NOT NULL REFERENCES public.ca_bank_consents(id) ON DELETE CASCADE,
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'mock',
  session_ref text,
  status text NOT NULL DEFAULT 'pending',
  from_date date,
  to_date date,
  txn_count integer NOT NULL DEFAULT 0,
  error text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_bank_fetch_sessions TO authenticated;
GRANT ALL ON public.ca_bank_fetch_sessions TO service_role;
ALTER TABLE public.ca_bank_fetch_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "firm manages fetch sessions" ON public.ca_bank_fetch_sessions FOR ALL TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id))
  WITH CHECK (public.user_in_ca_firm(ca_firm_id) AND public.ca_firm_has_client_access(ca_firm_id, business_id));
CREATE POLICY "client reads own fetch sessions" ON public.ca_bank_fetch_sessions FOR SELECT TO authenticated
  USING (business_id = public.client_portal_business_id());