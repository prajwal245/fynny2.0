# Unsiloed fallback reader (optional, off by default)

A second reader for bank and cash-credit statement PDFs that the primary reader gets visibly wrong. It never replaces a result that already ties, and any failure returns the primary result untouched.

## Switching it on
All of these must be set, or nothing runs and nothing is called:

| Variable | Purpose | Default |
| --- | --- | --- |
| `UNSILOED_FALLBACK_ENABLED` | must be exactly `true` | `false` |
| `UNSILOED_API_KEY` | vendor key (set in Vercel) | none |
| `UNSILOED_BASE_URL` | https base URL of the vendor API | none |
| `UNSILOED_PARSE_PATH` | path that accepts a PDF; jobs are read from `<path>/<job id>` | `/parse` |
| `UNSILOED_MODE_FAST`, `UNSILOED_MODE_LITE` | values sent in the `mode` field | `fast`, `agentic_lite` |
| `UNSILOED_MAX_TIER` | `fast` stops after Fast; `lite` allows one escalation to Agentic Lite. Agentic Pro and Extract are never called | `lite` |
| `UNSILOED_MAX_PAGES` | pages per document (hard maximum 15) | `15` |
| `UNSILOED_DAILY_CREDITS` / `UNSILOED_MONTHLY_CREDITS` | credit budget (monthly is capped at 1,900) | `250` / `1800` |
| `UNSILOED_CONCURRENCY` | jobs in flight (hard maximum 4) | `4` |
| `UNSILOED_TIMEOUT_MS`, `UNSILOED_POLL_MS`, `UNSILOED_MAX_POLL_MS` | per call, poll interval, longest wait | `20000`, `2000`, `40000` |
| `UNSILOED_WEBHOOK_SECRET`, `UNSILOED_SIGNATURE_HEADER`, `UNSILOED_WEBHOOK_URL` | webhook at `/api/webhooks/unsiloed` (HMAC-SHA256 of the raw body, hex) | none, `x-unsiloed-signature`, none |

**Before enabling:** the vendor's request and response field names used in `extract/fallback/client.ts` were not checked against their documentation (the site could not be reached from the build environment). Confirm the endpoint, the `mode` values, the response shape, the credit field and the webhook signature scheme, then adjust the variables above or `readResult`.

## When it runs
Only after the primary reader, only for a bank or CC statement PDF, and only if one of these is true: no rows from a non-empty statement; a row missing its date, amount or direction; the running balance does not tie. It skips GST returns, ITC, 26AS, AIS, ITR, Form 3CD, loan statements, books and non-PDFs, and any document over the page cap.

## What it does
1. Fast (5 credits/page). The tables it returns go back through our own table reader and the running-balance check. Used only if the balance ties.
2. If not, one escalation to Agentic Lite (15 credits/page). Same check.
3. If not, the primary result stays.

Credits are checked against the daily and monthly budget before each call, read from what each document recorded. If the ledger cannot be read, nothing is spent. A job still running after the wait is left for the webhook, which stores the result and re-reads the document without a second call.

## Observability
`extracted.parser_fallback` on the document holds `parser_source` (`unsiloed_fast` or `unsiloed_lite`), `reason`, `credit_used`, `pages`, `tiers_tried`, `job_id`. Each recovered line's `raw_text` starts with `[parser:unsiloed_fast]` or `[parser:unsiloed_lite]`. Structured logs use `fn: "unsiloed_fallback"`.
