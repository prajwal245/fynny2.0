# WhatsApp templates: the right account, the six templates, Utility only

FynHelp sends **six** WhatsApp templates. All six must be **Utility** (never Marketing), English (`en`), on the **same WhatsApp Business Account that owns the number FynHelp sends from**. Templates made on a different account can never be sent from that number.

| Template | Used for | Variables |
|---|---|---|
| `document_request_v2` | First request to a firm's client | 4 |
| `document_followup_v2` | Gentle reminder (day 3) | 4 |
| `document_final_v2` | Final reminder (day 7) | 4 |
| `fh_setup_help` | FynHelp to a firm that has not finished setting up | 3 |
| `fh_trial_update` | FynHelp to a firm about its trial | 3 |
| `fh_plan_help` | FynHelp to a firm about its plan or payment | 3 |

Old templates such as `_fh_doc_reminder` and `_fh_doc_request` are **Marketing**, so FynHelp never uses them. Leave them alone.

## Step 1. Find the account that owns your sending number
1. Open **business.facebook.com → Business settings → Accounts → WhatsApp accounts**.
2. Click each account and look at its **Phone numbers**. The one that lists your FynHelp number (for example +91 96063 70717) is the right account.
3. Copy that account's ID. It is also the `asset_id` in the WhatsApp Manager address bar when that account is selected. Your current one: **`1142917261543611`**. The `business_id` in the same address is the business, not the account, so do not use it.
4. In WhatsApp Manager, check the account name at the top left is the one you found. If you used a different account before, switch to this one with the account picker before creating anything.

## Step 2. Get a permanent token for that account
1. **Business settings → Users → System users**: open (or create) a system user.
2. **Add assets → WhatsApp accounts**: add the account from Step 1 with full control.
3. **Generate token** for your app with `whatsapp_business_management` and `whatsapp_business_messaging`, never expiring. Keep it secret.
4. Also copy the **Phone number ID** (WhatsApp Manager → Phone numbers → your number → the long ID, not the phone number).

## Step 3. Check and create the templates from your computer
```
export WHATSAPP_ACCESS_TOKEN=<token>
export WHATSAPP_WABA_ID=1142917261543611
export WHATSAPP_DEFAULT_PHONE_NUMBER_ID=<phone number ID>
node scripts/whatsapp-templates.mjs            # checks the account, lists templates, shows what is missing
node scripts/whatsapp-templates.mjs --apply    # creates only the missing ones
```
The script first confirms your sending number is on the account (a red cross means it is the wrong account) and flags any template that is not Utility. It never changes an existing template.

## Step 4. Or create them by hand in WhatsApp Manager
**Message templates → Create template** on the right account. For each: category **Utility**, language **English**, no header or footer, add the body below and the four buttons, add sample values, submit.

Samples for the three document templates: `{{1}}` Asha, `{{2}}` Acme Traders, `{{3}}` Bank statement (Sep 2026), `{{4}}` Rao & Co. Buttons: **Visit website, Dynamic**, text `Upload documents`, URL `https://fynhelp.com/u/{{1}}` (sample `Xk3p9QmZ7aT2vL8wN4rB6yHd1cEfGj0s`); then Quick replies `Sending today`, `Need more time`, `Stop reminders`.

```
document_request_v2
Hello {{1}}, this is {{4}}. For {{2}} we are still waiting for: {{3}}. Please reply here with the file attached. Thank you.

document_followup_v2
Hello {{1}}, a gentle reminder from {{4}}. For {{2}} we are still waiting for: {{3}}. Please reply here with the file attached, or use the buttons below. Thank you.

document_final_v2
Hello {{1}}, this is {{4}} with a final reminder. For {{2}} we still need: {{3}}. Please send it here, or tell us when you can, so we can complete the work on time. Thank you.
```

Samples for the three FynHelp templates: `{{1}}` Asha, `{{2}}` Rao & Co, `{{3}}` as shown. Buttons: **Visit website, Static**, text `Open FynHelp`, URL `https://fynhelp.com/app`; then Quick replies `Call me`, `Not now`, `Stop messages`.

```
fh_setup_help        ({{3}} sample: The next step is to add your first client, which takes about 2 minutes.)
Hello {{1}}, this is the FynHelp team. You started setting up {{2}}. {{3}} If you would like a hand, tap a button below and a person will help.

fh_trial_update      ({{3}} sample: ends in 2 days)
Hello {{1}}, a note from FynHelp about the trial for {{2}}: it {{3}}. Nothing you have done is lost. Would you like help choosing a plan or finishing a client?

fh_plan_help         ({{3}} sample: was not completed)
Hello {{1}}, this is FynHelp about the plan for {{2}}. The payment {{3}}. Nothing is lost, and we can help you finish. Tap a button below.
```

## Keeping them Utility
No emojis, offers, discounts or words like "urgent" or "limited time". Keep each message about one person's own account or documents. If Meta changes a category to Marketing, reword it plainly and submit it under a new name (`_v3`); a deleted name is locked for about 30 days.

## Step 5. Switch the app to the right account (Vercel → Production variables), then redeploy
| Variable | Value |
|---|---|
| `WHATSAPP_WABA_ID` | `1142917261543611` (digits only) |
| `WHATSAPP_DEFAULT_PHONE_NUMBER_ID` | the Phone number ID from Step 2 |
| `WHATSAPP_ACCESS_TOKEN` | the permanent token from Step 2 |
| `WHATSAPP_CHASE_BUTTONS` | `url_first` (or `qr_first`, see the preview order in WhatsApp Manager) |

Names need no variables: the app looks for the six names above. Once they are approved, Admin → System Health shows "WhatsApp reminder messages" as working.
