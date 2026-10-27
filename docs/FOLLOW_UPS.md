# Mobile number at sign-up, and follow-ups for people who stall

## What changed
- **Mobile number is collected at sign-up** (email sign-up form) and again in **Set up your firm** (so Google sign-ups give it too). It is checked on the server (`src/lib/practice/mobile.ts`: a 10-digit Indian mobile, or `+country code`), stored as digits with country code (`ca_firms.phone`, and in the sign-up's metadata), and editable in Settings → Firm. Firms that signed up before show a one-line "Add your mobile number" card, once per session, with "Not now".
- An optional, **unticked** tick-box asks for WhatsApp help and trial updates. It is recorded (`notification_prefs.touch_whatsapp_ok`) and shown to the person following up. The number itself is only ever used to help, never shared.

## Follow-ups ("abandoned cart" recovery)
Migration `20261030090000_touchpoints.sql`; code in `src/lib/practice/touchpoints/`; admin page **Admin → Follow-ups**.

The cron tick (hourly, 9 am to 8 pm IST) finds people who stalled, opens one follow-up for each, sends the one automatic email that fits, and closes the follow-up by itself when the person moves on.

| Stall | When it opens | Automatic email | Hot |
|---|---|---|---|
| Sign-up not finished (account, no firm) | 30 min after sign-up (up to 7 days) | after 1 hour: "Your FynHelp account is two minutes from ready" | |
| No client added | 1 day after the firm was created | (the existing lifecycle emails cover this) | |
| No first upload (client added) | 2 days | (existing lifecycle emails) | |
| Trial gone quiet | no activity for 4 days in a running trial | | |
| Plan chosen, not paid (checkout abandoned) | 45 min after choosing a plan at Razorpay | after 1 hour: "Your {plan} plan is one step away" | yes |
| Trial ending, no plan | 3 days or fewer left | (existing trial emails) | yes |
| Trial ended, no plan | within 7 days of the end | (existing win-back emails) | yes |
| Payment failing | plan past due or halted | (existing billing emails) | yes |
| Paying but quiet | no activity for 10 days | (existing "inactive" email) | |

- **One email per person per 20 hours**, counting the existing lifecycle emails, and none to a firm that switched lifecycle emails off. Each email is claimed in the database before it is sent, so it can never go twice.
- Test and demo firms and `@fynhelp.com` addresses never get follow-ups.
- Each follow-up is **once per stall**: closing it does not open it again.

### What the person following up sees (Admin → Follow-ups)
- The last 30 days as steps: signed up, firm created, first client, first upload, first reconciliation, paying, each with its share of sign-ups.
- How many are waiting, how many **came back after we reached out**, how many moved on alone, and how many emails went.
- For each person: one sentence on what happened, their phone and email, whether they agreed to WhatsApp, and a ready, warm opener written for that stall (no pitch, one offer of help).
- Buttons: **WhatsApp** (opens WhatsApp with the message ready), **Call**, **Copy message**, **Mark done** (with how it went and a note), **Snooze 2 days**, **Not needed**. Closed follow-ups can be reopened.
- Permission: `support.manage` (support agents, ops admins and above). Every action is written to the audit log.

### WhatsApp (automatic, with consent)
Follow-ups about a person's own set-up, trial or plan are also sent on WhatsApp from FynHelp's number, to people who ticked the WhatsApp box, with **Call me / Not now / Stop messages** buttons. A tap or a reply lands on the follow-up (hot, due now); STOP is honoured for good. Templates, rules and set-up are in `docs/WHATSAPP_FOLLOWUP_TEMPLATES.md`. Migration `20261031090000_touch_whatsapp.sql`.

### Why the admin page's WhatsApp button is still a link
A person's own WhatsApp message is warmer than any template and needs no consent record, so the **WhatsApp** button on each card remains for personal follow-up.

### (Earlier note) Why WhatsApp from the admin page is a link, not an automatic send
A message to a sign-up is not a reply to anything, so on WhatsApp it needs an approved template and the person's consent. Until you have a template for it, a person sends it from their own WhatsApp: warmer, and nothing goes out without a person choosing it.

## Setup
1. Apply `20261030090000_touchpoints.sql`.
2. Nothing else: the cron tick runs it. `RESEND_API_KEY` must be set for the emails.
3. Give your support team the `support_agent` role so they see Admin → Follow-ups.

## Checks
```bash
npm test -- tests/unit/practice/touchpoints-rules.test.ts tests/unit/practice/touchpoints-run.test.ts tests/unit/practice/mobile.test.ts
```
