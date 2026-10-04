# Deploying FynHelp (Supabase + Vercel)

The app is one TanStack Start project. On Vercel, Nitro detects the platform and
emits `.vercel/output` (static assets plus one Node 22 `__server` function that
serves pages, server functions and `/api/public/*`). The database, auth, storage
and the `practice-ai` edge function live in Supabase project
`qfowcjyueonpwmxzthmz`.

## 1. Supabase (once)

Needs the Supabase CLI, the project's database password, and a personal access
token (`supabase login`).

```bash
supabase link --project-ref qfowcjyueonpwmxzthmz
supabase db push                       # applies every migration in supabase/migrations
supabase functions deploy practice-ai  # AI proxy used by the agents (verify_jwt = false)
supabase secrets set GROQ_API_KEY=...  # or GEMINI_API_KEY / LOVABLE_API_KEY, for practice-ai
```

The migrations are safe on an empty project: they create the storage buckets
(`ca-client-documents` is private), skip the old pilot seeds, and guard the
cron job edits.

In the dashboard, under **Authentication → URL Configuration**:

- **Site URL**: your production URL, for example `https://fynhelp.vercel.app`.
- **Redirect URLs**: add `https://*.vercel.app/**` and your custom domain.
- To let partners in without an email round-trip while testing, turn off
  **Confirm email** under Providers → Email.

## 2. Vercel

Import `prajwal245/fynny2.0` in Vercel. `vercel.json` already sets:

- the install command (`npm install`), because `bun.lock` points at a private
  registry that Vercel cannot reach;
- the build command (`npm run build`);
- daily crons for the practice tick, Gmail polling and legacy follow-ups.

Leave **Framework Preset** as *Other*, with the output directory empty.

### Environment variables

Required:

| Name | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://qfowcjyueonpwmxzthmz.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | the project's anon key (JWT) |
| `SUPABASE_URL` | same as `VITE_SUPABASE_URL` |
| `SUPABASE_PUBLISHABLE_KEY` | same anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API → `service_role` (server only, never `VITE_`) |
| `CRON_SECRET` | any long random string; Vercel Cron sends it as a Bearer token |
| `PUBLIC_APP_URL` | the production URL; used in invite links and Gmail OAuth |

Optional (each feature degrades gracefully and says so in the UI when unset):

| Feature | Variables |
| --- | --- |
| Scanned PDFs and photos | `OCR_SPACE_API_KEY` (free key at ocr.space; 1 MB and 3 pages per file on the free tier). OCR text goes through the same checks as a text PDF. Without it, scans need `GEMINI_API_KEY` |
| AI refinement of low-confidence rows | `GROQ_API_KEY` (+ `GROQ_MODEL`), or `GEMINI_API_KEY` (+ `GEMINI_MODEL`, default `gemini-flash-latest`); `PRACTICE_AI_DISABLED=1` turns it off |
| Chaser and invite emails | `RESEND_API_KEY`, `PRACTICE_FROM_EMAIL` (a verified Resend sender) |
| Gmail intake | `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_ENCRYPTION_KEY` (any long random string), optionally `GMAIL_REDIRECT_URI` |
| WhatsApp intake | `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN` |

`.env` in the repo carries the public values (URL and anon key) for the new
project, so a build works without them. Values set in Vercel always win.

### Gmail OAuth

In Google Cloud Console → Credentials, add these as authorised redirect URIs:

```
https://<your-domain>/ca/integrations/gmail/callback
https://<project>.vercel.app/ca/integrations/gmail/callback
```

The server accepts `PUBLIC_APP_URL` and the Vercel deployment URLs
(`VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_BRANCH_URL`, `VERCEL_URL`) as OAuth
return origins.

### WhatsApp webhook

In Meta → WhatsApp → Configuration, set the callback URL to
`https://<your-domain>/api/public/whatsapp-webhook`, with the same verify token
as `WHATSAPP_VERIFY_TOKEN`.

## 3. Background work

Vercel Hobby runs crons at most once a day. The schedule in `vercel.json` is
daily so it deploys on any plan. For near-real-time processing (queued
documents, follow-ups due, Gmail polling), call the tick more often from an
external scheduler, such as cron-job.org or Supabase `pg_cron` + `pg_net`:

```
GET https://<your-domain>/api/public/practice-tick
Authorization: Bearer <CRON_SECRET>
```

Every 5 minutes is plenty. Uploads made in the app are processed immediately
either way; the tick checks Gmail inboxes, drains Gmail and WhatsApp intake and
sends due follow-ups. Without it, Gmail is only checked once a day or when
someone clicks **Check now** in Settings.

## 4. Smoke test after deploy

1. Open `/v2`. It redirects to onboarding. Create an account, a firm and a client.
2. Upload a bank statement CSV. The Extract agent reports the transactions it read.
3. Upload the Tally day book, run recon, resolve an exception, then generate and
   sign off the MIS.
4. `curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/public/practice-tick`
   returns `200` with a JSON summary.
