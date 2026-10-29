# WhatsApp templates, buttons and the client upload link

How a reminder reaches a client, what to submit to Meta, and what happens when the client taps.

## The client's journey

1. The Chaser sends a reminder from FynHelp's number (or the firm's own).
2. The client taps one of four buttons:

| Button | What happens | Credit |
|---|---|---|
| **Upload documents** | Opens `https://fynhelp.com/u/<token>`: a mobile page, no login, shows who is asking and what is needed, takes photos, PDFs, Excel and CSV (15 MB each, up to 25 files). Files go through the normal Extract pipeline; the chase closes by itself when the document arrives. | none |
| **Sending today** | The chase pauses for 1 day. The client gets a thank-you with a fresh upload link. The tap is on the chase timeline and the firm gets a notification. | none |
| **Need more time** | Pauses 3 days. Same reply and link. | none |
| **Stop reminders** | Reminders are switched off for this client. Confirmed to the client. | none |

3. Any tap or reply opens WhatsApp's 24-hour window. Inside it, everything we send is free-form text: our answer, and the receipt ("Received your file. Thank you.") when files arrive on WhatsApp.

**A reminder inside an open 24-hour window is sent as free text with the same three reply buttons and the upload link, and costs the firm no credit.** Only the template (used when the window is closed) costs one credit on FynHelp's shared number.

## What to submit in WhatsApp Manager

A chase has three stages, so there are **three templates**. They have the same four body fields and the same four buttons, so the app treats them alike; only the wording changes.

| Stage | When | Template name | Env variable |
|---|---|---|---|
| Request | reminder 1 (day 0) | `document_request_v2` | `WHATSAPP_CHASE_TEMPLATE` |
| Gentle follow-up | reminder 2 (day 3) | `document_followup_v1` first, then `document_followup_v2` | `WHATSAPP_FOLLOWUP_TEMPLATE` |
| Final reminder | reminder 3 (day 7), then the partner is told on day 10 | `document_final_v2` | `WHATSAPP_FINAL_TEMPLATE` |

If a stage has no template of its own, it uses the one before it, so you can start with the first and add the others later. The existing approved `document_request` keeps working until you switch.

Common to all three: **Category Utility**, language English (`en`), no header or footer. Examples Meta asks for: `{{1}}` Asha, `{{2}}` Acme Traders, `{{3}}` Bank statement (Sep 2026), `{{4}}` Rao & Co.

**Bodies:**

`document_request_v2`
```
Hello {{1}}, this is {{4}}. For {{2}} we are still waiting for: {{3}}. Please reply here with the file attached. Thank you.
```

`document_followup_v2`
```
Hello {{1}}, a gentle reminder from {{4}}. For {{2}} we are still waiting for: {{3}}. Please reply here with the file attached, or use the buttons below. Thank you.
```

`document_final_v2`
```
Hello {{1}}, this is {{4}} with a final reminder. For {{2}} we still need: {{3}}. Please send it here, or tell us when you can, so we can complete the work on time. Thank you.
```

**Buttons** (the same four on each, created in this order or the other, see `WHATSAPP_CHASE_BUTTONS` below):

1. **Call to action → Visit website → Dynamic**, label `Upload documents`, URL `https://fynhelp.com/u/{{1}}`. Example value: `Xk3p9QmZ7aT2vL8wN4rB6yHd1cEfGj0s`. Meta's rule is one variable, at the very end of the URL, which is exactly this.
2. **Quick reply** `Sending today`
3. **Quick reply** `Need more time`
4. **Quick reply** `Stop reminders`

### What "Need more time" does
It pauses the chase for 3 days (the safe default) and immediately asks **"When can you send it?"** with three reply buttons: **Tomorrow**, **In 3 days**, **Next week**. The client's answer replaces the default pause (2, 4 or 8 days, so we never remind on the day they promised) and is written to the timeline. This second message is inside the window the tap just opened, so it is free.

### Keeping it a Utility template
Meta can move a template to Marketing (about 6 times the price) if it reads like a nudge or promotion. This one stays factual: it names the person, the client, the specific document and who is asking. Do not add offers, emojis or urgency words. After approval, check the category shown in WhatsApp Manager; if it says Marketing, tell us, because the credit price assumes Utility.

## It picks the right template by itself
FynHelp reads your templates from Meta (every few minutes) and, for each reminder, uses the first one that is **approved, not Marketing**, and has either no buttons or exactly ours. The order it tries:

| Reminder | Tries, in order |
|---|---|
| 1 | `document_request_v2`, then `document_request` |
| 2 | `document_followup_v1`, `document_followup_v2`, then the reminder 1 list |
| 3 | `document_final_v2`, then the reminder 2 list |

So while a new template is **in review** the older approved one keeps sending, and the moment Meta approves the new one it takes over, with the button order read from the template itself. Nothing to flip. **This needs `WHATSAPP_WABA_ID`** (your WhatsApp Business Account ID, in Vercel) so FynHelp can read the list. Settings → WhatsApp → **Your reminder messages** shows each stage, its status and what it will send, plus a preview of what the client sees.

Without `WHATSAPP_WABA_ID` it falls back to the settings below.

## Switching it on by settings (only if you do not use the automatic way)

| Variable | Value |
|---|---|
| `WHATSAPP_CHASE_TEMPLATE` | `document_request_v2` |
| `WHATSAPP_FOLLOWUP_TEMPLATE` | optional; when set it replaces the default `document_followup_v1`, then `_v2` order |
| `WHATSAPP_FINAL_TEMPLATE` | `document_final_v2` (optional) |
| `WHATSAPP_CHASE_BUTTONS` | `url_first` if the Upload button is listed first in WhatsApp Manager, `qr_first` if the three quick replies come first. (`on` = `url_first`.) |
| `PUBLIC_APP_URL` | `https://fynhelp.com` (the address in the upload link) |

Redeploy after changing them. Check Settings → WhatsApp → **Check connection**: each template line should say `APPROVED, utility`. If it says Marketing, the check turns red and tells you to reword and resubmit.

If you switch buttons on **before** the template is approved, sends fail with a template error and the Chaser retries the next day; nothing is lost, but switch on only after approval.

## Safety of the upload link

- The link holds a random 192-bit token. Only its SHA-256 hash is stored.
- It belongs to one chase and one client, expires after 14 days, and takes at most 25 files.
- Every check runs on the server: token, expiry, limit, type (the file's first bytes must match its claimed type, so a renamed program is refused), size.
- The page shows only the firm name, client name and the items requested.
- Pages are `noindex` and send no referrer.
- Links can be revoked by setting `revoked_at` on the row.

## Not yet built (later)

- Filing-status template (`filing_needs_input`): only for client-specific items, never broadcasts, or Meta treats it as Marketing.
- Hindi version of the template.
- A "Revoke link" button in the app.
