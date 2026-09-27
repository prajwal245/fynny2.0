# Closing the six remaining gaps

Six workstreams, built in the order below. Everything follows the existing CA patterns: firm-scoped tables with grants + RLS, `portalUi` tokens for CA screens, TanStack routes, no fake data.

## 1. Client portal depth

Today the client-facing surface (`/dashboard/my-ca`) only shows requests and uploads. It gains three sections:

- **Shared reports** — CA marks a generated report as shared with the client; the client sees the list and downloads via signed URL. New "Share with client" control on the CA reports screen.
- **Message thread** — a real two-way thread per client on top of the existing messages table: client posts, CA replies from the client 360 view, unread counts on both sides, attachments allowed.
- **Invoice payment** — the client sees CA invoices with status and amount due. "Pay now" creates a Razorpay payment link for that invoice; a static UPI QR is shown on the invoice as a fallback. A webhook marks the invoice paid, writes a settlement record and logs it to the audit trail.

## 2. Bank feed ingestion (account aggregator)

Built provider-agnostic, since AA credentials aren't in hand yet:

- Consent + fetch data model: consent handle, consent status, linked accounts, fetch sessions, raw FI payloads, and the transactions derived from them.
- A pluggable adapter interface with Setu and Finvu implementations stubbed against their documented request shapes, plus a mock adapter used until real keys exist.
- Client-side flow: request consent → client approves at the AA → callback stores the handle → scheduled and on-demand FI fetch → normalise into the same bank transaction shape CSV import produces, with lineage back to the fetch session.
- The connect UI states plainly that live feeds activate once AA credentials are added.

## 3. Notification delivery (WhatsApp)

- A single outbound notification queue with channel (in-app / email / WhatsApp), template, payload, status, retry count and provider message id.
- A sender adapter with Meta Cloud API and BSP implementations behind one interface; the active provider is chosen by a setting, and with no provider configured messages queue as `pending_provider` instead of silently failing.
- Delivery worker on the existing cron route: picks due messages, sends, records status, exponential backoff on failure.
- Existing alert/chaser/compliance paths write to the queue instead of only in-app, honouring each firm's notification preferences.

## 4. Practice intelligence + time capture

- Time entries per staff member against client/engagement/task, with a start/stop timer on any task plus manual entry and edit.
- Timesheet view per member (week grid) and a firm-wide view for Partner/Manager.
- Profitability, capacity and realisation pages switch from structural placeholders to real numbers: realisation = billed vs time value, profitability = fee minus time cost per client, capacity = booked hours vs available hours by week. Metrics with no underlying data still say "not enough data yet" rather than showing zero.
- Cost rate per member (hourly) in Users & Roles, needed for the profitability maths.

## 5. Mobile polish for the CA portal

- Sidebar becomes a slide-over drawer under 1024px with a header hamburger; desktop unchanged.
- Wide tables get a card-list rendering under 768px (label/value stacks) driven by a shared responsive-table primitive, so every CA list adapts once.
- Touch-target, padding and font-size pass on the portal shell, filters, drawers and forms at 375–468px.
- Client 360 tabs become horizontally scrollable rather than wrapping.

## 6. Business-logic unit tests

Vitest suites (no DB required — pure functions extracted where necessary):

- **Reconciliation matching**: exact, tolerance, date-window, many-to-one and no-match cases; 3-way match precedence.
- **Deduction rules**: each of the six checks (80JJAA, 44AD, 80-IAC, blocked ITC, 80G, depreciation) with qualifying, non-qualifying and boundary inputs.
- **GST computation**: category-aware rates, CGST/SGST vs IGST split, rounding, ITC eligibility and the 1% ITC matching tolerance.
- Plus annualisation/practice-metric helpers and the CSV/bank-amount parsers.

## Technical notes

- New tables (all with GRANTs, RLS, firm scoping via the existing `user_in_ca_firm` / `ca_firm_has_client_access` helpers): `ca_report_shares`, `ca_invoice_payments`, `ca_bank_consents`, `ca_bank_accounts_linked`, `ca_bank_fetch_sessions`, `ca_notification_outbox`, `ca_time_entries`. `ca_client_messages` gains read-state columns; `ca_firm_members` gains a cost rate.
- Client-portal reads are client-scoped through the existing `ca_client_users` binding — a client can only ever see their own business.
- Razorpay payment links are created server-side from the existing integration; the payment webhook lands on a `/api/public/*` route with signature verification and idempotency on the payment id.
- AA and WhatsApp adapters live in `src/lib/` server modules with a narrow interface each, so switching providers is one file.
- Both new cron consumers (AA fetch, notification outbox) reuse the existing secret-gated public route pattern.

## What still needs you

- **AA credentials** (Setu or Finvu) before live bank feeds; the pipeline ships working against the mock adapter.
- **WhatsApp provider choice + approved templates**; the queue and worker ship regardless.
- **Razorpay account + UPI VPA** for client invoice payments in production.

## Build order

1. Business-logic tests (locks current behaviour before refactors).
2. Client portal depth incl. invoice payment.
3. Notification outbox + WhatsApp adapter.
4. Time capture + practice intelligence.
5. Bank feed AA layer.
6. Mobile polish pass across the portal.
