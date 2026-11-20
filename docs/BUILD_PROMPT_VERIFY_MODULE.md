# Final build prompt: the Verify module (statutory and financial QC) plus the compliance workstream

Copy everything below the line into the builder (Claude Code, Lovable or an engineer's brief). It is written to be self-contained. Companion plans: `docs/CA_FOUR_CHECKS_PLAN.md`, `docs/TRUST_COMPLIANCE_AND_QC_MODULE_PLAN.md`, `docs/TRUST_AND_ACCURACY.md`, `docs/REAL_FILE_GATE.md`.

---

## 0. Your role and the one-sentence goal

You are building **Verify**, a separate module inside FynHelp (repo `fynny2.0`, TanStack Start + Supabase) that lets a CA firm prove, for one client and one month, that the books agree with the bank, the invoices, the filed GST returns and last year's audited closing, and hands the partner an **evidence pack** they can sign. In the same effort you close the compliance gaps listed in section 9, because CA firms will not upload client data to a tool whose security claims are wrong.

FynHelp's positioning does not change: month-end close and reconciliation for CA firms and accountants. Verify is a step and a section inside Close, not a rebrand and not a new product.

## 1. Read before you write anything

1. `docs/CA_FOUR_CHECKS_PLAN.md`, `docs/TRUST_AND_ACCURACY.md`, `docs/REAL_FILE_GATE.md`, `docs/CLOSE_WORKFLOW.md`, `docs/UX_STANDARDS.md`, `docs/TALLY_FILE_FORMATS.md`, `docs/TRUST_COMPLIANCE_AND_QC_MODULE_PLAN.md`.
2. Code you will extend, not replace: `src/lib/practice/close/steps.ts` and `close.server.ts` (derived close steps), `src/lib/practice/gst/{returns,reconcile,invoices,validations,tallyVouchers,files}.ts` (GST checks), `src/lib/practice/recon/engine.ts`, `src/lib/practice/exceptionKinds.ts` and `exceptionWork.server.ts` (exceptions with owners and history), `src/lib/practice/extract/*` (readers and tie-out), `src/lib/practice/gstTally.server.ts` (Day Book fill), `src/components/ca/TxnLineageDrawer.tsx` (evidence), `src/lib/caAudit.ts` (append-only audit), `src/v2/pages/{ClosePage,GstPage,ExceptionsPage,ReviewPage}.tsx`.
3. Run the existing tests first (`bun run test`) and note what fails before you change anything. Do not "fix" unrelated failures silently; report them.

## 2. Non-negotiable principles (inherited from the product; do not weaken)

1. **AI reads, code proves, people approve.** Every figure is computed in code from a source the user can open. AI may read an unstructured PDF, then the result must pass a tie-out against totals the document itself prints; otherwise it is held for a person.
2. **A check that cannot be computed says exactly what is missing.** Never show a partial result as complete. Never fill a gap with a guess.
3. **Every result carries evidence:** both figures, the source file and row or page of each, the rule applied, the difference, and the decision (who, when, why).
4. **Nothing is posted, filed or changed in Tally, the GST portal or the client's files.** Verify only reads and proposes. No auto-entry, no write-back, no filing, no return preparation. (Existing Tally posting stays separate and approval-gated.)
5. **Doubt becomes an exception** with an owner and a history, using the existing exception system (add kinds; do not create a second queue).
6. **Differences are decisions for a person**, recorded with name, role, time and reason. Partner-only for sign-off.
7. **Money is exact:** integer paise or the existing rounding helper; tolerance of Rs 1 per invoice as the portal rounds (see `TOLERANCE` in `returns.ts`); never floats for sums that are compared.
8. **Cost control:** rules and structured files first; AI only on unstructured PDFs, in the compact format, within the per-document call cap.

## 3. Deep research mandate (do this first, write findings to `docs/VERIFY_RESEARCH.md`)

You are not a CA; do not invent accounting rules. For each item below, find the authoritative source (CBIC and GST portal notifications, the GST Council/CBIC circulars, GSTN API and JSON schema documents, Tally Prime documentation for XML export and bill allocations, ICAI guidance), record the link, the date and the exact rule, and mark anything you could not confirm as **UNCONFIRMED: ask the CA**. Cite; do not paraphrase from memory.

1. **GST JSON structures** for GSTR-1, GSTR-3B, GSTR-2B (and 2A if cited): field names, sections (b2b, b2cs, cdnr, exp, nil, hsn), amendments (b2ba, cdnra), credit/debit notes, tax-period and filing-period fields, how amended invoices replace originals, and how the portal rounds.
2. **Matching rules a CA applies:** invoice number normalisation (prefixes, zeros, slashes, financial-year suffixes), date tolerance, value tolerance, GSTIN checksum algorithm (state code, PAN, entity number, checksum), place of supply and IGST vs CGST+SGST logic, HSN length requirements by turnover, valid GST rate slabs, RCM situations, **blocked credit under section 17(5)**, **ITC reversal rules (Rule 37 for non-payment within 180 days, Rule 42/43)**, **section 16(2)(aa)/(c)** conditions, time limit under section 16(4), e-invoice (IRN) applicability by turnover and when it matters to 1 vs books matching, and credit-note timing.
3. **Tally data:** Day Book and register XML/Excel shapes, voucher types, ledger group hierarchy, bill allocations (`BILLALLOCATIONS.LIST`, bill type New Ref / Agst Ref / Advance / On Account), opening balance representation (Dr/Cr sign), and how Tally exports closing balance of the previous year. Compare with `docs/TALLY_FILE_FORMATS.md` and list gaps.
4. **Audited closing and opening-balance practice:** how CAs compare opening to audited closing (regrouping, prior-period adjustments, reclassification), the standard explanations that are legitimate, and which differences must never be auto-accepted.
5. **Bill-to-bill and ageing practice:** ageing bucket conventions, advances and on-account handling, GST-inclusive vs exclusive references, TDS deduction effect on receipts, part-payments, one receipt against many invoices, one invoice against many receipts, and typical bank narration patterns for Indian payments (NEFT/RTGS/UPI/IMPS/cheque/clearing).
6. **Competitors and what users already do** (Suvit, ClearTax, Tally add-ons, Excel): what CA firms use for GSTR-2B and sales reconciliation today, what output they trust, and what format of report they hand to clients. Write down what a good output looks like in their words. Mark vendor claims as unverified.
7. **Compliance:** DPDP Act 2023 and the DPDP Rules 2025 (phased dates, duties of Data Fiduciary vs Processor, breach notice, children, grievance), IT Act s.43A and SPDI Rules, CERT-In Directions 2022 (6-hour incident reporting, 180-day log retention in India), ICAI confidentiality expectations, and what Supabase, Vercel, Groq, Google and the Lovable gateway state about data use, training, retention and region. Record region options for Supabase and Vercel in India.
8. Output a one-page **"Rules we apply and where they come from"** table. The code in section 6 must reference those rule ids in its evidence, so a CA can see why a line was flagged.

If a rule is unconfirmed, build the check so the rule is configurable per firm and off by default, and ask the CA.

## 4. Who it is for, and what they must be able to do (user level)

Design for these people, in this order of importance.

- **Partner / signing CA** (rarely in the product, 5 minutes a day): "Is this client's month safe to sign? What exactly is wrong? Show me the proof." Needs: one status per client, a plain-language list of what blocks sign-off, and an evidence pack to attach or send.
- **Manager / reviewer:** "Which of 40 clients is stuck, on what, with whom?" Needs: portfolio view by status, exceptions by owner and age, one-click to the evidence for a line.
- **Article assistant / junior / accountant** (does the work): "What do I upload, what did it find, what do I do with each item?" Needs: a guided upload with a checklist of which files are still missing, a result they understand without accounting jargon, and a clear next action per item.
- **Client contact** (via existing upload link and WhatsApp chaser): "What does the CA want from me?" Needs: a simple request, never the internals.

Rules for the interface (see `docs/UX_STANDARDS.md`):

1. Plain words. "In the bank, not in your books" not "unreconciled debit". Every status has a one-line meaning and a next step.
2. Every screen answers three questions at the top: **What is the state? What is missing? What do I do next?**
3. Never a blank result: say "needs GSTR-1 JSON for October" and offer the upload.
4. Show the evidence, not just the verdict: click a difference to see both amounts, both sources, and the rule.
5. Mobile-friendly for the partner's review and sign-off; heavy matching screens may be desktop-first.
6. Indian conventions: lakh/crore formatting, financial year Apr to Mar, period "October 2026", dates DD-MMM-YYYY, GSTIN shown in full.
7. Accessibility: keyboard navigable, no colour-only status, sufficient contrast.

## 5. Scope: five checks, one shared engine

A shared **Verify engine** with a common result shape; each check is a pure module with its own tests. Reuse extracted data across checks: a document uploaded once (Day Book, GSTR JSON, audited closing) is stored, classified, normalised and reused by every check and every period without re-upload.

Common result shape (create `src/lib/practice/verify/types.ts`):

```
VerifyCheck {
  id, kind: "bank" | "opening" | "gst_sales" | "gst_itc" | "gst_rcm" | "billwise" | ...,
  clientId, period, status: "passed" | "differences" | "cannot_run" | "stale",
  missing: [{ file, why, howToGetIt }],      // when cannot_run
  lines: [{
    id, state: "matched" | "differs" | "only_in_a" | "only_in_b" | "explained",
    figures: [{ label, amount, source: { documentId, kind, page|row|path }, }],
    difference, ruleId, ruleText,            // from the research table
    exceptionId?, decision?: { by, role, at, reason }
  }],
  totals: { checked, matched, differs, explained, open },
  computedAt, inputsHash                      // stale when any input document changes
}
```

### Check 1: Bank (exists; wrap, do not rewrite)
Expose the existing reconciliation through the common shape. Add **post-matching verification**: after matching, re-prove (sum of matched bank lines equals sum of matched book lines within tolerance, no line used twice, no line outside the period, own-account transfers net to zero) and report any breach as an exception.

### Check 2: Opening balances vs last year's audited closing (new, build first)
Input: audited trial balance or balance sheet schedule (Excel or signed PDF) per client per year, and Tally masters (already read). Output per ledger: matches / differs (amount) / only in Tally / only in audit / regrouped. Name normalisation with a human-confirmed mapping stored per client (`ledger_alias`), never silently fuzzy. PDF reading goes through AI then the tie-out: debit and credit totals must equal what the document prints, else held. A Close step **"Opening balances agree to last year's audit"** (kind `authorized`) is derived: done only when every difference is explained by a named person. Acceptance: on a real client, a deliberately altered ledger is caught; the unaltered pair shows zero differences.

### Check 3: GST (extend `gst/returns.ts`)
Already: sales register vs GSTR-1, GSTR-1 vs 3B outward tax, 2B vs 3B ITC, RCM, and 2B vs purchase register. Add, each as an independent, separately tested rule with a research-table id:
- GSTIN checksum validity and grouping by supplier or customer.
- Rate, HSN and place-of-supply sanity (IGST vs CGST+SGST consistent with the two GSTIN states).
- Taxable value and tax component recomputation (taxable x rate = tax within tolerance).
- Duplicate invoice detection within a GSTIN (normalised number).
- Credit and debit notes handled in both directions; amendments replace originals.
- Blocked credit s.17(5) flags where the ledger category indicates (configurable; off until the CA confirms the list).
- ITC at risk: purchase in books, not in 2B, with the vendor follow-up text that already exists.
- Missing invoices both ways (in Tally not in GSTR-1; in GSTR-1 not in Tally).
Do not fabricate anything the files do not contain: a Day Book has no buyer GSTIN, so match on invoice number and say so.

### Check 4: Bill-to-bill, ageing and invoice-to-payment (build after the connector provides bill allocations)
Party-wise open bills with age buckets 0-30, 31-60, 61-90, 90+, receipts and payments mapped to bills by reference, amount and date, one-to-many both ways, partial payments, TDS-adjusted receipts, advances and "on account" listed separately. **Party totals must equal the Tally ledger closing to the rupee; otherwise the report says "incomplete" and shows the gap.** This is the advisor's "invoice-to-payment mapping" and the CA's "bill-to-bill mapping": one build.

### Check 5: Sales invoices vs Tally (later; do not build in this pass)
Physical or software invoices read by AI, tied out, compared with the sales register. Needs a corpus of real invoices. Only design the data model hooks now.

### Cross-cutting
- **Document registry and relationships:** one table of stored documents with classification (bank statement, day book, sales register, purchase register, GSTR-1/3B/2B/2A, audited closing, loan statement, invoice) and a relationship model: client, party (customer/vendor), invoice, payment, ledger. Extend existing tables; check `supabase/migrations` before adding any.
- **Stale detection:** each check stores `inputsHash`; if an input changes, the check shows "stale, re-run" and any Close step derived from it reverts.
- **Missing documents:** each client-month has an **expected documents** list; Verify shows which are missing and offers the chaser (existing WhatsApp/email/upload-link flow).
- **Exceptions:** add kinds for the new checks to `exceptionKinds.ts` (for example `opening_difference`, `gst_value_mismatch`, `gstin_invalid`, `itc_at_risk`, `unmapped_receipt`) with a label and a one-line action, derived from rule results, never from AI.

## 6. The evidence pack (the deliverable the partner signs)

One export per client and period, PDF and Excel, generated server-side from stored results only:
1. Cover: client, GSTIN, period, firm, generated by, generated at, version, the Close state.
2. Summary table: each check, status, counts, and the rupee value of open differences.
3. Per check: the figures, sources (file name, page or row), the rule id and text, the difference, and the decision with name, role, time and reason.
4. Missing documents and pending verification, stated plainly.
5. Exceptions still open, with owners and ages.
6. Sign-off block with the partner's name and timestamp (from the existing sign-off), and a footer: "Computed from the documents listed; this is not an audit opinion or a filing."
7. A document list with SHA-256 of each input so the pack can be re-verified later.
The pack never contains data from another client or firm. Generating and downloading it writes an audit event.

## 7. Data and architecture rules

- Server logic in `src/lib/practice/verify/*` (pure) and `*.server.ts` (I/O); RPC and server functions follow the patterns in `practice.functions.ts`. Pure modules are isomorphic and unit-tested without a database.
- New tables only if existing ones cannot hold the data. Every new table: `ca_firm_id` not null, RLS enabled with the same helper functions as siblings (`ca_can`), grants as in recent migrations, an index on `(ca_firm_id, business_id, period)`. A migration comes with an RLS test in `supabase/tests` and `tests/rls`.
- Service-role code must call a firm-membership check before reading any row by id (see compliance item C6).
- No new third-party service without adding it to the sub-processor table and the DPA.
- Feature flag the module per firm (`verify_enabled`) so pilots can be switched on and off.

## 8. Testing and acceptance (a feature is not done until all are true)

1. **Pure unit tests** per rule, including boundary cases (Rs 1 tolerance, zero-padded numbers, amended invoices, credit notes, same invoice twice, wrong state code, GSTIN checksum fail, empty files, wrong period, wrong file type).
2. **Golden tests** in the style of `tests/unit/practice/*golden*`: add a case each time a wrong result is found.
3. **Real-file gate:** add Verify cases to `tests/real-gate-expected.json` and `docs/REAL_FILE_GATE.md`: counts only, no client data. Real GSTR-1/3B/2B and an audited closing PDF are required for checks 2 and 3 to be called "verified on real data"; until then label them **"tested on synthetic files"** in the UI and docs.
4. **Isolation tests:** two firms, two clients; firm A cannot read firm B's checks, documents or packs through any table, RPC, storage path or server function.
5. **Stale and tie-out tests:** altering any input flips the check to stale; an AI-read PDF whose totals do not tie is held, never used.
6. **UI tests** for the three questions on each screen, missing-file states, and the partner view at 390px width.
7. **Idempotence:** re-running a check on unchanged inputs gives byte-identical results and does not duplicate exceptions.
8. Lint, typecheck, build and the whole test suite pass; no existing real-file baseline count drops.

## 9. Compliance workstream (same pass, free of licence cost)

Do these in order. Items C1 to C8 are copy or config and are done first; they correct claims that are currently untrue.

- **C1 Region claim.** `src/components/home/SecuritySection.tsx` says data stays in Mumbai; `src/content/legal/company.ts` and `vercel.json` say Sydney (`ap-southeast-2`, `syd1`). Make the page state the truth. If the owner decides to migrate, change Supabase and Vercel regions together (a project move, not a code toggle) and keep the page truthful in the meantime.
- **C2 Remove false claims:** "zero-knowledge", "we cannot decrypt your data", "SOC 2 ready", "annual third-party audits", "bi-annual penetration testing", "99.9% accuracy", "same standards as HDFC, ICICI, Axis", "RBI data localisation compliant", "IP-based access controls" for customers, "one-click export and delete" (until built). Replace with statements that are verifiable in the code, and mark certifications "planned".
- **C3 Company details:** fill `COMPANY` in `company.ts` (legal name, CIN, address, Grievance Officer name and phone). Ask the owner; do not invent.
- **C4 Sub-processors:** add every host that receives document text or personal data (the Lovable AI gateway is missing; verify each provider in `llm.server.ts`, `ocr.server.ts`, email, WhatsApp, Sentry).
- **C5 Two-factor:** default `require_mfa` on for partner and manager roles; set `ADMIN_REQUIRE_MFA=true` in deployment notes.
- **C6 Service-role review:** list the files that use the service role, add a shared `assertFirmAccess(ctx, businessId)` helper, and apply it to every by-id read; add a test per function that firm A's id is refused for firm B.
- **C7 Audit expansion:** log file opened or downloaded, report or evidence pack exported or shared, share link created or revoked, role changed, member invited or removed, sign-in, password revealed, client archived or erased, Verify check run, decision recorded. Add a partner-only audit screen with filter and CSV export. The log stays append-only.
- **C8 Retention and erasure:** a scheduled purge for cancelled firms per the policy (30 days export then deletion), a "delete this client's data" action with confirmation, receipt and audit row, and a firm-level full export (Excel plus original files). Align the privacy text with what is actually built.
- **C9 AI minimisation:** mask PAN, Aadhaar, mobile and full account numbers in text sent to AI providers where the task does not need them; confirm each provider is on terms that exclude training on inputs; document it.
- **C10 Sentry and logs:** confirm session replay masks all text and blocks media on the CA portal; ensure no amounts, names or GSTINs reach error events.
- **C11 Share links:** revoke button, per-link access log, shorter default expiry, optional single-use upload link.
- **C12 Web hardening:** CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `/.well-known/security.txt`, `SECURITY.md` with a disclosure address.
- **C13 Documents:** write (as `docs/` files and, where public, as site content): Data Processing Agreement for CA firms (Fiduciary/Processor, sub-processors, breach notice, return and deletion), security questionnaire answers (about 30 questions, each answered only with what is true and linking the code or setting), incident response runbook (72-hour Board report, CERT-In reporting, customer notice, breach register), data inventory, short DPIA for AI reading, quarterly access-review checklist.
- **C14 Advisor test environment:** a separate project and demo firm with masked or synthetic data, a read-only role, no production keys; an NDA before access; no production source code is shared.
Mark as **not free, planned**: penetration test, ISO 27001 or SOC 2, cyber insurance, Mumbai migration effort. Never claim them until they exist.

## 10. Delivery plan (commit small, in this order)

1. `docs/VERIFY_RESEARCH.md` (section 3) and the rules table. Get it checked by the CA advisor before coding rules marked UNCONFIRMED.
2. C1 to C5 (copy and config), then C6 and C7.
3. Verify shared types, the check registry, `inputsHash`/stale, the evidence-pack skeleton, `verify_enabled` flag.
4. Check 2 (opening vs audited closing) with its Close step.
5. Check 1 post-matching verification and the evidence pack (PDF and Excel).
6. Check 3 additions, one rule per commit with its tests.
7. C8 to C14.
8. Check 4 (bill-to-bill) once bill allocations are available; then stop and report.
Each step: tests green, real-gate counts not lower, a short note in `docs/` of what changed and what is still synthetic-only. Commit on the working branch; do not open a pull request unless asked.

## 11. Explicitly out of scope

Automated accounting entries, Tally write-back, GST return preparation or filing, live accounting, physical-invoice OCR matching (design hooks only), any claim of audit assurance, any certification claim, and any change that reads or exposes one client's data to another.

## 12. Report back with

What you built and what you did not; which rules are confirmed (with sources) and which are UNCONFIRMED; what is tested on real files versus synthetic; every compliance claim you changed and why; every question you need the owner or the CA to answer (company details, Grievance Officer, region decision, real sample files); and any failing tests you found before you started.
