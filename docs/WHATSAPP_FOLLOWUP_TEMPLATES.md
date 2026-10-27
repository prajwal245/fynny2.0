# WhatsApp follow-ups for retention and usage: templates to submit

These are the messages FynHelp sends **to its own customers (the firms)** from FynHelp's WhatsApp number, to help them finish setting up, finish a trial, or fix a payment. They are separate from the Chaser, which messages a firm's clients.

## The rules the system follows
- **Only about the person's own account:** their set-up, their trial, their plan or their payment. Messages with nothing of theirs in them (a pure "checking in") are **not** sent on WhatsApp: Meta treats them as Marketing, and a person decides to call.
- **Only with consent.** The sign-up box and the Settings box ("Message me on WhatsApp about my set-up, my trial and my plan") are unticked by default. Nothing goes to anyone who has not ticked it.
- **Daytime only** (9 am to 8 pm IST), **at most one message to a number every 3 days**, once per follow-up.
- **Stop is honoured at once.** The "Stop messages" button, or replying STOP, switches WhatsApp off for that number for good.
- **FynHelp pays**: these do not use a firm's credits.
- A **Marketing** template, one still in review, or one without the right buttons is **never used**. Those follow-ups wait, and a person handles them.

## Create three templates (WhatsApp Manager → Message templates → Create)
Category **Utility**, language **English (`en`)**, no header or footer. Variable examples: `{{1}}` Asha, `{{2}}` Rao & Co.

### 1. `fh_setup_help`  (unfinished sign-up, no client, no first upload)
```
Hello {{1}}, this is the FynHelp team. You started setting up {{2}}. {{3}} If you would like a hand, tap a button below and a person will help.
```
`{{3}}` example: `The next step is to add your first client, which takes about 2 minutes.`

### 2. `fh_trial_update`  (trial quiet, ending, or ended)
```
Hello {{1}}, a note from FynHelp about the trial for {{2}}: it {{3}}. Nothing you have done is lost. Would you like help choosing a plan or finishing a client?
```
`{{3}}` example: `ends in 2 days`

### 3. `fh_plan_help`  (plan chosen but not paid, payment failing)
```
Hello {{1}}, this is FynHelp about the plan for {{2}}. The payment {{3}}. Nothing is lost, and we can help you finish. Tap a button below.
```
`{{3}}` example: `was not completed`

### Buttons (the same four on all three, in this order or the other, both work)
1. **Visit website → Static**, text `Open FynHelp`, URL `https://fynhelp.com/app` (no variable in this one)
2. **Quick reply** `Call me`
3. **Quick reply** `Not now`
4. **Quick reply** `Stop messages`

Keep the wording plain: no emojis, offers, discounts or urgency. If Meta classes one as Marketing, reword it and resubmit; FynHelp will not use it until it is Utility.

## Switch it on
1. Make sure these are set in Vercel (they are the same ones the Chaser uses): `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_DEFAULT_PHONE_NUMBER_ID`, **`WHATSAPP_WABA_ID`** (needed so FynHelp can check each template is approved and Utility).
2. Optional, only if you used other template names: `WHATSAPP_TOUCH_SETUP_TEMPLATE`, `WHATSAPP_TOUCH_TRIAL_TEMPLATE`, `WHATSAPP_TOUCH_PLAN_TEMPLATE`.
3. Apply `supabase/migrations/20261031090000_touch_whatsapp.sql`.
4. Open **Admin → Follow-ups**. The **WhatsApp follow-ups** panel shows each template as Ready or Not ready, with the reason.

## What happens when a person taps
| Button | What FynHelp does |
|---|---|
| **Call me** | The follow-up turns hot and due now, with "Asked for a call" on Admin → Follow-ups, and the person is told a person will call during 9:30 am to 6:30 pm, Monday to Saturday. |
| **Not now** | The follow-up is left alone for 3 days. |
| **Stop messages** | No more WhatsApp to this number, ever. Confirmed to the person. |
| A written reply | It is added to the follow-up (hot, due now). The person gets one thank-you. |

The reply to a tap goes inside the 24-hour window the tap opened, so it costs nothing. Any call or message after that is by a person.

## Test it (with a tester phone)
1. Set up a test sign-up on your own phone with the WhatsApp box ticked, and stop at the "Set up your firm" step. An hour or so later (daytime, once the templates are Ready) you get `fh_setup_help` after the email.
2. Tap **Call me**: Admin → Follow-ups shows it hot with "Asked for a call".
3. Tap **Stop messages**: no further WhatsApp arrives, and the follow-up shows "WhatsApp stopped".
