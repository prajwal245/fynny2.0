# Pilot design: bank statement to Tally for Prime Tech Associate (Tripura)

Status: **draft for review, written without the meeting transcript.** Every customer detail below is therefore *unknown* until the transcript is supplied. No web research was done this session (the search was stopped by the user), so Tally platform statements are marked **[unverified, check official Tally docs]**; nothing here is cited as a primary source.

Labels used: **CONFIRMED** (seen in our code or docs today) / **DEMO-ONLY** (claimed, not verified) / **BUILD** (needs implementation) / **BLOCKED** (needs customer or Tally clarification).

## 1. Executive summary
- Our product today **reads from Tally and does not write to it.** The connector exports the Day Book over Tally's local XML port and sends it out; "Tally is only read" (docs/TALLY_CONNECTOR.md, connector file lines 58 and 71 are `Export` requests only). So "two-way sync" and "creates ledgers in Tally" are **not true today**. Posting exists only for Zoho Books, one approved entry at a time, for two entry types.
- What we **can** already do for this pilot: read a bank statement (Excel, PDF with text layer, photo via OCR), read a Tally Day Book, match the two, and put the leftovers in a review queue with reasons including "duplicate suspect".
- What the customer asked that we **cannot** do today: categorise a statement line to a **Tally ledger**, import approved entries **into** Tally, and create missing ledgers.
- Safest pilot: **phase 1 is read-only and produces a Tally-ready import file for a human to import** (no live write). Live write-back is phase 2, behind per-entry approval.
- Biggest unknown: whether the "Tally data file" the customer offered is a Day Book export (usable) or the raw Tally data folder (not readable by us).

## 2. Requirements brief and known / unknown / assumed
| Item | Status | Note |
|---|---|---|
| Bank statements arrive as Excel or PDF | Known from the brief | Exact banks and password use unknown |
| Categorise using existing ledgers | BUILD | Needs the ledger list from Tally; we read only the Day Book today |
| Skip transactions already in Tally | CONFIRMED in part | Recon matches bank to Day Book and flags `duplicate_suspect`; no pre-import check against a live company |
| Flag uncertain / unmatched / new-ledger lines for the team | Partly CONFIRMED | Exceptions queue exists; "new ledger needed" reason does not |
| Team approves before posting | CONFIRMED for Zoho pattern; BUILD for Tally | |
| Monthly plan first, annual later | Commercial | Needs a plan decision, not engineering |
| Tally version and setup (Prime or ERP 9, single PC, server, Tally on Cloud) | UNKNOWN | Decides the connector route |
| Tally offline during work | BLOCKED | Customer raised it; see section 4 |
| Saturday evening follow-up | UNKNOWN | Do not treat as scheduled until the transcript or calendar gives a date and time |
| Pricing quoted in the call | UNKNOWN | Not in the brief |

Inconsistencies to resolve with the transcript (not resolved here): the demo said two-way sync and ledger creation while the customer later worried about offline Tally and duplicates; the summary says "Tally data file" without saying which kind.

## 3. What our product does today (inspected)
- **Tally read**: `public/downloads/fynhelp-tally-connector.mjs` (Node 18+) polls Tally on port 9000, checks in every 2 minutes, sends Day Book per month hourly or on demand. CONFIRMED. Not covered: installer, Tally on Cloud where the port is unreachable, ledgers/stock/GST masters.
- **Statement and Day Book parsing**: `src/lib/practice/extract/` handles Excel, PDF text, Tally XML (`tally.ts`), password-protected PDFs and unreadable Excel with clear messages (`PdfPasswordError`, "may be password protected or damaged"). CONFIRMED.
- **Idempotency**: uploads are de-duplicated by content hash (`documents.server.ts`); each transaction has a `dedupe_key` built from business, side, date, direction, amount and reference (or the first 80 characters of the narration when there is no reference) (`core.ts`). CONFIRMED.
- **Matching**: `recon/engine.ts` does amount and date tolerance, name and reference scoring, and raises `duplicate_suspect`. CONFIRMED.
- **Approval-first posting** pattern: `zohoPosting.ts` and `zoho.server.ts` preview an entry, require a partner's approval, post one at a time, and record `approved_by`. CONFIRMED for Zoho; reusable as a design, not as code for Tally.
- **No Tally write path, no ledger list, no ledger suggestion, no voucher builder**: BUILD.

