# Finish the remaining gaps

Tests are already done (89 unit tests + RLS isolation suite). Five gaps remain. Build order below starts with mobile polish, then the rest.

## 1. Mobile polish (CA portal) — first

- Sidebar becomes a slide-over drawer below 1024px with a header hamburger; the fixed 236px left margin becomes responsive. Desktop unchanged.
- One shared responsive-table primitive: every wide CA list renders as label/value cards below 768px, so all list screens adapt from a single change.
- Touch targets, padding and font sizes pass at 375–468px on the portal shell, filters, drawers, forms.
- Client 360 tabs scroll horizontally instead of wrapping.

## 2. Client portal depth

`/dashboard/my-ca` already has compliance, documents and a live message thread. It gains:

- **Shared reports** — a "Share with client" control on the CA reports screen; client sees the list and downloads via signed URL.
- **Invoice payment** — client sees CA invoices with amount due. "Pay now" creates a Razorpay payment link; static UPI QR as fallback. Webhook marks paid, writes a settlement row, logs to the audit trail. Ships behind your live keys — until they exist the screen shows amounts and marks manual payment.

## 3. Time capture + practice intelligence

- Time entries per staff member against client/engagement/task: start-stop timer on any task, plus manual entry and edit.
- Weekly timesheet per member; firm-wide view for Partner/Manager.
- Cost rate per member in Users & Roles.
- Realisation (billed vs time value), profitability (fee minus time cost), capacity (booked vs available hours) switch from structural to real numbers. Metrics with no data say "not enough data yet" rather than zero.

## 4. Notification delivery (WhatsApp-ready)

- One outbound queue: channel, template, payload, status, retries, provider message id.
- Sender adapter with Meta Cloud API and BSP implementations behind one interface; with no provider configured messages queue as `pending_provider` instead of failing silently.
- Delivery worker on the existing cron route: picks due messages, sends, exponential backoff.
- Existing alert/chaser/compliance paths write to the queue and honour each firm's notification preferences.

## 5. Bank feed ingestion (account aggregator)

- Consent + fetch data model: consent handle, status, linked accounts, fetch sessions, raw payloads, derived transactions.
- Pluggable adapter with Setu and Finvu stubbed against their documented shapes, plus a mock adapter used until real keys exist.
- Flow: request consent → client approves at the AA → callback stores handle → scheduled and on-demand fetch → normalise into the same shape CSV import produces, with lineage back to the fetch session.
- Connect UI states plainly that live feeds activate once credentials are added.

## Technical notes

New tables, each with GRANTs, RLS and firm scoping via the existing `user_in_ca_firm` / `ca_firm_has_client_access` helpers: `ca_report_shares`, `ca_invoice_payments`, `ca_time_entries`, `ca_notification_outbox`, `ca_bank_consents`, `ca_bank_accounts_linked`, `ca_bank_fetch_sessions`. `ca_firm_members` gains a cost rate.

Client-portal reads stay scoped through the existing `ca_client_users` binding. Razorpay payment links are created server-side; the webhook lands on a `/api/public/*` route with signature verification and idempotency on the payment id. AA and WhatsApp adapters live as narrow-interface server modules in `src/lib/`, so switching providers is one file. Both new cron consumers reuse the existing secret-gated public route pattern. Portal screens keep `portalUi` tokens only.

## What still needs you

- AA credentials (Setu or Finvu) — pipeline ships working against the mock adapter.
- WhatsApp provider + approved templates — queue and worker ship regardless.
- Razorpay live account + UPI VPA for client invoice payment.
- GSP license for real GST filing (out of scope here, no legal path without it).
