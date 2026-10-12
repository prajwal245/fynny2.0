-- Gmail intake used to skip every sender at fynhelp.com as "email from FynHelp
-- or a mail server", which also skipped real people (a teammate forwarding a
-- client's files). The rule now skips only FynHelp's sending address and
-- mail-server bounces. Forget those wrong skips and widen each affected
-- inbox's window, so the next check reads the emails again.

with wrong as (
  select connection_id, min(created_at) as first_at
  from public.ca_gmail_processed
  where outcome = 'skipped'
    and reason = 'email from FynHelp or a mail server'
    and sender_email is not null
    and lower(sender_email) like '%@fynhelp.com'
    and lower(sender_email) !~ '^(no-?reply|notifications?|alerts?|bounces?|mailer)(\+[^@]*)?@'
  group by connection_id
)
update public.ca_gmail_connections c
   set last_polled_at = least(coalesce(c.last_polled_at, w.first_at), w.first_at - interval '1 hour')
  from wrong w
 where c.id = w.connection_id;

delete from public.ca_gmail_processed
 where outcome = 'skipped'
   and reason = 'email from FynHelp or a mail server'
   and sender_email is not null
   and lower(sender_email) like '%@fynhelp.com'
   and lower(sender_email) !~ '^(no-?reply|notifications?|alerts?|bounces?|mailer)(\+[^@]*)?@';
