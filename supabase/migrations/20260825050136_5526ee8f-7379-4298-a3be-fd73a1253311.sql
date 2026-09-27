CREATE TABLE IF NOT EXISTS public.ca_follow_up_rules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  rule_name text NOT NULL,
  trigger_event text NOT NULL,
  wait_days int NOT NULL DEFAULT 3,
  action_type text NOT NULL DEFAULT 'email',
  escalate_to_role text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_follow_up_rules TO authenticated;
GRANT ALL ON public.ca_follow_up_rules TO service_role;
ALTER TABLE public.ca_follow_up_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "firm access follow up rules" ON public.ca_follow_up_rules;
CREATE POLICY "firm access follow up rules" ON public.ca_follow_up_rules
  FOR ALL TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id))
  WITH CHECK (public.user_in_ca_firm(ca_firm_id));
CREATE INDEX IF NOT EXISTS ca_follow_up_rules_firm_idx ON public.ca_follow_up_rules(ca_firm_id);

CREATE TABLE IF NOT EXISTS public.ca_reminders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ca_firm_id uuid NOT NULL REFERENCES public.ca_firms(id) ON DELETE CASCADE,
  business_id uuid,
  created_by uuid,
  title text NOT NULL,
  notes text,
  remind_at timestamptz NOT NULL,
  is_done boolean NOT NULL DEFAULT false,
  done_at timestamptz,
  linked_entity_type text,
  linked_entity_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ca_reminders TO authenticated;
GRANT ALL ON public.ca_reminders TO service_role;
ALTER TABLE public.ca_reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "firm access reminders" ON public.ca_reminders;
CREATE POLICY "firm access reminders" ON public.ca_reminders
  FOR ALL TO authenticated
  USING (public.user_in_ca_firm(ca_firm_id))
  WITH CHECK (public.user_in_ca_firm(ca_firm_id));
CREATE INDEX IF NOT EXISTS ca_reminders_firm_due_idx ON public.ca_reminders(ca_firm_id, remind_at);
CREATE INDEX IF NOT EXISTS ca_reminders_business_idx ON public.ca_reminders(business_id);

ALTER TABLE public.ca_firms ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;

INSERT INTO public.ca_follow_up_rules (ca_firm_id, rule_name, trigger_event, wait_days, action_type, escalate_to_role)
SELECT f.id, 'First reminder — 3 days overdue', 'document_overdue', 3, 'email', null
FROM public.ca_firms f
WHERE NOT EXISTS (SELECT 1 FROM public.ca_follow_up_rules r WHERE r.ca_firm_id = f.id);