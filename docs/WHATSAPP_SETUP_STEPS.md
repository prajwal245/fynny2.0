# WhatsApp templates: the right account, the six templates, Utility only

FynHelp sends **six** WhatsApp templates. All six must be:

- **Category: Utility** (never Marketing)
- **Language: English (`en`)**
- on the **same WhatsApp Business Account that owns the number FynHelp sends from**. Templates made on a different account can never be sent from that number.

| # | Template name | Used for | Body variables | Buttons |
|---|---|---|---|---|
| 1 | `document_request_v2` | First request to a firm's client (day 0) | 4 | Upload, then 3 quick replies |
| 2 | `document_followup_v1` (used first), `document_followup_v2` (used if v1 is not approved) | Gentle reminder (day 3) | 4 | Upload, then 3 quick replies |
| 3 | `document_final_v2` | Final reminder (day 7) | 4 | Upload, then 3 quick replies |
| 4 | `fh_setup_help` | FynHelp to a firm that has not finished setting up | 3 | Open FynHelp, then 3 quick replies |
| 5 | `fh_trial_update` | FynHelp to a firm about its trial | 3 | Open FynHelp, then 3 quick replies |
| 6 | `fh_plan_help` | FynHelp to a firm about its plan or payment | 3 | Open FynHelp, then 3 quick replies |

> Old templates such as `_fh_doc_reminder` and `_fh_doc_request` are **Marketing**. FynHelp never uses them. Leave them alone.

---

## Step 1. Find the account that owns your sending number

1. Open **business.facebook.com → Business settings → Accounts → WhatsApp accounts**.
2. Click each account and look at its **Phone numbers**. The account that lists your FynHelp number (for example +91 96063 70717) is the right one.
3. Copy that account's **ID**. It is also the `asset_id` in the WhatsApp Manager address when that account is selected.
   - Your current account ID: **`1142917261543611`**
   - The `business_id` in the same address (`1378079198720845`) is the business, **not** the account. Do not use it.
4. In **WhatsApp Manager**, check the account name at the top left is the one you found. If you used another account before, switch with the account picker **before** creating anything.

## Step 2. Get a permanent token for that account

1. **Business settings → Users → System users**: open (or create) a system user.
2. **Add assets → WhatsApp accounts**: add the account from Step 1 with **full control**.
3. **Generate token** for your app with these permissions, set to never expire:
   - `whatsapp_business_management`
   - `whatsapp_business_messaging`
4. Copy the token and keep it secret.
5. Copy the **Phone number ID**: WhatsApp Manager → **Phone numbers** → your number → the long ID (not the phone number itself).

## Step 3. Check and create the templates from your computer (fastest)

```bash
export WHATSAPP_ACCESS_TOKEN=<token from Step 2>
export WHATSAPP_WABA_ID=1142917261543611
export WHATSAPP_DEFAULT_PHONE_NUMBER_ID=<Phone number ID from Step 2>

node scripts/whatsapp-templates.mjs            # checks the account, lists templates, shows what is missing
node scripts/whatsapp-templates.mjs --apply    # creates only the missing ones
```

What the script does:

| Check | Result you will see |
|---|---|
| Your sending number is on the account | `✓ Your sending number … is on this account.` |
| It is not (wrong account) | `✗ … is NOT on this account.` and it stops without creating anything |
| A template is Marketing | `<- NOT Utility` with the advice to reword and resubmit under a new name |
| A template already exists | `already there (STATUS, category, language)`; it is never changed |

Prefer to do it by hand? Use Step 4.

---

## Step 4. Create the templates by hand in WhatsApp Manager

**WhatsApp Manager → Message templates → Create template.** Do this on the account from Step 1, once for each template below.

### Fields that are the same for all six

| Field | What to choose |
|---|---|
| Category | **Utility** |
| Language | **English** |
| Header | **None** |
| Footer | **None** |
| Body | The text for that template (paste it exactly) |
| Variable samples | Meta asks for an example of each `{{n}}`; use the samples in each section |

### How to add the buttons

In the form, scroll to **Buttons → Add a button**. Add them **in the order shown**. Meta groups quick replies together and may show them above or below the website button in its preview. That is fine: note the order the preview shows (see Step 6).

Two kinds of button are used:

| Kind | In the form choose | Fields |
|---|---|---|
| **Dynamic website button** (documents templates) | Call to action → **Visit website** → URL type **Dynamic** | Button text, URL ending in `{{1}}`, a sample value |
| **Static website button** (FynHelp templates) | Call to action → **Visit website** → URL type **Static** | Button text, URL (no variable) |
| **Quick reply** | **Quick reply** | Button text only |

Meta's rules (this setup follows them): the URL's `{{1}}` is the **only** variable in the URL and sits at the **very end**; button text is **25 characters or fewer**.

---

### Template 1: `document_request_v2`

| Field | Value |
|---|---|
| Name | `document_request_v2` |
| Category / Language | Utility / English |

**Body (paste exactly):**
```
Hello {{1}}, this is {{4}}. For {{2}} we are still waiting for: {{3}}. Please reply here with the file attached. Thank you.
```

**Variable samples**

| Variable | Sample |
|---|---|
| `{{1}}` | Asha |
| `{{2}}` | Acme Traders |
| `{{3}}` | Bank statement (Sep 2026) |
| `{{4}}` | Rao & Co |

**Buttons (4, in this order)**

| # | Type | Button text | URL type | URL | URL sample |
|---|---|---|---|---|---|
| 1 | Visit website | `Upload documents` | Dynamic | `https://fynhelp.com/u/{{1}}` | `Xk3p9QmZ7aT2vL8wN4rB6yHd1cEfGj0s` |
| 2 | Quick reply | `Sending today` | | | |
| 3 | Quick reply | `Need more time` | | | |
| 4 | Quick reply | `Stop reminders` | | | |

