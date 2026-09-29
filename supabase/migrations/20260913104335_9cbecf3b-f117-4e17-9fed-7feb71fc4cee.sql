INSERT INTO public.ca_compliance_events (ca_firm_id, business_id, event_type, status, due_date, filing_period, notes)
SELECT
  'e9036833-7aee-48eb-b7b0-651a263c867c'::uuid as ca_firm_id,
  c.business_id,
  evt.event_type,
  evt.status,
  evt.due_date::date,
  evt.filing_period,
  null as notes
FROM public.ca_clients c
CROSS JOIN (VALUES
  ('GSTR1',         'overdue',  '2026-07-11', 'Jun 2026'),
  ('GSTR3B',        'overdue',  '2026-07-20', 'Jun 2026'),
  ('GSTR1',         'pending',  '2026-08-11', 'Jul 2026'),
  ('GSTR3B',        'pending',  '2026-08-20', 'Jul 2026'),
  ('GSTR1',         'pending',  '2026-09-11', 'Aug 2026'),
  ('GSTR3B',        'pending',  '2026-09-20', 'Aug 2026'),
  ('TDS_QUARTERLY', 'overdue',  '2026-07-31', 'Q1 FY 2026-27'),
  ('GSTR9',         'pending',  '2026-12-31', 'FY 2025-26'),
  ('ROC_ANNUAL',    'pending',  '2026-09-30', 'FY 2025-26')
) AS evt(event_type, status, due_date, filing_period)
WHERE c.ca_firm_id = 'e9036833-7aee-48eb-b7b0-651a263c867c'::uuid
  AND c.business_id IS NOT NULL
ON CONFLICT DO NOTHING;