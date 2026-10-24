-- Chaser timeline: events for the "pause until promised date", WhatsApp delivery receipts,
-- and client replies / opt-outs. Without these the CHECK would reject the rows.
ALTER TABLE public.ca_chaser_events DROP CONSTRAINT IF EXISTS ca_chaser_events_event_type_check;
ALTER TABLE public.ca_chaser_events ADD CONSTRAINT ca_chaser_events_event_type_check
  CHECK (event_type IN (
    'created','sent','replied','escalated','resolved','skipped','auto_resolved','auto_escalated',
    'whatsapp_quick_send','reopened',
    'snoozed','whatsapp_status','client_replied','client_stopped'
  ));

-- Delivery receipts and replies look the original message up by its WhatsApp id.
CREATE INDEX IF NOT EXISTS ca_chaser_events_wamid_idx
  ON public.ca_chaser_events ((metadata->>'wamid'))
  WHERE metadata ? 'wamid';
CREATE INDEX IF NOT EXISTS ca_chaser_events_wa_message_idx
  ON public.ca_chaser_events ((metadata->>'wa_message_id'))
  WHERE metadata ? 'wa_message_id';
