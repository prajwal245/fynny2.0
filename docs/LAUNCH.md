# Launch checklist

What was tested before launch, and the settings that must be in place on the
hosted services. Environment variables are listed in `docs/DEPLOY.md`.

## Tested end to end

Two browser suites ran against a full local Supabase stack (auth, database,
storage) with email confirmation on, as on hosted Supabase. Real confirmation
and password-reset emails were delivered to a local mail catcher and followed.

**Product flow (32 steps):**

- Sign-up through onboarding.
- Documents: CSV and Tally upload, Review Queue, recon (chained automatically),
  exceptions and manual match.
- "Ready for MIS", MIS with click-through to source transactions, and sign-off.
- Chaser: create, follow-up, and auto-close on arrival.
- Unassigned WhatsApp document, assigned to a client.
- Agent memory across two months.
- Retry with backoff.
- Settings, including automation.
- Portfolio.

**Use cases (28 steps, three users):**

| Area | Checked |
| --- | --- |
| Sign-up | Asks to confirm the email; resend is rate-limited; the emailed link lands on firm setup; onboarding completes; reload keeps the session |
| Sign-in | `/ca/login` leads to the new sign-in; a wrong password is explained; sign-in lands on the portfolio |
| Password reset | Email, new password; the old password is refused and the new one works; an expired link is explained; other devices are signed out and offered Sign in |
| Team | The partner invites a junior. The junior signs up and joins the firm as Junior: no Partner switch, automation read-only, can run the close and generate an MIS, cannot sign off. The partner signs it off |
| Isolation | A second firm reads none of the first firm's transactions, documents, clients, reports or files, and cannot open its documents |
| Awkward files | Word document, empty statement and duplicate upload each get a clear outcome (stored once) |
| Periods and clients | A second client updates the portfolio; a period with nothing matched says so and cannot generate an MIS |
| Export | MIS Excel download |
| Phone | All 8 screens fit a 390 px phone with no sideways scroll |

A third check covers the launch pieces: the Terms and Privacy pages, the
"Start free" button opening sign-up with the consent line, and an expired
session landing on sign-in with "Your session ended".

The codebase also has 150 unit tests, a clean typecheck and a Vercel
production build.

## Supabase (Authentication settings)

1. **URL Configuration.**
   - Site URL: your production domain.
   - Redirect URLs: add all of these:
     - `https://<domain>/v2`
     - `https://<domain>/v2/reset-password`
     - `https://*.vercel.app/**`
2. **SMTP Settings: set up custom SMTP before launch.** Supabase's built-in
   sender allows only a few auth emails per hour, so sign-up confirmations and
   password resets would stop arriving. With Resend:
   - host `smtp.resend.com`, port `465`
   - user `resend`, password your `RESEND_API_KEY`
   - sender: an address on your verified domain.
3. **Email templates (optional).** Put the firm-facing wording on "Confirm
   signup" and "Reset password". The app handles the links as they are.
4. **Providers → Email.** Keep "Confirm email" on. The app waits for
   confirmation and offers a resend.

## Resend

Verify the sending domain (for example `fynhelp.com`). Chaser and invite emails
go out from `PRACTICE_FROM_EMAIL`, which defaults to `noreply@fynhelp.com`.

## Google (Gmail intake)

- **Redirect URI:** add `https://<domain>/ca/integrations/gmail/callback` to
  the OAuth client.
- **Testing mode:** while the app is in Testing, add each Gmail account that
  will connect as a test user. Google expires those connections after 7 days.
  Publish the app, which needs Google's verification for the `gmail.readonly`
  scope, before inviting clients widely. The consent screen needs the privacy
  policy (`https://<domain>/privacy`, which includes Google's Limited Use
  statement) and terms (`https://<domain>/terms`).

## Entry points

- The marketing site's "CA login" and "CA sign in" links lead to the practice
  app's sign-in page (`/ca/login` → `/v2/onboarding?mode=signin`).
- `/ca/register` and `/ca/onboarding` lead to sign-up.
- Sign-up is open: the navbar's "Start free", the pricing "Get started" and
  the Starter plan button open `/v2/onboarding?mode=signup`. "Book a demo" and
  the larger plans still go to `/waitlist`.
- Sign-up shows "By creating an account you agree to the Terms and Privacy
  policy", linking to `/terms` and `/privacy`. **Have counsel review both
  pages** before launch: they describe what the product does today (data
  read, providers, deletion on request within 30 days), but they are not
  legal advice.

## Limits and safeguards

- Uploads: 25 MB per file, checked in the browser, by the storage bucket
  (migration `20261001090000_document_upload_limits.sql`) and by the server.
  A file path outside the firm's folder is refused.
- Server functions run for up to 60 seconds on Vercel (`vite.config.ts`), so
  long OCR and AI reads are not cut off.
- Every server function requires a signed-in user, except the waitlist
  notifier. Scheduled endpoints require `CRON_SECRET` (Vercel sends it on its
  own crons; **set it in Vercel or the daily jobs are refused**). The WhatsApp
  and Razorpay webhooks check their signatures.
- When a session expires, the app signs out and shows sign-in with a notice
  instead of failing requests.

## After launch

- Watch the **Agent runs** tab on a client, and **Settings → Document
  reading / Chaser email**, for configuration gaps.
- Background work (Gmail polling, retries, follow-ups, automatic chases) runs
  on the practice tick. See "Background work" in `docs/DEPLOY.md` for running
  it more often than daily.
