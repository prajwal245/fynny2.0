# FynHelp QC module: validation of the CA's audit blueprint, and the product roadmap

Source: "Deep-Dive Audit Architecture, CA Practice Blueprint for FynHelp" (36 pages, 19 Nov 2026) and the CA's written feedback of 20 Nov. Method: read everything, test each claim against the code and the real Satkaarika and SSSL files, build what is certain, and order the rest by what a CA tests first.

## 1. What FynHelp is, after reading the blueprint

FynHelp is a **QC (verification) layer on books that are already prepared**: it reads Tally, bank and GST data, proves what it read, finds differences, and hands the CA a working paper with every difference explained or carried forward. It does not do live accounting, data entry or filing. This matches our principle (AI reads, code proves, people approve) and the CA's three rules: every figure ties to a source; year view, not month view; the output is a working paper.

One scope conflict to resolve: the product today can write approved bank entries to Tally (and bank charges or receipts to Zoho, behind switches). The CA asked us to hold to "no posting" for now. Recommendation: keep posting switched off by default for the QC offering, and not market it. It stays in the code behind its switches.

## 2. Validation: each claim tested

| CA's finding | Verdict | Evidence |
|---|---|---|
| Start over changes SSSL May 779 to 670 matched | **Not reproduced on the current build.** SSSL May: 799 then 799 after Start over; Satkaarika: 44 then 44. | Real-file gate, new test "Start over gives the same matches". The 670 came from uploads made before the account and coverage fix, which the build the pilot used did not have. Both are now covered by the proof below. |
| One line can be used twice; both sides must net to zero (RC-6) | **Built now.** | `recon/proof.ts`: each line used once, each match nets to zero, same direction, inside the period, counters equal lists. Runs after every reconciliation, recorded on the run and shown on the Recon tab. Passes on both real sets; unit tests prove it catches a line used twice. |
| Same-day equal amounts left unpaired (128 of 145) | **Fixed in the engine; 4 lines still open on SSSL May.** | Gate records 4 pairable lines (was 128 on the old build). The remaining 4 need investigation, tracked as D1. |
| CA to CC transfers stay open | **Pairs on the real data**, 2 lines open in the full-year set. | Gate: satkaarika_all open 2. Retest on the corrected build. |
| "0 open exceptions" beside unmatched lines | **Cause found, counters redesign pending.** | The two numbers counted different things (all unmatched lines, against decisions still open). The screen now shows both, and states how many are explained or waiting. The blueprint's rule is stricter: a counter must come from the same query as its list (G1). Roadmap item. |
| IB CC statement and Axis loans not read | **Both read now** on the real files. | CC: 64 lines, ties. Axis: three CV loan statements recognised. The pilot's copies were read by an older reader; documents left failed are now re-read automatically. |
| GST: month-only cut gives false differences | **Confirmed.** The ₹5.93 lakh "not claimed" query is a timing effect. | Our check is month-only. Year view is Phase 3. |
| GST: outward year ₹20,16,13,353.54 across GSTR-1, 3B and books | **Reproduced for GSTR-1 = 3B, exactly.** | Reading the CA's FY files month by month: GSTR-1 ₹20,16,13,353.54, GSTR-3B ₹20,16,13,353.54, tax difference ₹0. **Validation found a bug of ours**: portal reports print credit notes as negative and we negated them again, so a year showed ₹20,16,90,853.54. Fixed, with a test. |
| GST: year ITC differs IGST +₹186.05, CGST and SGST −₹4,484.49 | **Not reproduced.** | My comparison (2B available against 3B net ITC excluding RCM) gives different figures. The blueprint's loop (4A(3)+4A(4)+4A(5)+4D less 4B, against 2B with RCM, ISD and import rows) is not fully specified in the document. I need the CA's "GSTR-3B vs 2B ITC" working file to reproduce 186.05 and 4,484.49 exactly. Until then the ITC check should be labelled provisional. |
| Opening balances need ledger level, tolerance equal to the unit, multi-year TB, audit-entry category | **Group level only; tolerance now half the unit.** | Tolerance corrected (was ₹100, now ₹500 for figures in thousands). Ledger level needs the notes' schedules (debtor and creditor lists), which were not in the files; multi-year and audit-entry category are Phase 4. |
| Ledger mapping and party master are the foundation | **Agreed; not built.** | Every GST, TDS, ageing and opening check in the blueprint reads through it. It is Phase 2 and the first thing built after bank accuracy. |
| CAs need Excel working papers with formulas | **Agreed; not built.** | Today there is an evidence pack plan and CSV downloads only. Phase 5. |
| NDA, data terms, India hosting before pilot firms | **Agreed; owner action, not code.** | Hosting region is a project setting that needs a migration to an India region. |
| Status "Built" must come from real files | **Agreed; labels corrected.** | Architecture pack and status text now say Partial where the real-file result is partial. |

