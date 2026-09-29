# Real data everywhere: no sample numbers left in the product

Four changes, in order. Everything on screen after this comes from the practice's own uploaded data.

## 1. Bulk Actions, Revenue Analytics, TDS Tracker — real figures only

Today these three practice pages show invented numbers. After this change:

- Every figure is read live from the practice's own records for the selected client and month. No assumed values anywhere.
- When there is nothing uploaded yet, the page shows honest zeros/empty tables instead of made-up ones.
- A prompt appears over the page when it opens with nothing to show: "Upload your data to see this". It offers a direct button to the upload screen, closes itself after 30 seconds, and has a close button. It is shown once per page per session, never on top of a page that already has data.
- Bulk Actions lists your real clients (not a fixed name list), and each bulk action runs against the selected real clients.
- Revenue Analytics is built from your practice's real invoices and payments received.
- TDS Tracker is built from your real client TDS records and compliance deadlines.

## 2. The /v2 preview becomes a real, saved product

/v2 currently runs entirely in the browser and forgets everything on refresh. It gets rewired to the same live records the main practice portal uses, page by page:

- Clients, client workspace, and onboarding — real clients, created and saved for the practice.
- Documents — real uploads to secure storage, real extraction, real status.
- Review queue and Exceptions — real extraction rows and real reconciliation exceptions, with confirm/discard/resolve saved.
- Chaser — real document requests, real send/reply/skip history.
- Reports and report detail — real generated reports, real sign-off, real exports.
- Settings — real practice and member records.
- Portfolio — real counts and next-best-actions.

Every seeded company, seeded transaction, and "explore with sample data" entry point is removed from /v2. Empty practices see empty states, not samples.

## 3. The demo tour is removed

The public demo tour (the seeded sample company and all its screens) is deleted:

- All /demo screens and their supporting sample-data code are removed.
- Links to the demo in the site menu, footer, home page, pricing, and CA pages are replaced with links to sign up / book a call.
- Any old /demo address redirects to the home page so shared links do not break.

## 4. Test accounts

No change requested here. The two test accounts stay as practice accounts. They can add their own client, upload a real file, and check the whole Extract, Review, Reconcile, Report, Sign-off chain end to end with real responses. Once the above is done, nothing they see anywhere is sample data.

## Technical notes

- New shared component `src/components/ca/UploadDataPrompt.tsx`: portal-rendered alert, 30s auto-dismiss timer cleared on unmount, `sessionStorage` key per page id, rendered only when the page's query resolves to zero rows.
- `CABulkActionsPage.tsx` switches to `useCAClients()`; `CARevenuePage.tsx` and `CATdsTrackerPage.tsx` query `ca_invoices` / `ca_invoice_payments` and `ca_tds_records` + `ca_compliance_events`, firm-scoped, period-aware, INR-formatted via `formatINRFull`/`inrCompact`.
- `src/v2/store.tsx` is replaced by TanStack Query hooks over the existing tables (`ca_clients`, `ca_client_documents`, `ca_document_extractions`, `ca_exceptions`, `ca_document_requests`, `ca_reports_log`, `ca_mis_signoffs`, `ca_client_periods`), reusing `caIntake.ts`, `caRecon.ts`, `caMis.functions.ts`, and `caBrainSignals.ts` rather than duplicating logic. `/v2` moves behind the existing CA auth guard.
- Demo removal: delete `src/routes/_main/_demoGate*`, `src/demo/**`, `src/pages/demo/**`, `CADemoContext`, demo nav entries; add a catch-all redirect route for `/demo/$`. Seeded demo tables are left untouched in the database but no longer read by any screen.
- Existing tests (recon, deductions, GST) must stay green; typecheck and production build run at the end.
