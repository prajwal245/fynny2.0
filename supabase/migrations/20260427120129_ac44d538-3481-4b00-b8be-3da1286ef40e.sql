-- Enable realtime for ca_notifications so the CA Notifications page receives
-- live INSERTs. RLS on ca_notifications already restricts SELECT to rows
-- where ca_firm_id = get_user_ca_firm_id(), so realtime delivery is
-- automatically scoped per CA firm — no client-side filter alone is trusted.
ALTER PUBLICATION supabase_realtime ADD TABLE public.ca_notifications;

-- Ensure full row payloads are sent (needed for client-side INSERT handling).
ALTER TABLE public.ca_notifications REPLICA IDENTITY FULL;