## 4. Tally integration facts (all unverified this session)
Treat as hypotheses to confirm against Tally's official documentation before promising anything.
1. Tally exposes an XML request/response interface over HTTP when its client/server setting is enabled; our connector uses it today for export. [unverified for current version behaviour]
2. The same interface is generally used to **import** vouchers and masters (a `Import Data` request). [unverified]
3. Whether an import skips an entry that already exists depends on how the voucher is identified; do not rely on Tally to prevent duplicates. [unverified]
4. A voucher that names a ledger that does not exist is generally rejected or handled per Tally's import settings. [unverified]
5. A live import needs Tally **running with the company open and the port reachable**. If Tally is closed, a live write is impossible. A manual route exists: produce an import file and let the accountant import it inside Tally when Tally is open. [unverified]
6. Raw Tally data folders are proprietary; we should ask for a **Day Book and Ledger list export (XML or Excel)**, not the data folder.

Implication of offline Tally: reading the last synced Day Book still works (we hold a copy), but the copy goes stale, so duplicate checks may miss entries made since the last sync. Posting must queue and show "waiting for Tally" rather than failing silently.

## 5. Target pilot architecture
1. **Intake**: customer uploads or sends by WhatsApp/email; hash de-duplicates; stored in the firm's tenant (existing). 
2. **Parse**: existing extract pipeline; password or malformed files go to a "needs action" state with a plain message (existing).
3. **Books snapshot**: connector sends Day Book (existing) **plus ledger names** (BUILD: extend export to the ledger collection).
4. **Normalise and match**: existing recon; add a **ledger suggestion step** (BUILD): history of this party, narration keywords, firm rules. Output per line: matched / suggest existing ledger (with confidence and reason) / needs new ledger / uncertain.
5. **Review queue**: partner or senior sees each proposed voucher with evidence; actions: approve, change ledger, reject, hold. A **new ledger is never created without a separate explicit approval** (BUILD).
6. **Output, phase 1 (MVP)**: approved entries go into a **downloadable Tally-importable file** plus a CSV; the accountant imports in Tally. FynHelp records what was exported. No live write.
7. **Output, phase 2**: live posting through the connector, one entry at a time, with a post-write read-back to confirm the voucher exists, then mark posted.
8. **Audit**: who approved, when, original line, chosen ledger, export or post id. Every rerun is safe because posting is keyed on `dedupe_key` plus an export batch id.
9. **Notifications**: team alert for new exceptions and for Tally unreachable (reuse WhatsApp/email touchpoints).
10. **Access, privacy, retention**: existing tenant separation and roles; agree retention and backup of statements with the customer (UNKNOWN).

### Definition of "duplicate"
- **Already in Tally**: same direction and amount, date within a tolerance the accountant sets, and either same reference/cheque/UTR or party/narration similarity above a threshold. Shown as "likely already booked", never auto-dropped without the reviewer's visibility in the pilot.
- **Repeat upload**: same file content hash, or overlapping date range for the same account (flag, do not drop).
- **Legitimate lookalikes** (two equal payments same day) must not be merged: when references differ or are absent, keep both and flag for review.
- **Double posting**: prevented by an export/post batch id stored per approved line; a line cannot be exported twice unless the reviewer resets it.

### Decisions for the customer's accountant
Ledger naming rules, date and amount tolerances, which narrations map to which ledgers, treatment of bank charges, reversals and bounced cheques, who may approve a new ledger, and voucher types used (payment, receipt, contra, journal).