## 3. The design: a QC engine, not a list of features

The blueprint has about 60 failure points and 13 review analyses. Built one by one, that becomes 13 separate screens. The design that scales is one engine and many checks.

**A check is a small contract:** an id and stage, the inputs it needs, a `run()` that returns figures, the invariants that prove them, findings (review points), and a working-paper definition. A registry lists them. One "Verify month" action runs every check whose inputs are present and **names the files missing for the rest**, so a missing piece is chased, never assumed (VE-2, G4).

**Shared foundations (built once, used by every check):**
1. `ca_ledger_map`: ledger to Tally group, statement head, nature, GST head and rate, input or output or RCM or carry-forward, TDS section, ITC eligibility. Suggested from names and groups, confirmed once per client, versioned.
2. `ca_party_master`: party, aliases, GSTIN, PAN, Udyam, credit days, related-party flag, from Tally masters plus confirmation.
3. `ca_tb_snapshot`: trial balance by date and source (Tally, audited, revised), ledger level, with its unit.
4. `ca_gst_doc`: one row per invoice or note from books, GSTR-1 and 2B, with invoice, booking and return dates and IMS status.
5. `ca_open_item`: every unmatched item with first seen, last seen, status (open, timing, rejected, lapsed, resolved), reason and owner, carried forward month to month.
6. `ca_review_point`: one finding model (area, severity, amount, owner, status, reply) replacing the separate silos (review queue, exceptions, GST differences).
7. `ca_period_lock`: the input hashes at close. A changed source reopens the month and says why.

**Rules for every check:** integer paise, one sign convention, three dates (document, booking, return); deterministic (same inputs and rule version give the same output, tested); every figure opens to file, page and line; no result shown when its proof fails.

## 4. Roadmap, in order

No dates are promised: each phase ends when its acceptance tests pass on real files, and the pilot CA signs it.

**Phase 0: done in this change**
- RC-6 post-match proof live, with a real-file gate test, plus the determinism test (Start over gives identical matches).
- Credit-note sign bug in the portal readers fixed; year outward total reproduced exactly.
- Opening-balance tolerance set to half the reporting unit; status labels corrected.

**Phase 1: bank and loan accuracy, then the first working paper**
- Investigate the 4 remaining pairable lines on SSSL May (D1); move same-day grouping to a global one-to-one assignment if the cause is first-found matching.
- One counter derivation (G1): every count on a screen comes from the same query as the list beneath it; the "Unmatched" figure splits into explained, set aside, waiting for a statement, and open decisions, and the parts add up.
- Per-account **BRS working paper** (Excel, formulas, 90-day flags, statement closing = next opening) and loan reconciliation.
- Acceptance: gate passes; pilot re-tests Satkaarika and SSSL on the corrected build and agrees the counts.

**Phase 2: ledger map and party master** (foundation)
- Suggest the map from Tally masters; one confirmation screen per client with bulk accept; entity type per client.
- Acceptance: Satkaarika's 1,198 ledgers mapped with the CA correcting under 10 percent, and near-duplicate ledgers (18% SUB CONTRACTOR SERVICES against SERVICESS) flagged.

