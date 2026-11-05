# Pilot design: bank statement to Tally for Prime Tech Associate (Tripura)

Status: **final draft v2**, built from the meeting notes (a Hindi summary, not the verbatim transcript) plus an inspection of our repository.
Limits of this document:
- **No web research was done**, so Tally platform behaviour below is marked **[unverified]** and must be checked against Tally's official documentation before we promise it. No primary sources are cited.
- Customer facts come from the summary only. Where the summary is unclear it is listed in section 3, not resolved.

Labels: **CONFIRMED** (seen in our code or docs) / **DEMO-ONLY** (said in the demo, not verified) / **BUILD** (needs implementation) / **BLOCKED** (needs customer or Tally clarification).

## 1. Executive summary
- **Customer:** Prime Tech Associate, a Tripura accounting firm serving 10 to 15 companies, found us on Facebook. They lose time and people on manual bank-statement entry into Tally.
- **They want:** statement (Excel or PDF) in; lines sorted **ledger-wise** automatically; entries already in Tally **not repeated**; and the **final approval with their team**. They start on a monthly plan and consider yearly after seeing results.
- **Today's product:**
  - It **reads** Tally (Day Book) through a local connector and matches it to the bank statement, with an exceptions queue.
  - It does **not** map lines to Tally ledgers, create ledgers, or write anything into Tally. The team said exactly this in the demo, so "two-way sync" is not available.
  - Zoho Books does have live cloud sync and approved one-at-a-time posting. That does not apply to this Tally customer.
- **Plan:**
  - **Phase 1 (trial, read-only):** ledger suggestions per line, a review queue, and a Tally-importable file the customer imports themselves after approval.
  - **Phase 2:** automated write into Tally through the connector, still only after each line is reviewed and approved, with verification and no double posting.
- **Candid risk:** the commitment "ledger-wise sorting in the trial account by tomorrow evening" is tight. A first version that suggests a ledger from the customer's own Day Book history is plausible in that time. Automated posting into Tally is not.

## 2. What the customer asked, with status
| # | Requirement (from the notes) | Status | Comment |
|---|---|---|---|
| 1 | Import bank statement (Excel, PDF) | CONFIRMED | Excel, text PDF and photos are read; password-protected or damaged files give a clear message |
| 2 | Lines sorted ledger-wise automatically | BUILD | Nothing maps a line to a Tally ledger today. Demo said "not available yet" |
| 3 | Do not import what is already in Tally | PARTLY | Recon matches bank to Day Book and flags `duplicate_suspect`; there is no check at the moment of import into a live company |
| 4 | Final approval by the customer's team | CONFIRMED as a pattern (Zoho) | BUILD for Tally |
| 5 | Write into Tally, after review and approval (your latest instruction) | BUILD (phase 2) | See section 5 |
| 6 | Create a new ledger | BUILD, separate approval | Never automatic |
| 7 | Tally on a local PC needs port open; our team sets up the connector | CONFIRMED | Connector reads port 9000; Tally must be running with a company open |
| 8 | GST portal | Out of scope | Not connected and the GST product is not launched, as stated in the demo |
| 9 | Monthly plan first, yearly later | Commercial decision taken | |

## 3. Known / unknown / assumed, and inconsistencies (not silently resolved)
| Item | Status |
|---|---|
| Customer's Tally version and setup (Prime or ERP 9; one PC, server or cloud) | UNKNOWN |
| Which of the 10 to 15 companies are in scope for the trial | UNKNOWN; assume one party first |
| Statement banks and formats, password PDFs | UNKNOWN |
| Customer's ledger naming and duplicate criteria | UNKNOWN; needs their accountant |
| Saturday follow-up date and time | UNKNOWN. Notes say "Saturday" only; confirm the date before treating it as scheduled |
| WhatsApp group exists and the customer will send Tally data plus a same-party statement | ASSUMED from the notes; owner Speaker 2 |

Inconsistencies to confirm:
1. **Trial length:** the notes say 30 days free; our current pricing page and home page say **14 days** (the pricing page also has a 30-day guided pilot at ₹4,999, credited to an annual plan). Decide which the customer is getting and put it in writing.
2. **Plan prices and limits:** the notes quote "₹2,000 per month ($20)", a growth plan at ₹5,000, "Essential 25 clients" and "Firm 30 clients with 4,500 documents". Our plan table shows Essential at 10 clients included (recommended for up to 25), Firm at 30 clients included at 50 documents per client, Scale at 75. Documents are counted per client, not pages. Check the pricing proposal against `src/lib/practice/billing/plans.ts` before sending.
3. **Yearly plan:** the notes say "2 months free (14 months)". Our pricing page says annual is 2 months free. Confirm whether "14 months" means 12 paid months plus 2 free, or pay for 10 and get 12.
4. **"Tally data file":** it is not clear whether this is a Day Book export or the raw Tally data folder. We can use a Day Book export (XML or Excel); we cannot read the raw data folder.
5. **Product name** is noted as "FinHealth (probably FinHelp)". The brand is FynHelp; use it in the proposal.
6. **Duplicate files:** the notes say a repeat file is not processed again. Confirmed in code (content hash), so each demo or test needs a fresh file or a fresh party.

