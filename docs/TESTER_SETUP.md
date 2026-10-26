# Letting testers test FynHelp (setup guide for the founder)

Read this once, then use the checklist at the end each time you add a tester or release a change. The guide you give testers is `docs/TESTER_GUIDE.md`.

---

## 1. How testing works, in one page

A **tester account** is a normal sign-in whose firm is flagged `ca_firms.is_test = true`. That one flag does everything:

| Protection | How it is enforced |
|---|---|
| Sees only its own sandbox data | Existing firm row security: every table is scoped to the user's firm. |
| Cannot become part of a real firm (or a real user in a test firm) | Database triggers refuse it, even for the service role. |
| Cannot un-flag itself | Only the service role (you) can change `is_test`. |
| Never billed | Billing is simulated as Scale; Razorpay is never called for a test firm; plan and credit purchases are refused. |
| Not in your numbers | Admin totals, billing runs, lifecycle emails and referral rewards skip test firms; the admin list shows them only under "Test firms". |
| Emails stay inside the team | Only `@fynhelp.com` and addresses in `TEST_RECIPIENTS` receive real email; others are recorded as sent but not sent. |
| WhatsApp stays inside the team | Only Meta's free **test number**, only to phone numbers in `TEST_RECIPIENTS`; everything else is simulated. |
| Not in Google Analytics | QA mode is switched on automatically (also available to anyone with `?utm_source=qa` or `?debug_mode=true`). |
| Clearly labelled | A blue **Test account** banner on every page. |

What a test account **cannot** test: real payments and real credit purchases. Do those on a **preview deployment with Razorpay test keys** (section 5).

## 2. Create a tester

**New person** (needs the Supabase service-role key, never share it):

```bash
export SUPABASE_URL="https://<project>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service role key>"
node scripts/create-tester.mjs name@fynhelp.com "Test Firm (Name)"
```

It prints the sign-in link, email and a one-time password. Send the password privately. `--list` shows all testers; `--reset-password` issues a new password. Use a `@fynhelp.com` address so their test emails arrive.

**People who already signed up with Gmail** (the current testers, for example Dhanvi and Pallavi): their firms are real production firms until you flag them. In the Supabase SQL editor, after the migration `20261027090000_test_firms.sql` is applied:

```sql
update public.ca_firms
set is_test = true
where user_id in (
  select id from auth.users
  where lower(email) in ('marudhanvi8@gmail.com', 'pallavireddy7305@gmail.com')
);

select f.firm_name, u.email, f.is_test
from public.ca_firms f join auth.users u on u.id = f.user_id
where lower(u.email) in ('marudhanvi8@gmail.com', 'pallavireddy7305@gmail.com');
```

Their logins and data stay; they leave your production numbers and become sandboxed. Because their emails are not `@fynhelp.com`, **add them to `TEST_RECIPIENTS`** or they will never receive test emails.

## 3. Let them receive messages (Vercel → Settings → Environment Variables → Production)

| Variable | Value | Purpose |
|---|---|---|
| `TEST_RECIPIENTS` | `dhanvi@gmail.com, pallavi@gmail.com, 919XXXXXXXXX, 919YYYYYYYYY` | Emails and phone numbers a test firm may really reach. Phones match on the last 10 digits. |
| `WHATSAPP_TEST_PHONE_NUMBER_ID` | from Meta → WhatsApp → API Setup → **Test number** | Meta's free test number. Without it, test WhatsApp is simulated. |
| `WHATSAPP_TEST_ACCESS_TOKEN` | token for that test number | |
| `WHATSAPP_TEST_WABA_ID` | test business account id | optional |

Redeploy after changing variables.

