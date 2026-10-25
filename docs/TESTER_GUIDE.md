# FynHelp tester guide

For the person who tests a change **before** it is pushed to production. Follow it top to bottom. It takes about 45 minutes for a full pass, 10 minutes for a small change.

> **Rule of the house:** nothing goes to `main` until every box in section 6 is ticked and the tester has written "Passed" (or the list of failures) on the pull request.

---

## 1. What a tester account is

A tester account is a normal sign-in attached to a **test firm** (`ca_firms.is_test = true`). It is a sandbox:

| Question | Answer |
|---|---|
| Can it see real firms' data? | **No.** Row security only shows a firm's own rows, and a tester belongs only to the test firm. |
| Can it change real firms' data? | **No.** The same rules block every write. |
| Can a real user become a tester, or the other way round? | **No.** The database refuses to put one person in both a test and a real firm. |
| Can a tester turn the test flag off? | **No.** Only the platform (service role) can set or clear it. |
| Is it billed? | **No.** It has every feature on (Scale), is never charged, and Razorpay is never called for it. |
| Does it appear in reports, revenue, billing runs, lifecycle or referral rewards? | **No.** Those read `production_firms` / skip `is_test`. |
| Does email reach real people? | **No.** Only `@fynhelp.com` addresses and anything in `TEST_RECIPIENTS`. Everything else is recorded as sent, but nothing leaves the server. |
| Does WhatsApp reach real people? | **No.** A test firm sends only through Meta's free test number, and only to numbers in `TEST_RECIPIENTS`. Otherwise it is simulated. |
| Are credits charged? | **No.** Test firms are not metered. |
| Does it feed Google Analytics? | **No.** QA mode is switched on automatically for a tester. |

You can always tell you are on a tester account: a blue **Test account** banner is shown at the top of every page.

---

## 2. Getting access

### 2.1 Who creates the account
A founder/admin with the Supabase service-role key creates it (the app itself cannot — that is the point).

```bash
export SUPABASE_URL="https://<project>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service role key>"      # never commit it, never paste it in chat
node scripts/create-tester.mjs tester1@fynhelp.com "Test Firm (Asha)"
```

It prints the sign-in link, email and a **one-time password**. Send the password over a private channel (not the shared WhatsApp group). To list testers: `node scripts/create-tester.mjs --list`. To issue a new password: add `--reset-password`.

Use a `@fynhelp.com` address, so test emails can actually reach the tester.

### 2.2 What the tester receives

| Item | Where it comes from |
|---|---|
| App address | `https://fynhelp.com/login` (or the preview URL of the pull request) |
| Email + password | printed by the script above |
| Test WhatsApp number to message | the founder adds it to `TEST_RECIPIENTS` (below) |
| Razorpay **test** card/UPI | Razorpay's public test details (section 4.4) |

### 2.3 One-time server settings (founder, Vercel → Settings → Environment Variables)

| Variable | Value | Why |
|---|---|---|
| `TEST_RECIPIENTS` | `asha@fynhelp.com, 919XXXXXXXXX` | The extra emails and phone numbers a test firm may really reach. Phones match on the last 10 digits. |
| `WHATSAPP_TEST_PHONE_NUMBER_ID` | from Meta → WhatsApp → API setup → **Test number** | The free Meta test number. Without it, test WhatsApp is simulated (still fine for most tests). |
| `WHATSAPP_TEST_ACCESS_TOKEN` | the token for that test number | |
| `WHATSAPP_TEST_WABA_ID` | the test WhatsApp Business Account id | Optional. |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | **Test-mode** keys (`rzp_test_…`) on **preview** deployments only | So testing credit purchases never moves real money. Live keys stay on Production only. |

Preview deployments must use test keys. If a preview shows `rzp_live_`, **stop** and tell a founder.

---

## 3. The two switches that keep testing out of production

1. **Tester account** — everything above happens by itself.
2. **QA mode for any browser** — add `?utm_source=qa` or `?debug_mode=true` to any FynHelp address (works on the website too, before sign-in). Analytics events are then printed in the browser console instead of being sent. Turn it off with `?debug_mode=false`. A tester account turns it on automatically.

Check it: open DevTools → Console. You should see the events logged and **no** requests to `google-analytics.com` or `posthog` in the Network tab.

---

## 4. Test plan

Mark each line **Pass / Fail / N/A** and write what you saw if it failed. Always say which browser and which build (commit id from the pull request).

### 4.1 Smoke test (every change, 10 minutes)
- [ ] Sign in with the tester account. The blue **Test account** banner is visible.
- [ ] Dashboard, Clients, Documents, Reports, Chaser, Settings all open without an error.
- [ ] Add a client. It appears in the list. Refresh the page; it is still there.
- [ ] Upload a small PDF or image in Documents. It is read and shows extracted fields.
- [ ] Sign out and in again; data is still there.

### 4.2 Isolation (any change that touches data, billing, messaging or reports)
- [ ] The tester sees **only** the test firm: no client or firm name you recognise from production.
- [ ] Open an address with a real firm's id (ask a founder for one, or copy a client link from production): you get "not found" or an empty page, never data.
- [ ] Settings → Billing: you cannot start a plan (the account says it is a test account).
- [ ] Founder, signed in as an admin: the admin dashboard totals, revenue and firm counts **did not change** after your testing; the tester firm only shows when "Test firms" is selected.
- [ ] Database check (founder, SQL editor): run `supabase/tests/test_firm_isolation.sql`. All lines print `ok - …`. It rolls back, so nothing is kept.

