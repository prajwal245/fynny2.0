# Trust, DPDP readiness, and the QC module: what to do now, at no licence cost

Date: 19 Nov 2026. Based on a read of the code, migrations, legal pages and docs in this repo. Not legal advice: have a lawyer (or the firm's CS) review the policy and DPA before they are published. DPDP Rules 2025 timelines should be confirmed with counsel; my understanding is that most obligations of a Data Fiduciary or Processor start roughly 18 months after the Rules were notified (Nov 2025), so about mid-2027. CA firms will ask now anyway.

## 0. How we are positioned (agreed)

FynHelp stays what it is: month-end close and reconciliation for CA firms and accountants. "Financial & Statutory QC" is a **module inside Close** (a Verify step with an evidence pack), not a rebrand. Reason: the code already has the close workflow, exceptions with owners, sign-off and lineage, and the QC checks are those same things pointed at more sources.

## 1. What is already good (say so, with proof)

| Control | Where | Verified |
|---|---|---|
| Row-level security on tenant tables | 246 `ENABLE ROW LEVEL SECURITY` statements across migrations; `.github/workflows/supabase-security-lint.yml` | Policies exist; no cross-tenant test seen |
| Append-only audit log | `ca_audit_events` with a trigger that blocks UPDATE/DELETE; `src/lib/caAudit.ts` | Yes, in migration |
| Role-based permissions | `ca_role_permissions`, `ca_can()`, roles partner / manager / senior / junior / staff | Yes |
| Firm-level 2FA (TOTP) | `ca_firms.require_mfa`, `CAMfaBanner`, `CATwoFactorCard` | Optional per firm, not on by default |
| Encrypted secrets | Gmail tokens and locked-file passwords encrypted in app code; reveal of a password is a logged action | Yes (`caGmail.server.ts`, `filePasswords.server.ts`) |
| Upload allow-list and size limits | `src/lib/uploadPolicy.ts` | Yes |
| Share links expire and can be revoked | upload links and shared MIS use `expires_at`, `revoked_at` | Partly: no revoke screen or access log seen |
| Admin hardening | IP allow-list, session, optional MFA (`security.server.ts`) | MFA is **off** unless `ADMIN_REQUIRE_MFA=true` |
| Policy structure | Privacy policy names DPDP, SPDI, Fiduciary/Processor split, 72-hour breach report, grievance officer | Good bones; placeholders unfilled |
| Dependency hygiene | `dependabot.yml`, Sentry email masking | Yes |

## 2. P0: things that are untrue or contradictory today (fix before any CA firm does diligence)

These cost nothing and are the biggest risk, because a firm's IT or a competitor can check them in minutes.

1. **"Your data never leaves India. Mumbai AWS."** (`src/components/home/SecuritySection.tsx`) versus the code: `company.ts` says the database is in **Sydney (Supabase ap-southeast-2)** and `vercel.json` pins functions to **syd1**. Pick one:
   - Truthful now: "Hosted in Sydney. Mumbai region is on our roadmap." (my recommendation until the move happens)
   - Or migrate Supabase and Vercel to Mumbai (ap-south-1 / bom1) together. DPDP does not, as I understand it, require India-only storage for this kind of data, but CA firms prefer it and the CERT-In log rule (180 days within India) is hard to defend with a Sydney stack.
2. **"Zero-knowledge. We cannot decrypt your data."** False: the server reads statements, sends text to LLM providers and renders reports. Remove. Replace with "Encrypted in transit and at rest by our database provider; secrets such as Gmail tokens and file passwords are additionally encrypted by us."
3. **"SOC 2 ready", "annual third-party audits", "bi-annual penetration testing by certified firms", "99.9% accuracy rate"**, "same security as HDFC, ICICI and Axis", "IP-based access controls" (for customers), "Your CA sees tax data only". No evidence in the repo. Remove or reword to what exists, e.g. "Independent audit: planned" and link accuracy claims to `docs/ACCURACY.md` figures.
4. **"Compliant with RBI data localisation"**: RBI's rule applies to payment-system data, not to a CA SaaS. Remove the line.
5. **"One-click export and delete anytime"**: only a security settings page was found; no firm or client data export or erasure job. Either build it (section 3) or soften the claim.
6. **Privacy policy placeholders**: entity, CIN, address, **Grievance Officer name and phone** are empty ("To be published"). SPDI and DPDP both expect a named contact. Fill `src/content/legal/company.ts`.
7. **Sub-processor table is incomplete.** The AI order in `llm.server.ts` is Groq, then the **Lovable AI Gateway**, then Google Gemini. Gateway is not listed. Add it, plus any other host that receives document text.
8. **Retention promised, not built.** Policy says data is deleted within 30 days after the 30-day export period following cancellation. `archive.ts` says "nothing is deleted". No purge job found in `cron.server.ts`.

## 3. P1: build now (all free, mostly small)

| # | Work | Effort | Why a CA firm cares |
|---|---|---|---|
| 1 | **Turn on MFA**: default `require_mfa` to true for partner and manager roles; set `ADMIN_REQUIRE_MFA=true` | S | First question in any questionnaire |
| 2 | **Log reads and exports, not just creates.** Today 43 call sites log only ~9 action types (created, mfa, request_closed). Add: statement/file opened or downloaded, report exported or shared, share link created and revoked, role changed, member invited or removed, login, password revealed, client archived or deleted | M | "Who saw client X's data?" |
| 3 | **Audit log screen with filter and CSV export** for partners | S | Evidence for the CA's own clients |
| 4 | **Retention and erasure**: scheduled purge after cancellation + 30 days; "delete this client's data" with a confirmation, a receipt and an audit row; firm-level full export (Excel and original files, zipped) | M | Delivers the DPDP and contractual promise |
| 5 | **Cross-tenant test in CI**: two firms, two clients, assert firm A cannot read B's rows or storage objects through every table, RPC and storage bucket. `supabase/tests` already exists | M | RLS is only as good as its test |
| 6 | **Review the 23 files that use the service role**: each must check firm membership before reading by id (IDOR). List them, add a shared `assertFirmAccess` helper | M | Service role bypasses RLS, so this is where a leak would come from |
| 7 | **AI data minimisation**: mask PAN, Aadhaar, mobile and full account numbers in text sent to LLMs where the task does not need them; confirm each provider is on a paid or no-training tier (free tiers of some APIs may use inputs to improve products; check terms) | M | Answers "does my client's data train a model?" truthfully |
| 8 | **Sentry**: confirm session replay masks all text and blocks media on the CA portal (`replaysOnErrorSampleRate` is 0.5); scrub amounts and names from breadcrumbs | S | Replays can silently capture client ledgers |
| 9 | **Share links**: revoke button, per-link access log, shorter default expiry, one-time upload link option | S | Client-facing links are the likeliest leak |
| 10 | **Security headers and disclosure**: CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy` in `vercel.json`; `/.well-known/security.txt`; `SECURITY.md` | S | Free signal of maturity |
| 11 | **Session**: idle timeout for the CA portal, device list, "sign out everywhere" | S | Shared office PCs |
| 12 | **Tally connector**: document exactly what it sends, signed installer, per-firm revocable token | S | Desktop agent is a trust hot spot |

## 4. P1: documents to write (free, a day or two)

1. **Trust page** that lists only verified controls, the real hosting region, sub-processors, and what is planned.
2. **Data Processing Agreement for CA firms.** The policy already treats the firm as Data Fiduciary and FynHelp as Processor. Put that in a signable DPA with sub-processor list, breach notice period, return and deletion terms. CA firms owe their own clients confidentiality, so this is the document they actually need.
3. **Security questionnaire answers** (one reusable sheet of about 30 answers: hosting, encryption, access, MFA, logging, backups, incident, sub-processors, retention, pen test status).
4. **Incident response runbook**: who decides, 72-hour Board report and customer notice per the policy, and the **CERT-In 6-hour reporting** duty for certain incident types (verify with counsel). Keep a breach register.
5. **Records**: data inventory (what personal data, where, why, retention), a short DPIA for the AI reading step, access-review checklist (quarterly), staff confidentiality undertaking.
6. **NDA and a safe test environment for the advisor**: a separate Supabase project and demo firm with synthetic or masked data, a read-only role, no production keys. Never real client data.

## 5. Not free, and what to say meanwhile

- Independent penetration test (low lakhs), ISO 27001 or SOC 2 (several lakhs and 6 to 12 months), cyber insurance, Mumbai migration effort, point-in-time recovery plan. Say "planned" until each is true. Do one pen test before the first firm above about 25 clients.
- Do not claim a certification you do not hold. A single false claim can end a CA relationship.

## 6. The QC module: what exists, what the advisor's list adds

Checked against the repo (see also `docs/CA_FOUR_CHECKS_PLAN.md`, which is more current than `docs/TRUST_AND_ACCURACY.md` on GST):

| Advisor's module | State in code | Next step |
|---|---|---|
| A. Bank reconciliation | Built, tested on real files; exceptions, evidence lineage (`TxnLineageDrawer`), tie-out, close with sign-off | Evidence pack export; post-matching re-check |
| B. Sales invoice vs Tally | Day Book fill exists; physical invoice reading is not built | Defer. Needs a corpus of real invoices |
| C. GST: Tally vs filed GSTR | Returns check built (sales vs GSTR-1, 1 vs 3B, 2B vs 3B ITC, RCM) and 2B vs purchase register | **Blocked on real GSTR-1/3B files.** Tests are synthetic only. Add GSTIN checksum, HSN and rate checks, s.17(5) blocked credit |
| D. Invoice-to-payment mapping | Not built | This is the same problem as **bill-to-bill and ageing** (Phase 4 of the four-checks plan). Build once; needs Tally bill allocations |
| E. Opening balance vs prior closing | Opening balances read; no comparison with audited closing | **Smallest build, ship first** |

Order (replaces my earlier table; the repo is further along than the meeting notes assume):

1. **Get real files** for one client-month: GSTR-1 JSON, 3B JSON, 2B, registers, a signed audited closing PDF. Without them, module C is unproven. Add them to the real-file gate (`docs/REAL_FILE_GATE.md`).
2. **Opening-balance check** (module E) and a Close step "Opening balances agree to last year's audit".
3. **Evidence pack**: one exportable PDF and Excel per client-month: each check, both figures, sources, differences, who decided what and when. This packages what exists and is what a partner shows a client or auditor.
4. **GST hardening**: GSTIN checksum and grouping, rate and HSN sanity, blocked credit, 2A if the CA asks.
5. **Bill-to-bill, ageing and invoice-to-payment** together, once bill allocations are available from the connector.
6. **Loan reconciliation**, then **physical invoice vs Tally**.
7. Keep auto-entry, Tally write-back and GST filing out of scope, as agreed. Proposed entries that a person approves already exist for Tally posting; keep that path separate.

## 7. Suggested sequence (two to three weeks of focused work)

- Days 1 to 2: all of section 2 (copy and config only), fill company details, name a Grievance Officer.
- Week 1: MFA defaults, audit expansion and screen, share-link revoke and log, headers and `security.txt`, Sentry masking check, service-role review.
- Week 2: retention and erasure, firm export, cross-tenant CI test, AI masking, then the DPA, questionnaire and trust page.
- In parallel: collect the real GST and audit files; build the opening-balance check.