**Meta test-number step (each tester's phone):** Meta lets a test number message only phones you have verified. In Meta → WhatsApp → API Setup → "To", click **Manage phone number list**, add the tester's number, and have them enter the code Meta sends. Then they must send any message to the test number once to open the 24-hour window.

The test number cannot carry buttons from your approved templates unless the template exists on the same business account. For button tests, put the test number on the same WhatsApp Business Account as the live templates, or use the free-text path (replies inside the 24-hour window show the same three buttons).

## 4. What each message test needs
| Test | You need |
|---|---|
| Email chase | tester email in `TEST_RECIPIENTS` (or `@fynhelp.com`) |
| WhatsApp chase | test number set, tester phone verified in Meta and in `TEST_RECIPIENTS` |
| Upload link | `PUBLIC_APP_URL` set (defaults to `https://fynhelp.com`) and the upload-links migration applied |
| Buttons on the template | `document_request_v2` (and the follow-up and final templates) approved; see `docs/WHATSAPP_TEMPLATES.md` |
| Day 3 / day 7 wording | wait, or change `next_follow_up_at` on the test chase in the database to now |

## 4b. Confirm these are live before testers start (5 minutes, you)
Do these on Production once the deploy is **Ready**. Testers will report anything here that is not ready as a failure.

| # | Check | How | Expect |
|---|---|---|---|
| 1 | Upload page is deployed | Open `https://fynhelp.com/u/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` | The page loads and says "This link is not valid". (Not a 404 or a blank page.) |
| 2 | Upload API is deployed | Open `https://fynhelp.com/api/public/upload-link?token=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` | `{"ok":false,"reason":"invalid"}` |
| 3 | Upload links table exists | Send one WhatsApp chase from a test firm to your own number | The message arrives with an **Upload documents** button. "Could not create the client's upload link" means `20261029090000_upload_links.sql` is not applied. |
| 4 | File limits | On that page upload a CSV, then a file over 15 MB, then a `.exe` renamed `.pdf` | CSV accepted; the large file says it is larger than 15 MB; the renamed file says we can read PDF, photos, Excel and CSV. A link takes up to 25 files and works 14 days. |
| 5 | Templates approved with buttons | Settings → WhatsApp → Your reminder messages | Each stage says **Ready**, with buttons. "In review" means the older template is still being used and the buttons will not show yet. |
| 6 | Button taps work | Tap **Sending today**, **Need more time** (then pick a date) and **Stop reminders** on your phone | A reply arrives each time and the chase Activity shows it. This needs the WhatsApp webhook live and `WHATSAPP_APP_SECRET` set. |
| 7 | Reading is what the guide says | Upload a CSV bank statement, then a PDF | CSV shows fields. PDF is saved but shows no fields until reading is switched on (see below). |

**Switching on PDF and photo reading** (optional, then update the tester guide): set `OCR_SPACE_API_KEY` for photos and scanned PDFs, and one of `GROQ_API_KEY`, `GEMINI_API_KEY` or `LOVABLE_API_KEY` for AI reading (do not set `PRACTICE_AI_DISABLED`). Settings → Integrations shows which of these the server sees. Redeploy after setting them, then change the tester guide's quick-test step back to "PDF or photo".

## 5. Payment and credit tests (separate from tester accounts)
1. In Vercel, on the **Preview** environment only, set `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` to your `rzp_test_…` keys and a different `RAZORPAY_WEBHOOK_SECRET`.
2. In Razorpay **Test mode**, add a webhook pointing at the preview URL (`/api/public/razorpay-webhook`) with the subscription events plus `invoice.paid` and `order.paid`.
3. Testers sign up on the preview with a throw-away `@fynhelp.com` address and pay with the test card `4111 1111 1111 1111`, any future date, any CVV, OTP `1234`.
4. Never put test keys on Production or live keys on Preview. If a preview shows `rzp_live_`, stop.
5. The cleanest long-term setup is a separate **staging Supabase project** for previews, so test sign-ups never touch the production database.

## 6. Prove the isolation holds (any time)
In the Supabase SQL editor or with `psql`:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/test_firm_isolation.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/test_credits.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/test_upload_links.sql
```

Each prints only `ok - …` lines and rolls back; nothing is kept. Run them on staging before a release.

Also check by hand once: sign in as a tester, open the admin dashboard as a founder, and confirm the totals did not change.

## 7. Checklist for each release
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build` are green.
- [ ] New migrations applied to staging; the three SQL checks print only `ok`.
- [ ] A tester ran the Quick test and the sections that match the change (`TESTER_GUIDE.md` sections 3 to 5) and replied **Passed**.
- [ ] New environment variables are set in Production **before** merging.
- [ ] You approved the merge. Merging to `main` deploys to Production.
- [ ] After deploy: open the changed screen once as a founder and watch Vercel logs for five minutes.

## 8. When a tester reports a problem
BLOCKER (real data visible, anything charged, a real person messaged): stop testing, tell me, and check Vercel logs and the Razorpay dashboard first. MAJOR and MINOR can wait for the next fix.

## 9. Switching a tester off
`update public.ca_firms set is_test = true` keeps them sandboxed. To remove access entirely: Supabase → Authentication → Users → delete or ban the user. Their test firm and data can then be deleted; it never affected production data.
