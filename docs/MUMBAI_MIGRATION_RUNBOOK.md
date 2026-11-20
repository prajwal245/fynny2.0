# Moving FynHelp's data to Mumbai (Supabase ap-south-1, Vercel bom1)

Date: 19 Nov 2026. Decision: migrate. Today the database and files are in **Sydney (ap-southeast-2)** and the app runs in Vercel `syd1`. A Supabase project cannot change region in place, so this is a move to a **new project**. It needs the Supabase dashboard, the database password and the Vercel project, which the coding sandbox does not have. Everything below is ordered so nothing is claimed before it is true.

**Rule until step 9 is done:** every public page says "hosted in Sydney, Indian region planned". `src/content/legal/company.ts` (`COMPANY.region`) is the single place that states the region; `tests/unit/trust-claims.test.ts` fails if a page says Mumbai while that line says Sydney.

## 0. Before you start (an hour)

1. Pick the **low-traffic window**: late night IST, not the 7th, 11th, 20th of a month (TDS, GSTR-1, 3B due days). Tell the pilot firms a day ahead: "read-only for about 1 hour".
2. Confirm the **Supabase plan** supports what you use (backups and, if wanted, point-in-time recovery are paid features; the free tier does not give daily backups you can rely on). Do not advertise backups until a restore has been tested (step 8).
3. Write down every secret you will have to carry across, because some **must be identical** or stored data becomes unreadable:
   - `GMAIL_ENCRYPTION_KEY` (the same key decrypts the stored Gmail tokens and the locked-file passwords in `ca_file_passwords`). Lose it and those become unrecoverable.
   - `EMAIL_LINK_SECRET`, `ADMIN_SESSION_SECRET`, `CRON_SECRET`, `CA_CRON_SECRET`, `LEAD_SHEET_SECRET`.
   - Provider keys: `GROQ_API_KEY`, `GEMINI_API_KEY`, `LOVABLE_API_KEY`, `OCR_SPACE_API_KEY`, `RESEND_API_KEY`, `RAZORPAY_*`, `GMAIL_CLIENT_*`, `UPSTASH_*`, `VIRUSTOTAL_API_KEY`.
4. Export a full backup of the **old** project first (step 1) and keep it until the new one has run a week.

## 1. Back up the old project

```bash
supabase link --project-ref qfowcjyueonpwmxzthmz
supabase db dump --linked -f old_schema.sql
supabase db dump --linked --data-only --use-copy -f old_data.sql
```

Store the dumps in the firm's private storage, not in the repository (they hold client data). Also list storage buckets and objects; the `ca-client-documents` bucket holds the uploaded statements.

## 2. Create the new project in Mumbai

1. Supabase dashboard, New project, **Region: South Asia (Mumbai), ap-south-1**. Same organisation, same plan or higher.
2. Note the new project ref, URL, anon (publishable) key and service-role key.
3. Apply the schema with the repo's migrations (they are safe on an empty project):
   ```bash
   supabase link --project-ref <NEW_REF>
   supabase db push
   ```
4. Enable the extensions the migrations expect (`pg_cron`, `pgcrypto`, and so on) if the push reports any are missing.

## 3. Copy the data (during the write-freeze window)

1. Put the app in **read-only/maintenance** for the window: set `PRACTICE_AI_DISABLED=true`, pause the Vercel crons, and ask firms not to upload.
2. Restore data into the new project (`psql "<NEW_DB_URL>" -f old_data.sql`), including the `auth` schema so users keep their accounts and password hashes. Check the row counts of the biggest tables before and after.
3. Copy **storage objects** bucket by bucket (Supabase CLI `supabase storage cp`, or a script using the storage API with both service-role keys), then compare object counts and total bytes per bucket. Private buckets stay private.
4. Re-create anything that is not in migrations: auth providers (Google), email templates, URL configuration (Site URL and the redirect URLs listed in `docs/DEPLOY.md`), and the Edge Function `practice-ai`:
   ```bash
   supabase functions deploy practice-ai
   supabase secrets set GROQ_API_KEY=... GEMINI_API_KEY=... LOVABLE_API_KEY=...
   ```
5. Re-create **pg_cron jobs** (Gmail polling every 15 minutes, publishing due blog posts) so they point at the new project and the new `CRON_SECRET`. List old ones with `select * from cron.job;`.

## 4. Point the code at the new project

Code changes (small, reviewed in a PR, deployed after the data is in place):

- `src/integrations/supabase/external.ts`: `EXTERNAL_SUPABASE_URL` (a hard-coded project URL).
- `src/routes/__root.tsx`: the `preconnect` link to the old project's URL.
- `vercel.json`: `"regions": ["bom1"]` (Mumbai), so the app sits next to the database.
- `docs/DEPLOY.md`: the project ref and the URL examples.

Vercel environment variables (production and preview): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, plus the unchanged secrets from step 0.

## 5. Move third parties that store the old URL

- **Gmail OAuth redirect** (`GMAIL_REDIRECT_URI`) and the Google console: unchanged if the app domain is unchanged; verify.
- **WhatsApp (Meta) webhook** and **Razorpay webhook**: re-verify the callback URL still reaches the app.
- **Resend**: sender domain unchanged.
- Any upload links already sent (`u/<token>`): tokens live in the database, so they keep working after the copy.

## 6. Cut over and smoke-test (use a test firm, not a client)

1. Deploy the PR. Re-enable crons and AI. Remove the read-only notice.
2. Check, in order: sign in; open a client; upload a bank statement; run a reconciliation; open an original document (signed link works); send a WhatsApp or email chase to a test number; connect Gmail on a test mailbox; GST Returns check on a test month; an admin sign-in.
3. Run the real-file gate against the new project's data: `REAL_STATEMENTS=<folder> npm run real:gate`. No count may drop.
4. Compare row counts (every table) and storage totals with the old project. Record the numbers in the migration ticket.

## 7. Keep the old project, then remove it

Keep the Sydney project **paused and read-only for 14 days** as a rollback. After that, take a final dump to private cold storage, then delete the project. Deleting it is what makes "no data left in Australia" true, so schedule it. Backups and provider logs elsewhere (for example Sentry, Resend, AI providers) still hold some data; the sub-processor table in the privacy policy tells the truth about those.

## 8. Test the backup you will advertise

Take the new project's backup, restore it into a throwaway project, and open one client end to end. Write the date and result in `docs/`. Only then may the site say anything about backups.

## 9. Only now change the words

1. `src/content/legal/company.ts`: set `region: "Mumbai, India (Supabase ap-south-1)"`. The security cards, trust block, badges and privacy policy read it.
2. `src/pages/SecurityPage.tsx` "Hosting" fact: replace the Sydney sentence with the Mumbai one and the date.
3. `src/components/home/FAQSection.tsx` and `src/components/solutions/BackendInfrastructure.tsx`: remove "Sydney today, India planned".
4. `tests/unit/trust-claims.test.ts` already allows Mumbai wording once step 1 above is done; add the date of the move to the page.
5. Tell customers: "Your data now lives in Mumbai". Update the DPA sub-processor table.

## Rollback

Until step 7, point the Vercel variables back at the old project and re-enable it; data written to the new project after cutover must be copied back first, so keep the freeze window short and the cutover reversible within the hour.

## What this does not do

Moving the database does not make FynHelp "never leaves India": the AI providers (Google Gemini, Groq, the Lovable gateway) and OCR.space process document text outside India, and Vercel, Sentry and Resend may too. Say exactly that. The privacy policy already lists them.
