# Email (Gmail) Chaser: options and recommended flow

## What exists today
- `chaser/rules.ts`: follow-ups on days 0, 3, 7 from creation; after `max_follow_ups` unanswered it
  escalates to a person; no send when resolved, escalated, do-not-disturb, no email, or already chased today.
- `email.server.ts`: sends through Resend as "<Firm> via FynHelp <noreply@...>" with the firm as reply-to.
  Without `RESEND_API_KEY` the send is simulated.
- Gmail intake (`caGmail.*`, `gmailRules.ts`): reads the firm's Gmail, takes client attachments, matches
  them to the client; a matching document resolves the open chase.
- UI (`v2/pages/ChaserPage.tsx`): one chase per item, one fixed message, manual "send follow up".
  WhatsApp is on Firm and Scale only (not in the trial).

## Gaps that stop it feeling world class
1. Emails come from a FynHelp address, not the CA. Clients ignore or spam-filter unknown senders.
2. One fixed tone, and no "final notice".
3. A client with five missing items gets five separate emails.
4. No send window (a chase can land at 3 a.m. or on a Sunday).
5. Replies like "will send tomorrow" are not understood; the cadence keeps firing.
6. No visibility of what worked: reply rate, time to document, who is slowest.

## Option A: send from the firm's own Gmail (recommended)
Chase goes out as the CA, threaded in their Sent folder. Replies land in their inbox, and Gmail intake
already picks up the attachment and closes the chase. Highest reply rate and trust.
Needs: Gmail send scope on the existing connection (re-consent), per-firm daily send cap, unsubscribe/stop
reply handling. Risk: the firm's Gmail reputation, so keep volumes low and personal.

## Option B: send via FynHelp domain (today)
No consent needed, works for firms without Gmail, safest for deliverability control. Lower trust and
reply rate. Keep as the fallback and for trial/Essential.

## Option C: hybrid (what to ship)
Gmail send when the firm connected Gmail and opted in; FynHelp domain otherwise. Same engine, same rules.

## Recommended flow
1. **Trigger**: a missing item is created by hand, by a rule (month-end, GST due date) or by the Close
   checklist. Group all open items per client into one chase.
2. **Day 0**: friendly request listing every missing item, due date and "just reply with the file attached".
3. **Day 3**: short nudge, same thread (`In-Reply-To`), items still open only.
4. **Day 7**: firm but polite, names the consequence (filing date, late fee) when a deadline exists.
5. **Day 10**: partner is told; they choose WhatsApp, a call, or pause. No further automatic email.
6. **Stops at once** on: any matching document (any channel), a manual "resolved", client replies
   "stop"/do-not-disturb, or a reply that promises a date. A promise snoozes the chase to that date + 1 day.
7. **Send window**: 9:30 to 18:30 IST, Mon to Sat, skipping the client's snoozed days; deferred sends go next slot.
8. **Tone presets per firm** (Gentle / Standard / Firm) and a plain-text editor with merge fields
   (`{client}`, `{items}`, `{period}`, `{due}`). Always preview before first use.
9. **Client page** (link in the email, no login): list of what is missing, upload box, "I have sent it".
10. **Visibility**: per-firm dashboard of chases sent, reply rate, median days to document, slowest clients;
    weekly digest to the partner.

## Guardrails
- Never chase a client marked do-not-disturb; one email per client per day at most.
- Every send is logged on the chase timeline with channel and message id; failures are visible, not silent.
- Escalate, never send a third automatic message without a person seeing it.
- No AI in what is claimed to be owed; AI may only suggest the wording of an optional personal note.

## Built (option C)
- Cadence 0/3/7 then escalate on day 10; tone presets (Gentle / Standard / Firm); one grouped email per client.
- Send window 9:30-18:30 IST Mon-Sat (due chases wait for the next window).
- "Client promised it by" pause on the chase.
- Send from the firm's Gmail when a partner allows it in Settings (Google `gmail.send` consent) and switches it on;
  falls back to the FynHelp address on any Gmail failure, and asks for consent again if Google revokes it.
- Not built yet: client upload page, chaser dashboard, auto-detecting promises in reply text, editable templates.

## Build order
1. Group-per-client chase and tone presets (pure, testable in `rules.ts`).
2. Send window and promise-to-send snooze.
3. Gmail send (Option A) behind a per-firm switch, with the Resend fallback.
4. Client upload page and chaser dashboard.

## WhatsApp (official Cloud API)
Set on the server: `WHATSAPP_ACCESS_TOKEN` (permanent system-user token), `WHATSAPP_APP_SECRET`,
`WHATSAPP_VERIFY_TOKEN`; optional `WHATSAPP_WABA_ID` (lets Settings check the template),
`WHATSAPP_CHASE_TEMPLATE` (default `document_request`) and `WHATSAPP_TEMPLATE_LANG` (default `en`).

In Meta WhatsApp Manager create a **Utility** template named `document_request`, language English, body with four fields:
`Hello {{1}}, this is {{4}}. For {{2}} we are still waiting for: {{3}}. Please reply here with the file attached. Thank you.`
Point the webhook to `/api/public/whatsapp-webhook` and subscribe to `messages`.

Behaviour: manual "Send WhatsApp" and the optional automatic reminder (second reminder on) go out as that template;
delivered / read / failed receipts appear on the chase timeline; a text reply pauses the next nudge for two days and
notifies the team; STOP turns reminders off for that client; a returning document closes the chase. Without a token
and linked number the button falls back to opening WhatsApp with the message ready.

### WhatsApp: free text inside 24 hours, and any country
- When a client has written to the firm's number in the last 23 hours, the chase goes as plain text (same wording as
  the template). Otherwise, or if WhatsApp says the window closed, it goes as the approved template.
  `ca_whatsapp_contacts` holds one row per firm and number (last message time); rows older than 7 days are pruned daily.
- Phone numbers: `+` or `00` numbers are used as written. Numbers without a country code get the firm's home
  country code (Settings, WhatsApp Business; default India +91). India also accepts 10-digit mobiles and a leading 0.
  Matching inbound senders to clients compares normalised numbers, so 8-digit and other formats work.
- Quality protection: at most `WHATSAPP_DAILY_CAP_PER_FIRM` (default 200) automatic WhatsApp reminders per firm per IST day;
  past that the email still goes and WhatsApp is skipped. Per-run lookups are cached per firm, and the cap check is one indexed count.
