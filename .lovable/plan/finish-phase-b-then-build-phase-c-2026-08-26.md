# Finish Phase B, then build Phase C

## Phase B — Client OS to 100%

**1. Custom fields on the client forms**
- Add Client (`/ca/clients/add`): render the firm's custom field definitions as extra inputs at the bottom of the form. Values save against the client record once the client exists (on invite acceptance / client creation).
- Client 360 (`/ca/clients/:id`): a "Details" block on the Overview tab showing custom field values with inline edit and save, respecting field type (text, number, date, select) and required flags.

**2. Entity group on the client record**
- Add Client and Client 360 gain a group selector: pick a parent entity group (or none) and ownership %, writing to the same structure `/ca/groups` reads, so a client added here immediately shows in the group tree and consolidated totals.

## Phase C — Security + Ops

**3. Two-factor authentication (TOTP)**
- Security tab in CA Settings gains a 2FA section: enrol (QR + secret), verify a 6-digit code, list enrolled factors, remove a factor.
- Login flow handles the MFA challenge step: when a signed-in user has a verified factor, ask for the code before entering the portal.
- Firm-level toggle "Require 2FA for all firm members" visible to Partner/Admin; members without 2FA are routed to enrolment before reaching portal pages.

**4. Scheduled integration sync**
- A public API route (`/api/public/ca-integration-sync`) that walks every active firm integration (Zoho Books, Razorpay) and runs the existing sync path per client, reusing the current job/idempotency handling.
- Scheduled nightly; results land in the existing sync jobs table and audit trail.
- Integrations page shows last auto-sync time, next run, and per-connection success/failure from the job history, plus a per-connection "auto-sync on/off" switch.

**5. Data lineage surfaced in the UI**
- Any posted number that came from a document or an integration shows its origin: a small source chip on transaction/ITC/TDS rows opening a drawer with the source document (or sync job), extracted confidence, who posted it and when.
- Applied on the Client 360 Bank tab, Review Queue postings and Evidence Vault, using the existing document/extraction and sync-job links.

## Technical notes

- New/changed schema: `ca_firms` gains a `require_mfa` flag; integrations gain `auto_sync_enabled` and `auto_sync_frequency`. Custom field values reuse `ca_custom_field_values`; entity membership reuses the existing group columns on the client record. All new columns keep existing firm-scoped RLS.
- 2FA uses the built-in auth MFA API (TOTP enrol/challenge/verify) — no new secrets, no custom crypto. Enforcement is checked at the portal guard, not stored in client state.
- The sync cron route lives under `src/routes/api/public/*` with a shared-secret header check, following the existing `ca-auto-followup` pattern, and calls the same server-side sync helpers as the manual buttons.
- Lineage reads the existing `source_reference`, document extraction rows and `ca_sync_jobs`; no new posting logic, only a resolver + shared `SourceChip`/`LineageDrawer` primitives in the CA OS component set.
- All new UI uses `portalUi` tokens only.

## Build order

1. Custom fields + entity group wiring in Add Client and Client 360.
2. 2FA enrolment, challenge and firm enforcement.
3. Scheduled sync route + cron + integrations page status.
4. Lineage resolver, source chips and drawer across the three surfaces.
