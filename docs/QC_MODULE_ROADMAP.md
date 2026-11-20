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
