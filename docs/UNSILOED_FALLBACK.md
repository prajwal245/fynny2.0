# Unsiloed fallback reader (optional, off by default)

A second reader for bank and cash-credit statement PDFs that the primary reader gets visibly wrong. It never replaces a result that already ties, and any failure returns the primary result untouched.

## Switching it on
`UNSILOED_FALLBACK_ENABLED=true` and `UNSILOED_API_KEY` must both be set (the base URL has a default), or nothing runs and nothing is called:

| Variable | Purpose | Default |
| --- | --- | --- |
| `UNSILOED_FALLBACK_ENABLED` | must be exactly `true` | `false` |
| `UNSILOED_API_KEY` | vendor key (set in Vercel) | none |
| `UNSILOED_BASE_URL` | https base URL of the vendor API | `https://prod.visionapi.unsiloed.ai` |
| `UNSILOED_AUTH_HEADER` | header that carries the key | `api-key` |
| `UNSILOED_CREDITS_FAST`, `UNSILOED_CREDITS_LITE` | credits per page assumed before a call (the real `credit_used` from each job replaces it) | `5`, `15` |
| `UNSILOED_PARSE_PATH` | path that accepts a PDF; jobs are read from `<path>/<job id>` | `/parse` |
| `UNSILOED_MODE_FAST`, `UNSILOED_MODE_LITE` | values sent in the `mode` field | `fast`, `agentic_lite` |
| `UNSILOED_MAX_TIER` | `fast` stops after Fast; `lite` allows one escalation to Agentic Lite. Agentic Pro and Extract are never called | `lite` |
| `UNSILOED_MAX_PAGES` | pages per document (hard maximum 15) | `15` |
| `UNSILOED_DAILY_CREDITS` / `UNSILOED_MONTHLY_CREDITS` | credit budget (monthly is capped at 1,900) | `250` / `1800` |
| `UNSILOED_CONCURRENCY` | jobs in flight (hard maximum 4) | `4` |
| `UNSILOED_TIMEOUT_MS`, `UNSILOED_POLL_MS`, `UNSILOED_MAX_POLL_MS` | per call, poll interval, longest wait | `20000`, `2000`, `40000` |
| `UNSILOED_WEBHOOK_SECRET`, `UNSILOED_SIGNATURE_HEADER`, `UNSILOED_WEBHOOK_URL` | webhook at `/api/webhooks/unsiloed` (HMAC-SHA256 of the raw body, hex) | none, `x-unsiloed-signature`, none |

**API used (from https://www.unsiloed.ai/docs):** `POST /parse` (multipart: `file`, `mode` = `fast` or `agentic_lite`, `merge_tables=true`) with the key in the `api-key` header; then `GET /parse/{job_id}` every 4 seconds with jitter until `status` is `Succeeded` (`Failed` and `Cancelled` end it); Markdown comes from `chunks[].embed`; `credit_used` and `page_count` come from the job. 429 and 503 are retried after `Retry-After`. Not exercised against the live service from the build environment (no key there). Their docs say webhooks are set up in their dashboard but do not document a signature scheme, so the webhook route stays off unless `UNSILOED_WEBHOOK_SECRET` is set and the signature check is confirmed; polling (in the request, and a sweep run by the cron tick) is the supported path.

## When it runs
Only after the primary reader, only for a bank or CC statement PDF, and only if one of these is true: no rows from a non-empty statement; a row missing its date, amount or direction; the running balance does not tie. It skips GST returns, ITC, 26AS, AIS, ITR, Form 3CD, loan statements, books and non-PDFs, and any document over the page cap.

## What it does
1. Fast (5 credits/page). The tables it returns go back through our own table reader and the running-balance check. Used only if the balance ties.
2. If not, one escalation to Agentic Lite (15 credits/page). Same check.
3. If not, the primary result stays.

Credits are checked against the daily and monthly budget before each call, read from what each document recorded. If the ledger cannot be read, nothing is spent. A job still running after the wait is left for the webhook, which stores the result and re-reads the document without a second call.

## Observability
`extracted.parser_fallback` on the document holds `parser_source` (`unsiloed_fast` or `unsiloed_lite`), `reason`, `credit_used`, `pages`, `tiers_tried`, `job_id`. Each recovered line's `raw_text` starts with `[parser:unsiloed_fast]` or `[parser:unsiloed_lite]`. Structured logs use `fn: "unsiloed_fallback"`.

---

# OCR fallback through OpenRouter (Mistral OCR, then Pixtral)

A second scan reader for scanned PDFs and photos. Off until `OPENROUTER_API_KEY` is set (in Vercel). Never used when `PRACTICE_DATA_RESIDENCY=india`, because it sends the file to OpenRouter.

| Variable | Purpose | Default |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | key | none (feature off) |
| `OPENROUTER_OCR_DISABLED` | `1` turns it off without removing the key | unset |
| `OPENROUTER_OCR_MODELS` | comma-separated, tried in order | `mistralai/pixtral-large-2502,mistralai/mistral-medium-3-5` |
| `OPENROUTER_OCR_TIMEOUT_MS`, `OPENROUTER_OCR_MAX_BYTES` | per call, largest file | `55000`, `12000000` |

Request ("mistral-ocr-latest" and "pixtral-large-2411" are not valid OpenRouter model ids; the chain uses models that exist, and Mistral OCR is the PDF parser engine): `temperature: 0`, `route: "fallback"` with the `models` list, the strict verbatim instruction as the system message, and for a PDF `plugins: [{ id: "file-parser", pdf: { engine: "mistral-ocr" } }]`.

When it is used: the primary reader (OCR.space, unchanged) fails, returns nothing, leaves `[ILLEGIBLE]`, or returns something that looks like a statement but has fewer than 3 dates or 3 amounts. With OCR.space not configured, it is the only scan reader. Its Markdown tables are turned into column-spaced text and then go through the same checks as every other read: amounts must appear in the text and statement rows must reconcile to the printed running balance. The AI-call log records provider `openrouter`, the model that answered and the cost OpenRouter reports.
