-- MIGRATION 1 — Fix weak SELECT policies on shared tables
DROP POLICY IF EXISTS "canonical fields readable by signed in users" ON public.ca_canonical_fields;
CREATE POLICY "ca firm members read canonical fields" ON public.ca_canonical_fields
  FOR SELECT USING (EXISTS (SELECT 1 FROM ca_firm_members WHERE user_id = auth.uid() AND status = 'active'));

DROP POLICY IF EXISTS "source field map readable by signed in users" ON public.ca_source_field_map;
CREATE POLICY "ca firm members read source field map" ON public.ca_source_field_map
  FOR SELECT USING (EXISTS (SELECT 1 FROM ca_firm_members WHERE user_id = auth.uid() AND status = 'active'));

DROP POLICY IF EXISTS "authenticated can read role permissions" ON public.ca_role_permissions;
CREATE POLICY "ca firm members read role permissions" ON public.ca_role_permissions
  FOR SELECT USING (EXISTS (SELECT 1 FROM ca_firm_members WHERE user_id = auth.uid() AND status = 'active'));

-- MIGRATION 2 — Tighten ca_document_versions
DROP POLICY IF EXISTS "firm access doc versions" ON public.ca_document_versions;
CREATE POLICY "firm access doc versions" ON public.ca_document_versions
  FOR ALL USING (
    user_in_ca_firm(ca_firm_id)
    AND (business_id IS NULL OR ca_firm_has_client_access(ca_firm_id, business_id))
  );

-- MIGRATION 3 — Tighten ca_working_papers
DROP POLICY IF EXISTS "firm staff manage working papers" ON public.ca_working_papers;
CREATE POLICY "firm staff manage working papers" ON public.ca_working_papers
  FOR ALL USING (
    user_in_ca_firm(ca_firm_id)
    AND (business_id IS NULL OR ca_firm_has_client_access(ca_firm_id, business_id))
  );

-- MIGRATION 4 — Tighten ca_recon_runs
DROP POLICY IF EXISTS "firm access recon runs" ON public.ca_recon_runs;
CREATE POLICY "firm access recon runs" ON public.ca_recon_runs
  FOR ALL USING (
    user_in_ca_firm(ca_firm_id)
    AND ca_firm_has_client_access(ca_firm_id, business_id)
  );

-- MIGRATION 5 — Tighten ca_tasks
DROP POLICY IF EXISTS "firm staff manage tasks" ON public.ca_tasks;
CREATE POLICY "firm staff manage tasks" ON public.ca_tasks
  FOR ALL USING (
    user_in_ca_firm(ca_firm_id)
    AND (business_id IS NULL OR ca_firm_has_client_access(ca_firm_id, business_id))
  );

-- MIGRATION 6 — Tighten ca_exceptions
DROP POLICY IF EXISTS "firm staff manage exceptions" ON public.ca_exceptions;
CREATE POLICY "firm staff manage exceptions" ON public.ca_exceptions
  FOR ALL USING (
    user_in_ca_firm(ca_firm_id)
    AND (business_id IS NULL OR ca_firm_has_client_access(ca_firm_id, business_id))
  );

-- MIGRATION 7 — Tighten ca_reminders
DROP POLICY IF EXISTS "firm access reminders" ON public.ca_reminders;
CREATE POLICY "firm access reminders" ON public.ca_reminders
  FOR ALL USING (
    user_in_ca_firm(ca_firm_id)
    AND (business_id IS NULL OR ca_firm_has_client_access(ca_firm_id, business_id))
  );

-- MIGRATION 8 — Tighten ca_follow_up_rules with privilege separation
DROP POLICY IF EXISTS "firm access follow up rules" ON public.ca_follow_up_rules;
CREATE POLICY "firm staff read follow up rules" ON public.ca_follow_up_rules
  FOR SELECT USING (user_in_ca_firm(ca_firm_id));
CREATE POLICY "firm managers write follow up rules" ON public.ca_follow_up_rules
  FOR INSERT WITH CHECK (ca_can(ca_firm_id, 'manage_clients'));
CREATE POLICY "firm managers update follow up rules" ON public.ca_follow_up_rules
  FOR UPDATE USING (ca_can(ca_firm_id, 'manage_clients'));
CREATE POLICY "firm managers delete follow up rules" ON public.ca_follow_up_rules
  FOR DELETE USING (ca_can(ca_firm_id, 'manage_clients'));

-- MIGRATION 9 — Tighten ca_sync_jobs with write restriction
DROP POLICY IF EXISTS "firm access sync jobs" ON public.ca_sync_jobs;
CREATE POLICY "firm staff read sync jobs" ON public.ca_sync_jobs
  FOR SELECT USING (user_in_ca_firm(ca_firm_id));
CREATE POLICY "firm staff write sync jobs" ON public.ca_sync_jobs
  FOR INSERT WITH CHECK (user_in_ca_firm(ca_firm_id));
CREATE POLICY "firm staff update sync jobs" ON public.ca_sync_jobs
  FOR UPDATE USING (user_in_ca_firm(ca_firm_id));

-- MIGRATION 10 — Restrict ca_invoices to privileged roles
DROP POLICY IF EXISTS "Firm staff manage their invoices" ON public.ca_invoices;
CREATE POLICY "firm staff read invoices" ON public.ca_invoices
  FOR SELECT USING (user_in_ca_firm(ca_firm_id) AND ca_firm_has_client_access(ca_firm_id, business_id));
CREATE POLICY "firm managers write invoices" ON public.ca_invoices
  FOR INSERT WITH CHECK (ca_can(ca_firm_id, 'manage_clients') AND ca_firm_has_client_access(ca_firm_id, business_id));
CREATE POLICY "firm managers update invoices" ON public.ca_invoices
  FOR UPDATE USING (ca_can(ca_firm_id, 'manage_clients') AND ca_firm_has_client_access(ca_firm_id, business_id));
CREATE POLICY "firm managers delete invoices" ON public.ca_invoices
  FOR DELETE USING (ca_can(ca_firm_id, 'manage_clients') AND ca_firm_has_client_access(ca_firm_id, business_id));

-- MIGRATION 11 — Prevent schedule manipulation by non-privileged users
DROP POLICY IF EXISTS "CA schedule insert" ON public.ca_report_schedules;
DROP POLICY IF EXISTS "CA schedule update" ON public.ca_report_schedules;
DROP POLICY IF EXISTS "CA schedule delete" ON public.ca_report_schedules;
CREATE POLICY "firm managers write schedules" ON public.ca_report_schedules
  FOR INSERT WITH CHECK (ca_can(ca_firm_id, 'manage_clients'));
CREATE POLICY "firm managers update schedules" ON public.ca_report_schedules
  FOR UPDATE USING (ca_can(ca_firm_id, 'manage_clients'));
CREATE POLICY "firm managers delete schedules" ON public.ca_report_schedules
  FOR DELETE USING (ca_can(ca_firm_id, 'manage_clients'));

-- MIGRATION 12 — DB constraints to prevent bad alert scheduling
ALTER TABLE public.ca_follow_up_rules
  ADD CONSTRAINT chk_wait_days_positive CHECK (wait_days > 0);

ALTER TABLE public.ca_follow_up_rules
  ADD CONSTRAINT uq_firm_trigger_wait UNIQUE (ca_firm_id, trigger_event, wait_days, action_type);

ALTER TABLE public.ca_report_schedules
  ADD CONSTRAINT chk_day_of_month CHECK (day_of_month IS NULL OR (day_of_month >= 1 AND day_of_month <= 28));