---

### Template 2: `document_followup_v2`

| Field | Value |
|---|---|
| Name | `document_followup_v2` |
| Category / Language | Utility / English |

**Body (paste exactly):**
```
Hello {{1}}, a gentle reminder from {{4}}. For {{2}} we are still waiting for: {{3}}. Please reply here with the file attached, or use the buttons below. Thank you.
```

**Variable samples:** the same as Template 1.
**Buttons:** the same four as Template 1.

---

### Template 3: `document_final_v2`

| Field | Value |
|---|---|
| Name | `document_final_v2` |
| Category / Language | Utility / English |

**Body (paste exactly):**
```
Hello {{1}}, this is {{4}} with a final reminder. For {{2}} we still need: {{3}}. Please send it here, or tell us when you can, so we can complete the work on time. Thank you.
```

**Variable samples:** the same as Template 1.
**Buttons:** the same four as Template 1.

---

### Template 4: `fh_setup_help`

| Field | Value |
|---|---|
| Name | `fh_setup_help` |
| Category / Language | Utility / English |

**Body (paste exactly):**
```
Hello {{1}}, this is the FynHelp team. You started setting up {{2}}. {{3}} If you would like a hand, tap a button below and a person will help.
```

**Variable samples**

| Variable | Sample |
|---|---|
| `{{1}}` | Asha |
| `{{2}}` | Rao & Co |
| `{{3}}` | The next step is to add your first client, which takes about 2 minutes. |

**Buttons (4, in this order)**

| # | Type | Button text | URL type | URL |
|---|---|---|---|---|
| 1 | Visit website | `Open FynHelp` | Static | `https://fynhelp.com/app` |
| 2 | Quick reply | `Call me` | | |
| 3 | Quick reply | `Not now` | | |
| 4 | Quick reply | `Stop messages` | | |

---

### Template 5: `fh_trial_update`

| Field | Value |
|---|---|
| Name | `fh_trial_update` |
| Category / Language | Utility / English |

**Body (paste exactly):**
```
Hello {{1}}, a note from FynHelp about the trial for {{2}}: it {{3}}. Nothing you have done is lost. Would you like help choosing a plan or finishing a client?
```

**Variable samples**

| Variable | Sample |
|---|---|
| `{{1}}` | Asha |
| `{{2}}` | Rao & Co |
| `{{3}}` | ends in 2 days |

**Buttons:** the same four as Template 4.

---

### Template 6: `fh_plan_help`

| Field | Value |
|---|---|
| Name | `fh_plan_help` |
| Category / Language | Utility / English |

**Body (paste exactly):**
```
Hello {{1}}, this is FynHelp about the plan for {{2}}. The payment {{3}}. Nothing is lost, and we can help you finish. Tap a button below.
```

**Variable samples**

| Variable | Sample |
|---|---|
| `{{1}}` | Asha |
| `{{2}}` | Rao & Co |
| `{{3}}` | was not completed |

**Buttons:** the same four as Template 4.

---

## Step 5. Keep them Utility

| Do | Do not |
|---|---|
| Say who is asking, which client and which document | Use emojis |
| Keep each message about one person's own account or documents | Add offers, discounts or words like "urgent" or "limited time" |
| Use plain, factual wording | Send a message with nothing of theirs in it (a pure "checking in") |

After approval, open each template and check the category still says **Utility**. If Meta changed it to Marketing, reword it plainly and submit it under a **new name** (for example `_v3`). A deleted name is locked for about 30 days, so do not delete and reuse a name.

Approval is usually minutes to a day. A rejection comes with a reason; fix it and resubmit under a new name.

## Step 6. Switch the app to the right account

In **Vercel → Settings → Environment Variables → Production**, set these, then **redeploy**:

| Variable | Value |
|---|---|
| `WHATSAPP_WABA_ID` | `1142917261543611` (digits only) |
| `WHATSAPP_DEFAULT_PHONE_NUMBER_ID` | the Phone number ID from Step 2 |
| `WHATSAPP_ACCESS_TOKEN` | the permanent token from Step 2 |
| `WHATSAPP_CHASE_BUTTONS` | `url_first` if the preview shows **Upload documents first**, then the three quick replies; `qr_first` if the quick replies come first |

The six template names need no variables: the app looks for them by name.

## Step 7. Check it works

| Where | What you should see |
|---|---|
| WhatsApp Manager → Message templates | All six show **Active** and **Utility** |
| FynHelp Admin → System Health | "WhatsApp reminder messages" shows as working |
| A test chase by WhatsApp to your own number (not messaged in the last 23 hours) | The template arrives with its four buttons |
| Tap **Upload documents** and send a file | It appears in Documents |
| Tap **Need more time** | You get "When can you send it?" with Tomorrow / In 3 days / Next week |
| Tap **Stop messages** on a FynHelp message | No further WhatsApp to that number |

## If something fails

| What you see | What it means | What to do |
|---|---|---|
| The script says `✗ … NOT on this account` | The account ID and the sending number do not belong together | Redo Step 1; use the account that lists your number |
| The script says `This token cannot read account …` | The token's system user does not have this account | Redo Step 2: add the account to the system user and generate a new token |
| A template shows **Marketing** | Meta judged the wording promotional | Reword plainly (Step 5) and submit under a new name |
| A template shows **Rejected** | Meta gave a reason in WhatsApp Manager | Fix it and resubmit under a new name |
| Firms see "Failed" on a WhatsApp reminder | A fault only FynHelp can fix (template, token or number) | Check Admin → System Health, then Steps 1 to 6 |
