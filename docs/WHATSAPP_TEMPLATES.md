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

Create **one** new template. Keep the old `document_request` until this one is approved: the app keeps using it until you switch.

| Field | Value |
|---|---|
| Name | `document_request_v2` |
| Category | **Utility** |
| Language | English (`en`). Add Hindi (`hi`) later if you want. |
| Header / Footer | none |

**Body** (same wording as the approved one, so approval is quick):

```
Hello {{1}}, this is {{4}}. For {{2}} we are still waiting for: {{3}}. Please reply here with the file attached. Thank you.
```

Examples Meta asks for: `{{1}}` Asha, `{{2}}` Acme Traders, `{{3}}` Bank statement (Sep 2026), `{{4}}` Rao & Co.

**Buttons** (4):

1. **Call to action → Visit website → Dynamic**, label `Upload documents`, URL `https://fynhelp.com/u/{{1}}`. Example value: `Xk3p9QmZ7aT2vL8wN4rB6yHd1cEfGj0s`.
   Meta's rule is one variable, at the very end of the URL, which is exactly this.
2. **Quick reply** `Sending today`
3. **Quick reply** `Need more time`
4. **Quick reply** `Stop reminders`

### Keeping it a Utility template
Meta can move a template to Marketing (about 6 times the price) if it reads like a nudge or promotion. This one stays factual: it names the person, the client, the specific document and who is asking. Do not add offers, emojis or urgency words. After approval, check the category shown in WhatsApp Manager; if it says Marketing, tell us, because the credit price assumes Utility.

## Switching it on (Vercel)

| Variable | Value |
|---|---|
| `WHATSAPP_CHASE_TEMPLATE` | `document_request_v2` |
| `WHATSAPP_CHASE_BUTTONS` | `url_first` if the Upload button is listed first in WhatsApp Manager, `qr_first` if the three quick replies come first. (`on` = `url_first`.) |
| `PUBLIC_APP_URL` | `https://fynhelp.com` (the address in the upload link) |

Redeploy after changing them. Check Settings → WhatsApp → **Check connection**: the template line should say `APPROVED`.

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