## 6. Process flow
| # | Step | Input | Output | Owner | Failure path |
|---|---|---|---|---|---|
| 1 | Receive statement | Excel/PDF | Stored file, hash | Customer/FynHelp | Duplicate hash: link to earlier; unreadable: ask for another copy |
| 2 | Parse | File | Structured lines | FynHelp | Password/damaged: "needs action" message |
| 3 | Sync Tally | Day Book, ledger list | Books snapshot | Connector | Tally offline: use last snapshot, mark stale, alert |
| 4 | Match | Lines + books | Matched / exceptions | FynHelp | Low confidence: exception with reason |
| 5 | Suggest ledger | Unmatched lines | Suggested ledger or "new" | FynHelp | None: "uncertain" |
| 6 | Review | Proposed entries | Approved / rejected / held | Customer's team | Rejected: stays out, reason kept |
| 7 | New ledger approval | Name, group | Approved ledger request | Senior accountant | Rejected: line stays held |
| 8 | Output | Approved entries | Tally import file (phase 1) or live post (phase 2) | FynHelp / accountant | Post interrupted: retry from batch id, read-back before retry |
| 9 | Confirm | Re-sync Day Book | Lines marked posted | FynHelp | Not found: flag for review |

## 7. Implementation plan (estimates, not commitments)
**MVP (about 3 to 5 weeks, estimate)**: ledger list sync; ledger suggestion with confidence; review queue with approve/reject/change ledger; Tally-importable file export; export batch ids; audit log; stale-snapshot banner.
**Phase 2 (about 3 to 6 weeks, estimate)**: live write-back with read-back verification; new-ledger request flow; automatic re-sync after posting.
**Later**: Windows installer for the connector, Tally on Cloud support, rule learning from approvals, bulk approve for high-confidence lines.
**Dependencies**: sample Day Book and ledger list from the customer, Tally version, accountant's rules.
**Risks**: Tally import behaviour differs by version; unclear duplicate criteria; connector not installed or Tally closed; Tripura firm's statements in unusual bank formats.

## 8. Test plan (with the customer's files)
Exact duplicate of a booked entry; partial match (amount same, date off by 1 to 3 days); amount off by a small bank charge; existing ledger; missing ledger; reversal and bounced cheque; ambiguous payee (two parties, similar names); two equal payments same day; repeat upload of the same file; overlapping date range; password-protected PDF; malformed Excel; Tally closed during sync; Tally closed during post; interrupted post halfway (retry must not double post); approval rejected; new-ledger approval rejected; import file imported twice into a test company.

## 9. Questions for the customer
1. Tally version (Prime or ERP 9) and where it runs (one PC, server, Tally on Cloud)?
2. Which companies and which period are in scope for the pilot?
3. Can you export the Day Book and the Ledger list for one party and send the same party's bank statement for the same period?
4. Bank names and statement formats, any password-protected PDFs?
5. How do you name ledgers and which voucher types do you use for bank entries?
6. What makes two entries a duplicate for you (amount, date window, reference)?
7. Who approves entries and who approves new ledgers?
8. Is Tally usually open when your team works, and can a PC stay on for the connector?
9. Which evening and date for the follow-up (to confirm from the transcript)?

## 10. Follow-up message (draft, edit names and dates)
> Hello, thank you for your time. To start your pilot we only need three things for one client:
> 1. The Day Book and Ledger list exported from Tally for one period (XML or Excel).
> 2. The bank statement for the same client and period (Excel or PDF; tell us if it is password protected).
> 3. Your Tally version and whether it runs on one PC, a server or Tally on Cloud.
> We will first show you how lines are matched and which ones need your decision. Nothing is posted to Tally without your team's approval. Please tell us a convenient evening for the next call.

## 11. Demo checklist and success criteria
Checklist: show the Day Book arriving; show a statement upload; show matched vs exception lines with reasons; show a duplicate flagged; show ledger suggestion and approval; show the export file and the audit trail; state clearly what is live and what is phase 2.
Pilot success criteria (to agree with the customer): share of lines correctly matched or suggested without edits (target to set after baseline); zero duplicate entries in Tally; zero entries without approval; time per statement versus their current manual time; all exceptions explained with a reason; no unexplained difference between statement closing balance and Tally.

## 12. Next steps
1. Share the transcript so the customer-specific rows above can be filled in or corrected.
2. Confirm the Tally integration facts in section 4 against official Tally documentation before we promise write-back.
3. Agree phase 1 (file export) with the customer.