## 4. Tally integration (all [unverified], confirm against Tally's official docs)
- Tally exposes an XML-over-HTTP interface when its client/server setting is on; our connector already uses it for export. [unverified for the customer's version]
- The same interface is generally used to import vouchers and masters. [unverified]
- Tally will not necessarily stop an entry that already exists; do not rely on it for duplicate prevention. [unverified]
- A voucher naming a ledger that does not exist may be rejected or handled per Tally settings. [unverified]
- **Live write needs Tally running with the company open and the port reachable.** If Tally is closed, writes must wait. There is a manual route with no live connection: we produce an import file and the accountant imports it in Tally when it is open. [unverified]
- Offline effect on duplicates: our copy of the Day Book goes stale, so a duplicate check can miss entries made since the last sync. We show "synced at ..." and mark stale copies.

## 5. Architecture
1. **Intake:** upload, WhatsApp or email; content hash blocks the same file twice (CONFIRMED).
2. **Parse:** existing extract pipeline; password and malformed files go to "needs action" with a plain message (CONFIRMED).
3. **Books snapshot:** connector sends the Day Book (CONFIRMED). The parser already keeps the party/ledger name from each voucher (`PARTYLEDGERNAME`), so a first ledger list can come from the Day Book itself. A proper ledger list export is BUILD.
4. **Match:** existing recon; flags matches and `duplicate_suspect` (CONFIRMED).
5. **Ledger suggestion (BUILD, MVP):** for each unmatched line, suggest a ledger from (a) the same party or reference in past vouchers, (b) narration keywords the firm has used, (c) firm rules. Output: suggested existing ledger with reason and confidence, "needs new ledger", or "uncertain". Never auto-confirm in the pilot.
6. **Review queue:** the team approves, changes the ledger, rejects or holds each line. A **new ledger** is a separate request with its own approval by a named senior person.
7. **Output, phase 1:** approved entries become a Tally-importable file plus CSV; the customer imports it. We record which lines went in which export batch.
8. **Output, phase 2 (automation after approval):** through the connector, one approved entry at a time, then read the voucher back from Tally and only then mark it posted. If Tally is closed or the write is interrupted, the line stays "approved, waiting" and is retried by batch id.
9. **Audit and safety:** who approved, when, original line, chosen ledger, batch id. Reruns are safe because a line cannot be exported or posted twice unless a reviewer resets it.
10. **Notifications:** team alert for new exceptions, Tally unreachable, and failed posts (existing email and WhatsApp touchpoints).
11. **Access and privacy:** existing tenant separation and roles; agree retention and backup with the customer (UNKNOWN). Their data stays inside their firm's tenant.

**Definition of duplicate**
- *Already in Tally:* same direction and amount, date within a tolerance the customer's accountant sets, and the same reference/cheque/UTR or a narration/party similarity above a set threshold. Shown to the reviewer as "likely already booked".
- *Repeat file:* same content hash is blocked; an overlapping date range for the same bank account is flagged, not dropped.
- *Legitimate lookalikes* (two equal payments on one day with different references) are kept and flagged, never merged.
- *Double posting:* prevented by the batch id on each approved line.

**Decisions for the customer's accountant:** ledger names and groups, narration-to-ledger rules, date and amount tolerance, treatment of bank charges, reversals and bounced cheques, voucher types, who approves new ledgers.

## 6. Process flow
| # | Step | Input | Output | Owner | Failure path |
|---|---|---|---|---|---|
| 1 | Get statement and Tally data | Excel/PDF, Day Book | Stored files | Customer, Speaker 2 chases | Duplicate file: link to earlier; unreadable: ask for another copy |
| 2 | Parse | Files | Structured lines | FynHelp | Password or damaged: "needs action" |
| 3 | Sync Tally | Day Book (and ledgers) | Books snapshot | Connector (our team sets up) | Tally offline: last snapshot, "stale" banner, alert |
| 4 | Match | Lines + books | Matched and exceptions | FynHelp | Low confidence: exception with reason |
| 5 | Suggest ledger | Unmatched lines | Suggestion or "new ledger" | FynHelp | None: "uncertain" |
| 6 | Review | Proposed entries | Approved, changed, rejected, held | Customer's team | Rejected: stays out; reason kept |
| 7 | New-ledger approval | Name, group | Approved request | Customer's senior accountant | Rejected: lines stay held |
| 8 | Export or post | Approved lines | Import file (phase 1) or live write (phase 2) | FynHelp, then customer | Interrupted: retry by batch id after read-back |
| 9 | Verify | Re-synced Day Book | Lines marked posted | FynHelp | Not found: flag for review |

## 7. Implementation plan (estimates, not commitments)
**Trial-ready by the promised date (tomorrow evening, as stated in the meeting):**
- Ledger suggestion per unmatched line using the customer's Day Book history, shown in the exceptions/review view.
- Ledger column in the export, so lines can be sorted ledger-wise.
- Clear label in the product: "suggested, needs your approval".
- This is the realistic scope for that deadline. Writing into Tally and creating ledgers are not.

**MVP (about 3 to 5 weeks, estimate):** ledger list export; confidence scoring; approve, change, reject and hold; Tally-importable file; batch ids; audit log; stale-snapshot banner.
**Phase 2 (about 3 to 6 weeks, estimate):** live write after approval with read-back; new-ledger request flow; automatic re-sync after posting; retry and "waiting for Tally" state.
**Later:** Windows installer for the connector, Tally on Cloud support, learning from approvals, bulk approve for high-confidence lines. The team also noted ledger workflow is a universal CA problem, so productise it for other firms.
**Dependencies:** Day Book and ledger list from the customer, Tally version, accountant's rules, Tally official documentation checked.
**Risks:** Tally behaviour varies by version; unclear duplicate criteria; connector not installed or Tally closed; unusual bank formats; promising dates before the transcript is verified.

## 8. Test plan (with the customer's party data)
Exact duplicate of a booked entry; same amount with date off by 1 to 3 days; small bank-charge difference; existing ledger; missing ledger; reversal and bounced cheque; ambiguous payee; two equal payments on the same day; repeat upload of the same file (expect blocked); overlapping date range; password-protected PDF; damaged Excel; Tally closed during sync; Tally closed during write; interrupted write (retry must not double post); approval rejected; new-ledger approval rejected; import file imported twice into a test company. Use a **new file or party for each demo run**, because repeated files are not re-processed.

## 9. Questions for the customer
1. Tally version (Prime or ERP 9) and where it runs (one PC, server, cloud)?
2. Which party and period for the first trial; which of the 10 to 15 companies later?
3. Can you send that party's Day Book and Ledger list (XML or Excel) and the same party's bank statement?
4. Banks and formats; any password-protected PDFs?
5. How do you name ledgers; which voucher types do you use for bank entries?
6. What makes two entries the same (amount, date window, reference)?
7. Who approves entries, and who approves a new ledger?
8. Is Tally open while your team works; can a PC stay on for the connector?
9. Which evening and date on Saturday for the follow-up?

## 10. Follow-up message (draft; edit date and name)
> Hello, thank you for your time yesterday. To start your trial we need only three things for one party:
> 1. The Day Book and Ledger list exported from Tally for one period (XML or Excel).
> 2. The bank statement for the same party and period (Excel or PDF; tell us if it has a password).
> 3. Your Tally version and whether it runs on one PC, a server or Tally on Cloud.
> We will show you how each line is matched, how a ledger is suggested, and which lines need your decision. Nothing goes into Tally without your team's approval. Does Saturday evening at [time] work for the follow-up?

## 11. Internal actions from the meeting (as noted)
| Owner | Action | Note |
|---|---|---|
| Prajwal Vakode | Create trial account today and send credentials | Confirm trial length (14 vs 30 days) first |
| Prajwal Vakode | Ledger-wise sorting in the trial by tomorrow evening and set up the full process | Deliver the suggestion-based version only (section 7) |
| Prajwal Vakode | Send monthly and yearly pricing proposal | Check against `billing/plans.ts` and the inconsistencies in section 3 |
| Prajwal Vakode | Saturday follow-up showing end-to-end automation | Show phase 1 live; present write-into-Tally as phase 2 unless it is actually built |
| Speaker 2 | WhatsApp group: Tally data plus same-party statement by tomorrow morning | |
| Speaker 2 | Schedule more demos from next week | Prepare demo account and fresh files in advance |
| Team | Outbound email volume 50 to 60 a day | Noted as the spam-risk limit |

## 12. Demo checklist and pilot success criteria
Demo checklist: demo account and a fresh file ready; Day Book arriving; statement upload; matched vs exception lines with reasons; a duplicate flagged; ledger suggestion and approval; the export file and audit trail; say clearly what is live today and what is phase 2.
Success criteria to agree with the customer: share of lines whose suggested ledger is accepted without edits (set a target after the first baseline); zero duplicate entries in Tally; zero entries without approval; time per statement against their current manual time; every exception has a reason; no unexplained difference between statement closing balance and Tally.
