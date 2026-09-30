# Launch checklist

What was tested before launch, and the settings that must be in place on the
hosted services. Environment variables are listed in `docs/DEPLOY.md`.

## Tested end to end

Two browser suites ran against a full local Supabase stack (auth, database,
storage) with email confirmation on, as on hosted Supabase. Real confirmation
and password-reset emails were delivered to a local mail catcher and followed.

**Product flow (30 steps):**

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
  scope, before inviting clients widely.

## Entry points

- The marketing site's "CA login" and "CA sign in" links lead to the practice
  app's sign-in page (`/ca/login` → `/v2/onboarding?mode=signin`).
- `/ca/register` and `/ca/onboarding` lead to sign-up.
- "Get started" and "Book a demo" still go to `/waitlist`. Change them to
  `/v2/onboarding` to open sign-up to everyone.

## After launch

- Watch the **Agent runs** tab on a client, and **Settings → Document
  reading / Chaser email**, for configuration gaps.
- Background work (Gmail polling, retries, follow-ups, automatic chases) runs
  on the practice tick. See "Background work" in `docs/DEPLOY.md` for running
  it more often than daily.
