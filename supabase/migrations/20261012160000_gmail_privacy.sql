-- Gmail privacy: emails FynHelp passes over keep no subject or sender.
-- Earlier skips stored both; remove them. (Documents from senders with no
-- link to a client are removed by the app on the next Gmail check, since
-- their files live in storage.)
update public.ca_gmail_processed
   set subject = null, sender_email = null, filename = null
 where outcome = 'skipped'
   and (subject is not null or sender_email is not null or filename is not null);
