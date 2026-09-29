# FynHelp CA — A-to-Z Product Architecture Build

Turn the blueprint into a real, navigable CA operating system: all 13 product systems present in the portal, a 5-role permission model, a client-facing portal, and one workflow — **Document intake → OCR → classify → confidence → post** — fully working end to end.

## What you get

**1. Full RBAC (Partner / Manager / Senior / Junior / Client)**
- Extend firm membership with the five blueprint roles plus a permission matrix (full visibility, approve & sign-off, review & approve, process queues, upload/respond only).
- Every CA page and action is gated by role: sign-off buttons only for Partner, approvals for Manager/Partner, processing for Senior/Junior, read-only status for Client.
- Firm settings gains a **Users & Roles** screen (invite, change role, deactivate) visible to Partner/Manager only.

**2. Document Intake OS (the working end-to-end module)**
- **Request → Collect**: CA raises a document request against a client (period, doc types, due date). Client sees it in their portal.
- **Upload**: client or CA staff uploads photo/PDF into a per-client private storage namespace.
- **Extract**: existing AI extraction is wired in to OCR the file and return structured fields.
- **Classify + confidence**: each document gets a type (invoice, bank statement, expense bill, challan, other) and a confidence score. High confidence auto-advances; low confidence lands in a **Review Queue**.
- **Review & post**: reviewer confirms/corrects extracted fields, then posts them to the ledger tables with full source linkage (every posted number links back to its source document).
- **Evidence + audit**: every state change writes an immutable activity entry — who, what, when, from which document.

**3. Client Portal (separate surface for the CA's clients)**
- Client-scoped login landing on `/portal`: open requests, upload documents, see status of what they submitted, view shared reports.
- Strictly scoped — a client sees only their own business, never other clients of the firm.
- Invite flow: CA invites a client contact by email; accepting binds them to that one business with the Client role.

**4. A-to-Z skeleton — the remaining systems as navigable pages**
Sidebar is reorganised into blueprint groups, with existing pages slotted in and new ones scaffolded:

| Group | Pages |
| --- | --- |
| Client OS | Client 360, Clients, Add Client, Engagements |
| Documents | Requests, Inbox, Review Queue, Evidence Vault |
| Financial Intelligence | Ledgers, Transactions, Data Quality |
| Reconciliation | Recon Runs, Exception Queue |
| Compliance | GST, TDS, ITR/MCA, Filing Calendar, ITC Recon |
| Workflow & Ops | Tasks, SLAs, Automation |
| Communication | Chaser Queue, Client Messages |
| Review & Close | Month-end Close, Working Papers, Sign-off |
| AI Intelligence | Copilot, Insights, Recommendations |
| Practice Intelligence | Profitability, Capacity, Realisation |
| Billing | Engagement pricing, Invoices, Collections |
| Admin | Users & Roles, Settings, Audit Trail |

Pages that already have real data (GST, ITC, TDS, compliance, reports, portfolio) stay wired as-is. New pages ship as real routes with the correct shell, role gating, empty states and "in build" markers where there is no data source yet — no fake numbers presented as real.

**5. Cross-cutting**
- Every screen carries the blueprint's three promises: numbers link to source, actions are logged, decisions are traceable.
- Status/confidence chips, exception reason codes, and sign-off stamps as shared primitives so all modules look and behave alike.

## Technical notes

- **Schema (new tables, all RLS + grants, firm-scoped)**: `ca_document_requests`, `ca_document_extractions` (raw + parsed JSON, confidence, classification, review state), `ca_review_queue`, `ca_tasks`, `ca_engagements`, `ca_close_periods`, `ca_working_papers`, `ca_exceptions`, `ca_audit_events` (append-only), `ca_client_users` (client-portal membership).
- **Roles**: extend `ca_firm_members.role` to the five-value set, add `ca_role_permissions` plus `SECURITY DEFINER` helpers `ca_member_role(firm)` and `ca_can(firm, permission)` used by both RLS and the UI. Role checks never live in client state.
- **Storage**: reuse the existing private CA documents bucket with a `firm/client/period/` path convention; access enforced via the existing firm-access helpers.
- **Extraction**: reuse `extract-document-ai`; add a CA wrapper that persists extraction rows, sets confidence, and enqueues low-confidence items. AI quota metering stays enforced.
- **Client portal**: new `/portal` route tree with its own guard resolving the signed-in user to a single business through `ca_client_users`; all queries scoped by that business id.
- **Front end**: shared `src/components/ca/os/*` primitives (queue table, confidence chip, evidence drawer, sign-off bar, audit timeline) so the 13 systems stay consistent.

## Build order

1. Role model + permission helpers + Users & Roles screen.
2. Document Intake OS end to end (request → upload → extract → review → post → audit).
3. Client portal bound to requests and uploads.
4. Sidebar restructure and the remaining A-to-Z pages with role gating and honest empty states.
