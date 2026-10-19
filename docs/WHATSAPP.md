# WhatsApp

Two ways a CA firm uses WhatsApp, and the one-time setup for FynHelp's own number.

| | What | Who sets it up |
|---|---|---|
| **FynHelp's number (default)** | Follow-ups to the firm's clients go from one verified FynHelp number, as approved templates that name the firm. Replies and documents come back and are filed under the right client. | FynHelp, once. Each firm then switches it on in Settings → WhatsApp follow-ups. |
| **Quick-send (always works)** | The chaser prepares a message and a person taps a link to send it from their own WhatsApp. | Nobody |
| **The firm's own number (planned)** | The same, from the firm's own number, through Meta Embedded Signup. | Needs FynHelp to be a Meta Tech Provider. |

## How a round works

1. The Chaser's schedule (day 0, 3, 7) makes a round due. If WhatsApp is on and the contact has a usable number that has not replied STOP, the round goes on WhatsApp; otherwise by email as before.
2. **Approve mode (the default):** the Chaser prepares a draft and parks the chase. A partner sees "N WhatsApp messages ready" on the Chaser page and approves them. Approving is what uses up the round. **Automatic mode:** it sends on schedule.
3. Message wording is one of three approved templates (first request, reminder, final). Round 1 asks, middle rounds remind, the last round says it is the last.
4. Delivery receipts (sent, delivered, read, failed) come back on the same webhook and update each message.
5. The client replies with a photo or PDF: it is stored, read by Extract, and the chase closes. A free-form "Received, thank you" goes back within the 24 hour window.
6. A reply of STOP (whole message only) ends WhatsApp reminders for that number for **every** firm, and cancels anything waiting for it.

## Safeguards

- Off by default; a partner must confirm that the firm's clients agreed to receive WhatsApp messages (stored with who and when).
- Per-firm daily limit (default 100) and a monthly allowance by plan: Essential none, Firm 500, Scale 2000. **These are placeholders**; past the allowance messages are held, not charged. Per-message billing needs a price and is not built.
- Do-not-disturb clients, invalid numbers, opted-out numbers and a second message for the same chase on the same day are never sent.
- Only template messages are sent unprompted (Meta's rule). A message that fails is recorded with the reason in plain words.
- One shared number means one firm's behaviour can affect its quality rating, which is why the limits exist.

## One-time setup for FynHelp's number (FynHelp does this, not the firms)

Meta's screens change; use the names as a guide.

1. **Business account.** business.facebook.com: create or open FynHelp's business and complete **Business Verification** (needed before real clients can be messaged; can take days).
2. **App.** developers.facebook.com → **Create App** → type **Business** → add the **WhatsApp** product.
3. **Number.** WhatsApp → **API Setup** → add FynHelp's WhatsApp number (not signed in to the normal WhatsApp app). Note its **Phone number ID** and the **WhatsApp Business Account ID**.
4. **Secrets.**
   - **App Secret:** App settings → Basic → App Secret.
   - **Permanent token:** Business Settings → System users → add an Admin system user, assign the app and the WhatsApp account, generate a token with `whatsapp_business_messaging` and `whatsapp_business_management`, expiry **never**. (The 24 hour token on API Setup must not be used.)
   - **Verify token:** make up a long random string.
5. **Environment variables** on the host, then redeploy:

   | Name | Value |
   |---|---|
   | `WHATSAPP_APP_SECRET` | the App Secret |
   | `WHATSAPP_ACCESS_TOKEN` | the permanent token |
   | `WHATSAPP_VERIFY_TOKEN` | the string you made up |
   | `WHATSAPP_PLATFORM_PHONE_NUMBER_ID` | the Phone number ID of FynHelp's number |

6. **Webhook.** WhatsApp → Configuration → Webhook: callback `https://YOUR-DOMAIN/api/public/whatsapp-webhook`, verify token as above, **Verify and save**; subscribe to **messages** (this also delivers the delivered/read/failed receipts). Switch the app from Development to **Live**.
7. **Templates.** WhatsApp Manager → Message templates → create the three below, category **Utility**, language **English**. Approval takes hours to days. Until they are approved, sending fails with "template is not approved" and the firm sees that in plain words.
8. **Background check.** The Chaser's automatic rounds run from the practice tick. Call `GET /api/public/practice-tick` with `Authorization: Bearer <CRON_SECRET>` every 5 minutes (docs/DEPLOY.md), or rounds only run daily.

## Templates to submit (word for word)

The code sends these exactly; the four variables are filled in order. Add sample values when Meta asks, for example: Ravi, Sharma & Co, bank statement for September 2026, Kaveri Fashions.

**`fh_doc_request`**
```
Hi {{1}}, {{2}} needs the {{3}} for {{4}}. Please reply to this chat with a photo or PDF. Reply STOP to opt out.
```

**`fh_doc_reminder`**
```
Hi {{1}}, a gentle reminder from {{2}}: we still need the {{3}} for {{4}}. Reply here with a photo or PDF. Reply STOP to opt out.
```

**`fh_doc_final`**
```
Hi {{1}}, final reminder from {{2}}: the {{3}} for {{4}} is still pending. Please send it today or contact {{2}} directly. Reply STOP to opt out.
```

If wording changes, change `src/lib/practice/whatsapp/templates.ts` and resubmit under a new name; an approved template cannot be edited in place.

## Replies and routing

Everyone writes to the same number, so a reply is routed by sender: the firm that messaged that person most recently (within 30 days); else the only firm that has the number as a client; else the sender is told to reply to their CA's message. A bounded scan of clients is used for the last case; index the phone digits if clients reach tens of thousands.

## Not built yet

Per-message billing beyond the allowance; the firm's own number (Embedded Signup); Hindi and other-language templates; a delivery report per chase on the timeline (receipts are stored per message); escalating when drafts sit unapproved for days.
