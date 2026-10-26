# Submit the three WhatsApp templates (copy and paste)

Use this when creating the templates in **Meta → WhatsApp Manager → Message templates → Create template**. Make **three** templates. Each one needs the four buttons.

**Use fresh names (`_v3`).** Do not reuse or delete the old names: a deleted template name is locked for about 30 days, and editing an approved template limits how often you can change it. Your old `document_request` keeps working until you switch.

---

## Settings that are the same for all three
| Field | Value |
|---|---|
| Category | **Utility** (not Marketing) |
| Name | see each template below (lowercase, underscores) |
| Language | **English** (`en`) |
| Header | None |
| Footer | None |
| Body variables | 4 (`{{1}}` to `{{4}}`) |

**Variable examples** (Meta asks for a sample of each):
| Variable | Example |
|---|---|
| `{{1}}` | Asha |
| `{{2}}` | Acme Traders |
| `{{3}}` | Bank statement (Sep 2026) |
| `{{4}}` | Rao & Co |

---

## Template 1: `document_request_v3` (first request)
**Body (paste exactly):**
```
Hello {{1}}, this is {{4}}. For {{2}} we are still waiting for: {{3}}. Please reply here with the file attached. Thank you.
```

## Template 2: `document_followup_v3` (gentle reminder)
**Body (paste exactly):**
```
Hello {{1}}, a gentle reminder from {{4}}. For {{2}} we are still waiting for: {{3}}. Please reply here with the file attached, or use the buttons below. Thank you.
```

## Template 3: `document_final_v3` (final reminder)
**Body (paste exactly):**
```
Hello {{1}}, this is {{4}} with a final reminder. For {{2}} we still need: {{3}}. Please send it here, or tell us when you can, so we can complete the work on time. Thank you.
```

---

## The four buttons (same on all three templates)
In the template form, find **Buttons** → **Add a button**. Add them **in this order**:

| # | Button type | Button text | Extra fields |
|---|---|---|---|
| 1 | **Visit website** | `Upload documents` | URL type: **Dynamic**. URL: `https://fynhelp.com/u/{{1}}`. Sample value: `Xk3p9QmZ7aT2vL8wN4rB6yHd1cEfGj0s` |
| 2 | **Quick reply** | `Sending today` | none |
| 3 | **Quick reply** | `Need more time` | none |
| 4 | **Quick reply** | `Stop reminders` | none |

Rules Meta enforces (this setup follows them): the URL's `{{1}}` is the **only** variable in the URL and sits at the **very end**; button text is 25 characters or fewer; quick replies are grouped together.

If Meta shows the quick replies **above** the Upload button in the preview, it has reordered them. That is fine; just note which order the preview shows (see "Order" below).

---

## Keeping it approved as Utility
- Do not add emojis, offers, discounts or words like "urgent" or "limited time".
- Keep the body factual: who is asking, which client, which document.
- After approval, open each template and check the category says **Utility**. If Meta changed it to Marketing, reword it more plainly and resubmit.
- Approval is usually minutes to a day. A rejection comes with a reason; fix it and resubmit under a new name (for example `_v4`).

---

## After all three say APPROVED: switch the app on (Vercel → Settings → Environment Variables → Production)
| Variable | Value |
|---|---|
| `WHATSAPP_CHASE_TEMPLATE` | `document_request_v3` |
| `WHATSAPP_FOLLOWUP_TEMPLATE` | `document_followup_v3` |
| `WHATSAPP_FINAL_TEMPLATE` | `document_final_v3` |
| `WHATSAPP_CHASE_BUTTONS` | `url_first` |
| `PUBLIC_APP_URL` | `https://fynhelp.com` |

**Order:** use `url_first` if the preview shows **Upload documents first** and the three quick replies after it. Use `qr_first` if the preview shows the three quick replies first and the Upload button last. A wrong choice makes Meta reject the send with a template error, and nothing is charged; switch the value and redeploy.

**Redeploy** after saving the variables.

## Test before you rely on it
1. Settings → WhatsApp → **Check connection**: each template line says `APPROVED, utility`.
2. Create a chase with **WhatsApp**, using your own number, from a state where you have not messaged the number in the last 23 hours. You should receive the template with four buttons.
3. Tap **Upload documents** on your phone, send a file, and see it in Documents.
4. Tap **Need more time**; you should get "When can you send it?" with Tomorrow / In 3 days / Next week.
5. Reply to the number, then create another chase: this one arrives as free text with three reply buttons and the upload link (no credit used).

## If a send fails
| Message in the app | What it means |
|---|---|
| "The message template is not approved or does not exist in this language" | Name in Vercel does not match, or not approved yet. |
| "The template's fields do not match…" | The template does not have exactly 4 body fields and the four buttons above, or `WHATSAPP_CHASE_BUTTONS` is on for a template that has no buttons. |
| "Could not create the client's upload link" | The `20261029090000_upload_links.sql` migration has not been applied. |
