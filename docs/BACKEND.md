# FynHelp practice backend

The v2 practice screens (`/v2`) run on a server-side backend built into this
Lovable project. The UI is unchanged; the four agents now run on the server
against Lovable Cloud (Supabase).

```
Upload / Gmail / WhatsApp ─► Extract ─► Review Queue ─► Recon ─► Exception Queue ─► Narrate (MIS) ─► Partner sign-off
                                   └──────────────── Chaser (follow-ups until the document arrives) ◄───┘
```

## What runs where

| Piece | Location |
|---|---|
| Server functions called by the v2 store | `src/lib/practice/practice.functions.ts` |
| Agent logic (pure, unit-tested) | `src/lib/practice/extract`, `recon`, `narrate`, `chaser` |
| Database access per agent | `src/lib/practice/*.server.ts` |
| Tables, columns, RLS | `supabase/migrations/20260927120000_practice_backend.sql` |
| WhatsApp Business webhook | `src/routes/api/public/whatsapp-webhook.ts` |
| Background tick (queue + chaser) | `src/routes/api/public/practice-tick.ts`, also run by the existing 15-minute Gmail cron |
| AI proxy (uses the Lovable Cloud AI key) | `supabase/functions/practice-ai` |
| v2 store (connects the screens) | `src/v2/store.tsx` |

Every server function checks the signed-in user, resolves their firm on the
server, and scopes every query to that firm. Browsers can read the new tables
through RLS but only the server writes to them.

## Connecting in Lovable

1. Sync this branch to the Lovable project (GitHub → Lovable). Lovable applies
   the migration and deploys the `practice-ai` edge function.
2. Lovable installs the new `unpdf` dependency from `package.json` (PDF text
   reading). If it is missing, PDFs fall back to the AI reader.
3. Add the secrets below that you want (Cloud → Secrets). Nothing else is
   required: without optional keys the product still works and says so
   plainly (for example "email recorded, not sent").

### Secrets

| Secret | Needed for | Required? |
|---|---|---|
| `LOVABLE_API_KEY` | AI for scanned PDFs/photos and MIS insights (already present in Lovable Cloud edge functions; the app server uses it through `practice-ai`) | Recommended |
| `GROQ_API_KEY` | Faster, free-tier AI for row classification and insights (text only) | Optional |
| `GEMINI_API_KEY` | Backup AI, including vision | Optional |
| `RESEND_API_KEY` | Chaser emails (already used by the app) | For real emails |
| `PRACTICE_FROM_EMAIL` | Sender address on a Resend-verified domain (default `noreply@fynhelp.com`) | Optional |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | WhatsApp Business Cloud API intake | For WhatsApp |
| `CA_CRON_SECRET` | Already set; also protects `/api/public/practice-tick` | Existing |

Without any AI key, CSV, Excel, Tally XML and text-layer PDF statements are
still read deterministically; only scanned files and AI insights need a key.

### WhatsApp Business setup

1. In Meta's WhatsApp Manager, set the webhook URL to
   `https://<your-app>/api/public/whatsapp-webhook` with your
   `WHATSAPP_VERIFY_TOKEN`, and subscribe to `messages`.
2. Link the number to the firm by calling the `connectPracticeWhatsapp` server
   function with the phone number ID (for example from a settings screen).
3. Documents and photos sent to the number are stored, matched to a client by
   phone number, and extracted on the next tick (within 15 minutes).

## The agents

**Extract** (`documents.server.ts`, `extract/*`)
- Reads CSV/TSV (including Excel files renamed to .csv), Excel, Tally XML and
  PDFs. It finds the header below any bank preamble, maps each bank's column
  names, joins multi-line narrations, skips totals, and handles DR/CR suffixes.
- Text-layer PDF statements are read deterministically and checked against
  the running balance. Scanned PDFs and photos go to a vision model, and any
  amount that is not printed in the document is rejected.
- Each row gets a confidence score. Rows at 0.75 or above become transactions
  (`ca_txns`); rows below go to the Review Queue (`ca_review_items`) with a
  reason.
- Idempotent: the same file arriving twice (upload, Gmail and WhatsApp alike)
  is one document, and transaction dedupe keys stop double entries.
- Review corrections are kept (raw text, AI proposal, human correction), ready
  to use later as fine-tuning data. Every AI call is logged in `ca_ai_calls`.

**Recon** (`recon.server.ts`, `recon/engine.ts`)
- Deterministic, no AI. It runs in three stages:
  1. Exact: same amount, date and reference.
  2. Fuzzy: a weighted score (amount 40%, date 25%, counterparty 25%,
     reference 10%) inside a ±₹1 / 0.1% tolerance and a ±3 day window.
  3. Rules: a counterparty alias table, plus narration rules such as bank
     charges, interest and tax payments.
- It refuses to auto-match when two candidates are equally good.
- Every unmatched line becomes an exception with one of these reason codes:
  `amount_mismatch`, `date_gap`, `missing_counterparty`, `duplicate_suspect`,
  `no_candidate`, `partial_payment_suspect` or `reference_mismatch`. Each
  exception also carries its top candidates.
- Re-runs are idempotent: a bank line has one live match, and each open
  exception is updated in place rather than duplicated.
- Exceptions can be matched manually (including partial payments), marked as
  reconciled externally, or ignored. Matches can be reversed.

**Narrate** (`narrate.server.ts`, `narrate/*`)
- Uses matched bank transactions only. Every figure (receipts, payments, net,
  opening and closing balance as printed, party and category totals,
  variances against the previous month) is computed in code and stores the
  transaction ids behind it.
- `getPracticeNumberSources` returns those transactions for the click-through.
- Insights come from rules, and optionally from AI. An AI insight is dropped
  if it cites a transaction id that is not in the input or quotes a figure
  that is not in the data.
- There are five templates: Monthly MIS, Bank Reconciliation Summary, Key
  Variances, Working Paper, and Exception and Review Summary.
- Partner sign-off and correction requests are recorded.

**Chaser** (`chaser.server.ts`, `chaser/rules.ts`)
- Follows up on day 0, day 3 and day 7. After two unanswered follow-ups it
  escalates: a notification goes to the firm and nothing more is sent to the
  client.
- It never sends twice on the same day and never sends after the item is
  resolved.
- It never sends to clients marked do-not-disturb.
- A document arriving from any channel closes the matching chase
  automatically.
- WhatsApp is a quick-send link that a person sends from their own WhatsApp.
- Every touch is logged in `ca_chaser_events`.
- The older rule-based follow-up cron skips chases owned by this chaser
  (`managed_by = 'practice'`), so nobody is emailed twice.

## Background work

The existing `ca-poll-gmail` cron (every 15 minutes) now also:
- extracts queued documents (Gmail and WhatsApp arrivals, and retries);
- sends follow-ups that have fallen due.

To trigger this by hand, POST to `/api/public/practice-tick` with the header
`x-cron-secret: <CA_CRON_SECRET>`.

## Tests

- `npx vitest run tests/unit/practice` runs the parsers, recon engine, MIS
  figures and insight guard, and the chaser rules.
- `tests/integration/practice.e2e.test.ts` runs the whole month-end flow
  against real Postgres with the migration applied, behind PostgREST:
  upload → review → recon (and a re-run) → exceptions → MIS → sign-off →
  chaser → auto-resolve. Setup steps are at the top of the file. The test is
  skipped unless `PRACTICE_E2E_REST` is set.