**Phase 3: GST by year**
- `ca_gst_doc` and `ca_open_item`; read every voucher that posts to a GST ledger (journals and carry-forward ledgers), by ledger family; IMS status; the five loops (output, input, RCM, credit ledger, cash ledger) monthly and cumulative; set-off journal against GSTR-3B table 6.1; RCM tested from the books (expense flag, journal, 3.1(d), cash).
- Acceptance on Satkaarika: outward year ₹20,16,13,353.54 (already reproduced for returns); ITC year difference IGST +₹186.05 and CGST/SGST −₹4,484.49 reproduced exactly (needs the CA's working file); December journal 1286 equals 6.1 by head; sales booked as journals are found.

**Phase 4: opening balances**
- Ledger level for bank, loans, debtors, creditors and taxes; multi-year Tally company (opening is the previous 31 March closing TB); a category "audit adjustment not posted in Tally"; reclassification table per client.
- Needs: the audited notes' schedules and the Tally masters or TB as at 1 April.

**Phase 5: working-paper exports**
- Excel workbooks with a fixed header block, control totals, live difference formulas and a review-points sheet: BRS, GST reconciliation, opening balances, TDS, ageing. Built from the same data the screens show.
- Acceptance: the pilot CA opens one and files it as-is.

**Phase 6: review checks, one at a time** (each with its working paper and an acceptance test)
1. Day-wise cash balance, 40A(3) and 269ST (needs only the Day Book).
2. Opening balances carried with no change; accounts closed by journal; accounts opened and closed in the year.
3. Month-end and year-end adjustment entries register.
4. Debtor and creditor ageing and bill-to-bill (engine built and proved; screen next; bill-wise where present, FIFO labelled where not).
5. Chart-of-accounts review and treatment by entity type (needs the ledger map).
6. TDS working and 26AS (needs the party master and 26AS file); 43B(h) (needs Udyam data).
7. Fixed assets and depreciation under both laws.

**Phase 7: trust and scale** (a condition for more firms, run in parallel)
- Owner actions: NDA and data terms covering data already shared; India hosting before pilot firms.
- Code: audit log of reads, downloads and exports; period lock; the Windows connector installer; fast open on large firms; the real-file gate grown to one masked file per bank layout, loan layout and GST software export.

## 5. Workflow optimisation inside the QC module

- **One inbox.** One review-point list, sorted by rupees at stake and severity, instead of three queues. Carry-forward items return automatically.
- **One button.** "Verify month" runs every check that has its inputs; missing files are named and can be chased by WhatsApp.
- **Stale means reopen.** Inputs are hashed; a changed file reopens the month and says which check and why.
- **Less review time.** Bulk accept of timing items with a reason; the CA sees only differences, sorted; routine entries (set-off, RCM journals) are tagged so adjustment lists stay readable.
- **Lower cost.** Rules read first, compact AI output, call and token limits, content-hash caching (already built).
- **Honest status.** Stage labels are generated from the real-file gate, never written by hand.

## 6. What I need from the CA and from you

From the CA: the "GSTR-3B vs 2B ITC" working file (to reproduce 186.05 and 4,484.49); Tally masters or trial balance as at 1 April 2025 for Satkaarika; the notes' schedules of the audited statements; a retest of the corrected build.
From you: NDA and data terms; India hosting decision; whether Tally and Zoho posting stays switched off for the QC offering.

## 7. Decisions of 20 Nov 2026, and what is built since this plan

**Decisions:** (1) client data (database and storage) is hosted in India, and AI is used as usual with its existing providers; the NDA and data terms are handled separately. (2) Posting to Tally and Zoho stays OFF for the QC module.

**Built and tested** (each with unit tests; the Day Book items also pass the real-file gate on Satkaarika and SSSL):
- Posting off: a server-side switch (`PRACTICE_TALLY_POSTING`, off unless set to `on`) refuses approvals and ledger creation and gives the connector nothing; the writing screen is hidden and says so. Zoho posting is off while `ZOHO_POSTING_FIRMS` is empty.
- An OPTIONAL India-only AI switch (`PRACTICE_DATA_RESIDENCY=india`), left unset: AI works as usual. Moving the database and storage to an India region is an owner action: see `docs/INDIA_HOSTING.md`.
- RC-6 post-match proof on every reconciliation, and the determinism test.
- Review checks on the Day Book, in the client's Close tab: cash day by day with 40A(3) and 269ST party-day lists; adjustment entries register (year-end, month-end with another flag, round sums, narration words, owner or suspense ledgers, reversed next period, large entries; routine set-off and RCM tagged); ledger map suggestions by family, rate, tax head and year in the name; near-duplicate ledgers. Real result: all 4,290 Satkaarika and 10,724 SSSL vouchers read and balance; the Satkaarika register is 434 of 2,297 journals (a short list, not all of them); the duplicate check finds the blueprint's own "18% SUB CONTRACTOR SERVICES" against "18% SUBCONTRACTOR SERVICESS".
- Excel working papers with a header block, live formulas (closing balance, differences, running totals) and control-total rows, for cash, adjustments, ledger map and the GST year view. A test reads each file back and checks the formulas.
- GST year view (Returns check, when GSTR-1, 2B and 3B year files are dropped): by month and running total for outward tax and input credit. Outward ties to the year exactly on the real files. The input credit loop is labelled provisional until its definition is agreed with the CA.

**Still not built** (in plan order): confirming and storing the ledger map and party master per client; GST open-item carry-forward store and IMS status; set-off against table 6.1 and the credit and cash ledger loops; RCM tested from the books by ledger; ledger-level opening balances and multi-year trial balance; TDS working and 26AS; 43B(h); fixed assets; ageing screen; audit log of reads and exports; period lock; India-region database migration.

**Known limits of what is built:** cash needs an opening balance to be exact (it counts from nil unless one is entered); the 40A(3) and 269ST lists are for the CA to judge, not findings; the ledger map is a suggestion until confirmed; the ITC year difference of IGST +₹186.05 and CGST/SGST −₹4,484.49 is not yet reproduced.

## 8. Update: the items listed as "not built" after section 7

Built and tested (the GST loops on the real Satkaarika files):
- **Set-off entry against GSTR-3B table 6.1**: payable by head, credit used, cash paid, and the use of credit by head. Real result: 11 of 12 months agree, including the blueprint's worked example (journal 1286, December). One real finding: in November the set-off journal leaves out the IGST liability of ₹16,341 that table 6.1 shows. A month with no set-off journal is reported as such. A credit note is not mistaken for a set-off entry.
- **Reverse charge loop from the books**, by ledger: liability booked, cash paid, credit booked, and the return (3.1(d) and 4A(3)). Real result: 9 of 12 months agree; April differs by ₹6,322 (March's liability paid in April, a timing item the year view clears), October by ₹1.60 (rounding), and March by ₹1,14,878 in credit booked against 4A(3), which the CA should look at.
- **Ledger map confirmation**: suggestions, edit by family, "Confirm these ledgers" (partner or manager), stored per client and re-used.
- **Audit log** of reads, downloads and exports (documents opened or downloaded, working papers exported, the ledger map read or confirmed), and a **period lock** that records a fingerprint of every document and calls the lock stale when one is changed, added or removed.
- All four need one SQL file run once: `supabase/migrations/20261120100000_ledger_map_party_audit_lock.sql`. Until it is run the screens say so and the checks that do not need it still work.

Not built, and why (each needs a file or fact we do not have, so it cannot be built and proved yet):
- **Credit and cash ledger loops** need the portal's electronic credit ledger and cash ledger statements.
- **IMS status** needs the IMS download; the 2B Excel has no IMS column.
- **Ledger-level opening balances** need the audited notes' schedules (debtor and creditor lists) and the Tally masters or TB as at 1 April.
- **TDS working and 26AS** need the 26AS file and the party master (PAN, section) confirmed for the client.
- **43B(h)** needs Udyam status per supplier in the party master.
- **Fixed assets** need the asset register or the capital items with put-to-use dates.
- **Ageing screen**: the engine is built and proved; the screen waits for the opening balances, because without them most receipts show as on account.
- **Party master screen**: the table is created by the SQL above; the entry screen comes with TDS and 43B(h), because that is what fills it.

## 9. Update: Satkaarika FY 2025-26 data from the advisor (20 Nov 2026)

The advisor sent the FY 2025-26 Tally Trial Balance and ledger masters, a new Day Book, and the portal reports (ITC 3B vs 2B, ITC claimed and utilised, challans and return filing status, credit and liability statement). The CA's order was: first GST set-off with the credit and cash ledgers, then opening balances. Built and proved on those files, in that order.

**1. Credit and cash ledgers** (Close of the GST page, third tab "Credit and cash ledgers"; code in `gst/ledgers.ts`)
- **ITC report**: read for 12 months; its own arithmetic is re-added (each month's difference is 3B − 2B, the total row is the sum of the months). Result on the real file: both hold, and the year shows IGST +₹186.05, CGST −₹4,484.49, SGST −₹4,484.49, exactly as the CA quoted. These are the report's figures: the 2A/2B data behind them is not in the files, so we do not claim to recompute them.
- **Credit ledger loop** (opening + claimed 4(C) − utilised 6.1 against the Tally input-credit ledgers, found by name): built. On the real files it does **not** close, and says so: Tally's input ledgers are named inconsistently ("Input IGST CF", "INPUT CGST CF 2025-26", "Input Sgst CF 26-27") and "Input IGST CF" carries ₹21.6 lakh of movement that the portal's claims do not explain. This is a finding for the CA, not something to smooth. The loop also lists every Tally ledger it counted, so the CA can correct the choice. The portal's opening credit ledger balance is not on file, so Tally's opening is used and the screen says so.
- **Cash ledger loop**: a challan is a deposit into the cash ledger and a return draws it down, so the proof is a running balance (deposits PAID − cash used by each return, including RCM, which is always cash). Real result: April, May and June returns tested, balance never negative; a deposit of ₹1,909,607 against ₹1,909,278 used in May's return (₹329 for interest or fees). The challan report ends in July and the filing status in September, so the later returns are listed as **untested**, not counted as nil.
- **Challans against the books**: the tax-payment ledger is found from the data (the ledger debited in Payment vouchers whose amounts equal challan totals) and each PAID challan is matched by date and amount. Real result: all 8 PAID challans are payments in "GST (CGST+SGST+IGST)"; no PAID challan without a payment, no payment without a PAID challan; 11 later payments fall after the report and are counted, not tested.
- **Flags**: failed, expired and "awaiting bank confirmation" challans are listed with CPIN and amount (real: 1 failed ₹6,720, 2 expired ₹25,086, 1 awaiting ₹28,033); a return not filed or missing from the filing report is listed.

**2. Opening balances** (Close tab, "Opening balances against last year's audit"; code in `review/trialBalance.ts`)
- **Trial Balance and masters reader**: 439 ledgers with group and primary group, opening, movement and closing; 1,198 masters with GSTIN, PAN, state, registration type and bill-wise flag (32 bill-wise). The export leaves the closing columns and Total rows blank, so closing is worked out as opening + movement.
- **Integrity**: opening Dr − Cr is ₹0.42 and it is **the same ₹0.42 Tally quotes** in the note (reproduced, not trusted); movement balances; the difference carries to closing. Masters and Trial Balance open identically for all 439 ledgers.
- **Findings the group comparison cannot show**: ledgers named for an old year that still carry a balance (e.g. a 2021-22 TDS receivable of ₹1,01,827), creditors that open with a debit (advances) and debtors that open with a credit, and the Profit & Loss A/c balance.
- **Group comparison with the audited balance sheet** now uses the Trial Balance's primary groups and the CA's ₹500 tolerance. It compares against the signed FY 2024-25 audited Balance Sheet (dropped as a PDF, proved first). Not re-run on the new Trial Balance in this batch: the audited PDF from the earlier batch was for a different period, so the ledger-level tie to the audited notes still waits for the notes and schedules.

**3. Day Book**: the new 6-column export ("Debit Amount", "Credit Amount") is read; 4,362 vouchers, all balance. The old copy (4,290) missed 72 vouchers of types "B 2 B Service" and "Sub Contract Services"; the real-file gate baseline is updated, and the reconciliation counts did not change with the new copy (Satkaarika 43/42/1 and 44/44).

**Tests**: `gst-ledgers.test.ts` (17) and `trial-balance.test.ts` (8) on synthetic fixtures; `real-fy2526.test.ts` (8, runs with `REAL_FY2526=<folder>`) holds no client figures, only structure, counts and relations the product must reproduce.

**Still blocked on files or facts** (unchanged): IMS download; the portal's electronic credit and cash ledger statements for the year (opening balances, interest and fees); the full-year challan report (it stops in July); audited notes and schedules; asset register; Udyam status per supplier; the related-party list; advance tax and self-assessment challans; interest certificates and repayment schedules.

**10. Built after that (same files): TDS against 26AS, the ageing screen, the party master** (Close tab, "Year-end reviews"; code in `tax/tds.ts`, `review/ageingReport.ts`, `review/partyMaster.ts`)
- **26AS**: read by code from the PDF text (8 deductors, 171 transactions on the real file). Each deductor's lines are re-added against its own header and the headers against each other (all hold); deposited = deducted; every line must be in Final status.
- **Books against 26AS**: debits to the TDS-receivable ledgers in the year, by section (taken from the ledger name: "94-C", "94 A", "194-Q") and by deductor (books parties matched by shared significant words, one letter off allowed, e.g. Virajit/Virajith; shown as a suggestion with the parties named). Real result: 194A agrees (₹1,48,150); **194C books ₹32,62,315 against 26AS ₹25,11,403 (books higher by ₹7,50,912)**; 194Q books ₹33,429 against ₹4,949. Books above 26AS is credit that cannot be claimed until the deductor's statement shows it. By deductor: Virajit and the Hyderabad Eye Institute, GMR and V North agree; Malkhed books ₹9,10,320 against ₹8,41,140; Sri Gopal Automotive books ₹17,99,381 against ₹15,16,534. The ten TDS-receivable ledgers also show credits in the year (opening balances cleared), listed.
- **Ageing**: debtors and creditors from the Trial Balance openings and the Day Book postings, first in first out, from the invoice date, or from the due date when a credit period is entered. Every party's opening + postings is proved against the Trial Balance closing: all 14 debtors and 87 creditors with a balance tie to the paisa. The Day Book export has no bill references, so bill-wise parties (32 in the masters) are flagged for a check against Tally's bill-wise outstanding; opening balances are aged from 1 April.
- **Party master**: filled from the masters: GSTIN, PAN (from the GSTIN when the master has none), state, aliases for ledgers that share a GSTIN, a PAN that disagrees with its GSTIN flagged, parties with neither flagged. Real result: 655 parties, **only 45 with a GSTIN and 262 with a PAN; 393 have neither** (so 2B matching and TDS cannot be tested for them until the CA supplies them), 30 bill-wise, 9 groups of ledgers sharing one GSTIN. Saves identity fields only; credit days, Udyam and related-party flags are for the CA. Needs the SQL migration already listed above.

**Still not built, and why**: TDS **payable** against challans (no TDS challan or 26Q file yet); 43B(h) (Udyam per supplier); fixed assets (asset register); the ledger-level tie to audited notes (notes not on file).