### 4.3 Chaser (email and WhatsApp)
- [ ] Create a chase with **Email**. Email goes only to the tester's own `@fynhelp.com` address. The activity shows the follow-up.
- [ ] Create a chase with **WhatsApp** and your own number (listed in `TEST_RECIPIENTS`). You receive the message on your phone; the activity shows "sent". Reply with a document: it arrives under Documents.
- [ ] Create a chase with **Email + WhatsApp**: both arrive.
- [ ] Create a chase with a number that is **not** in `TEST_RECIPIENTS`: the activity says "Test account: … recorded, nothing was sent". Nothing arrives anywhere.
- [ ] A WhatsApp or Both chase without a phone number is refused with a clear message.
- [ ] Mark a chase resolved: no further follow-ups are sent.
- [ ] Documents → WhatsApp tab: with FynHelp's number it shows the number, a message to share and the JOIN code (no form); with your own number it shows the setup form.

### 4.4 Credits and top-ups (run on a **preview with Razorpay test keys**)
A tester account is not metered, so use a **real trial firm on the preview** (sign up with a throw-away `@fynhelp.com+alias` address) for the paid-path tests below, with test keys. Never do this on Production.
- [ ] Settings → Billing shows **WhatsApp credits**: a new trial firm has **25** credits.
- [ ] Send one WhatsApp reminder from FynHelp's number (Test number configured): the balance drops by exactly **1**.
- [ ] Make the send fail (use an invalid number): the balance goes back up by 1 (refunded).
- [ ] A firm on its **own** WhatsApp number: the balance does not change.
- [ ] Chaser page: the chip says "~N reminders left". When 10 or fewer are left it turns amber and a warning bar appears; at 0 it turns red and says WhatsApp is paused (email still works).
- [ ] **Add credits** → pick 500 → Razorpay opens → pay with the test card `4111 1111 1111 1111`, any future expiry, any CVV, OTP `1234` (UPI test id `success@razorpay`). The balance rises by 500 straight away.
- [ ] Close the browser tab right after paying: after a minute the credits are there anyway (webhook). *(Needs the `order.paid` event enabled on the Razorpay webhook.)*
- [ ] Pay twice with the same payment (refresh the confirmation): credits are added only once.
- [ ] Automatic top-up (monthly plan only): switch it on, drain the balance to 0 with sends; one pack is added by itself, a charge appears as an add-on on the subscription, and it stops at your monthly limit.
- [ ] Yearly plan: automatic top-up is greyed out with the reason.
- [ ] Pricing page lists the credits for each plan and the three packs.

### 4.5 Billing and plans (any billing change)
- [ ] Trial banner text matches the pricing page (14 days, 25 WhatsApp credits).
- [ ] Choose a plan with the Razorpay test card; the plan shows Active; cancel; the refund note appears.
- [ ] Essential, Firm and Scale each show the right monthly credits (100 / 500 / 2,000).

### 4.6 Website and tracking (marketing changes)
- [ ] Open `/?utm_source=qa`: console logs events, no Google Analytics requests.
- [ ] Open `/?utm_source=linkedin&utm_medium=social&utm_campaign=test&utm_content=tester` **without** QA mode on a throw-away browser profile only if a founder asks: a GA4 DebugView/Realtime entry should appear. This is the one test that touches production analytics.
- [ ] Sign-up form still works end to end.

---

## 5. When you find a problem
1. Take a screenshot and copy the exact words on screen.
2. Note the steps, the time (with timezone) and the account email.
3. Post it on the pull request as a comment, starting with **BLOCKER**, **MAJOR** or **MINOR**:
   - BLOCKER: data leak, money wrong, messages to real people, cannot sign in.
   - MAJOR: a feature does not work.
   - MINOR: wording, layout.
4. Do not retry a payment or message more than twice. If something looks like it reached a real person or took real money, **stop and tell a founder immediately**.

---

## 6. Release checklist (the developer, before asking for the push)

Run from the repository root:

```bash
npm run lint
npx tsc --noEmit
npm test                       # all unit and render tests must pass
npm run build
```

Database changes (founder): apply new migrations to a **staging** project first, then run:

```bash
psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/test_firm_isolation.sql
psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/test_credits.sql
```

Both must print only `ok - …` lines. Then:

- [ ] Lint, types, tests and build are green.
- [ ] New migration files are applied to staging, and the two SQL checks print only `ok`.
- [ ] A tester ran sections 4.1 and 4.2 on the preview and wrote **Passed** on the pull request. Sections 4.3 to 4.6 for the areas the change touches.
- [ ] No new environment variable is needed in Production, or it has been added **before** merging.
- [ ] The pull request says what changed in plain words and what the tester should look at.
- [ ] A founder approved the merge. Merging to `main` deploys to Production.

After the deploy: sign in as a founder, open the changed screen on Production once, and watch Vercel logs for five minutes.

---

## 7. Quick reference

| I want to… | Do this |
|---|---|
| Keep my browser out of analytics | add `?utm_source=qa` to the address |
| Turn that off | `?debug_mode=false` |
| Add a number/email testers can message | add it to `TEST_RECIPIENTS` in Vercel and redeploy |
| Create another tester | `node scripts/create-tester.mjs name@fynhelp.com` |
| New password for a tester | `node scripts/create-tester.mjs name@fynhelp.com --reset-password` |
| See all testers | `node scripts/create-tester.mjs --list` |
| Prove isolation holds | run `supabase/tests/test_firm_isolation.sql` |
| Razorpay test card | `4111 1111 1111 1111`, any future date, any CVV, OTP `1234` |
