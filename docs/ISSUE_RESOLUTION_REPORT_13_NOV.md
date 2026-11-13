# FynHelp issue-resolution report, 13 Nov 2026

Covers the tester's reports of 12-13 Nov: the Tally final report, the first SBI/Excel test (The Moon), the four-client raw-statement test, the Zoho Books test report, and the Automated Close checklist.

## How to read the status words

This report lists a fix as **Tested** only when a test passed. It never says "works on the live site", because nothing here has been run on the live site yet.

| Status | Meaning |
| --- | --- |
| **Tested** | An automated test passes, or the fix was run on the tester's real files and the result checked against the bank's own numbers. |
| **Built, needs a live test** | The code is written and builds, but proving it needs something I do not have here: a running TallyPrime, a Zoho Books organisation, or the deployed site. |
| **Not done** | Not built, or not possible yet. The reason is given. |

Checks run on the branch: 1,103 of 1,104 unit tests pass, the production build passes, and TypeScript shows only the 2 errors that were there before. The one failing test (`touch-whatsapp`, template check) fails the same way on main without these changes.

## 1. Bank statements as downloaded from the bank (four-client test, 10 PDFs)

A new reader (`extract/pdfTable.ts`) reads each page by where the text sits: a transaction starts at a date, each amount comes from its own column, wrapped narration is joined, and the running balance proves whether each line is money in or out. It also reads every page (the old reader stopped at page 40; the ICICI files have up to 183 pages).

Result on the real files. "Direction confirmed" is the share of lines whose in/out the running balance proved. "Net movement" compares the sum of the lines with the statement's own closing minus opening balance.

| File | Lines read | Direction confirmed | Net movement vs statement | FynHelp's balance check |
| --- | --- | --- | --- | --- |
| HDFC CA | 161 | 99.4% | matches to the paisa | Passes: 0 breaks. Notes a 28-day quiet stretch. |
| ICICI CA Apr-Jun | 1,464 | 99.9% | matches | Pass: correct and complete |
| ICICI CA Jul-Sep | 1,461 | 99.9% | matches | Pass: correct and complete |
| ICICI CA Oct-Dec | 1,292 | 99.8% | does not match: ₹62,04,424.96 | **Fail: 1 break** at 16 Dec 2025 |
| ICICI CA Jan-Mar | 1,610 | 99.9% | matches | Pass: correct and complete |
| SBI CA | 179 | 99.4% | matches | Passes: 0 breaks. Notes no lines in June 2025. |
| SBI OD | 110 | 99.1% | matches | Passes: 0 breaks, overdraft balances read as negative |
| Union Bank CA | 836 | 99.9% | matches | Passes: 0 breaks. Notes a 27-day quiet stretch. |

The four ICICI files total 5,827 lines, in line with the tester's "about 5,800".

**Tested: yes** (8 of 8 files read; 7 pass the balance check; plus 7 unit tests on made-up statements in the three layouts, `pdf-table.test.ts`).

**End-to-end upload test (added after the first version of this report).** `upload-e2e-pdf.test.ts` runs the real server code (`processExtraction`) on a PDF in an in-memory database: stored file → read → statement check → owner check → filed lines. It passes on a made-up 60-page statement (1,200 lines, every amount, direction and balance equal to the source; balance check passes; re-reading files no second copy; a statement for another client is held with both names in the message). Run on the tester's 8 real statements the same way, all 8 are read and filed, none is held, and the line counts filed equal the lines read (HDFC 161, ICICI 1,464 / 1,461 / 1,292 / 1,610, SBI CA 179, SBI OD 110, Union Bank 836).

That run found one more problem, now fixed: two lines that look identical in one statement (same date, amount and narration) were sent to the review queue as duplicates, 3 per ICICI quarter, 11 on SBI CA and 4 on SBI OD, even though the running balance moved each time. A repeat with a different balance is now filed as a real second transaction; a repeat with the same balance is still sent to review.

Still unproven: a real upload in the deployed app (the browser, storage bucket and the live database). The test uses an in-memory database.

What still needs a person:
- **ICICI Oct-Dec has one real break.** At line 1,100 (16 Dec 2025) the balance printed in the PDF is ₹18,97,787.52 where the lines before it give ₹81,02,212.48, a gap of ₹62,04,424.96. The reader found no missing serial number before that line, so the PDF's own balance column is the likely cause. The check correctly flags it and no file is accepted silently. Check that page of the PDF.
- **SBI CA: no lines in June 2025.** The PDF text has no June dates and the balance carries across unbroken, so nothing is missing from the file. The tester believed June had transactions; ask whether the statement was downloaded in full.
- **Indian Bank (2 accounts) was not provided to me**, so it is untested. **Jajula John (Excel) is password-protected**, and I do not have the password, so it is untested. Both should be retested by the tester after deploy.

### Each observation from the four-client report

| # | Observation | Status |
| --- | --- | --- |
| 1 | Only 1 of 10 statements read correctly | **Tested.** 8 of the 8 files I had now read. |
| 2 | ICICI not read at all ("AI reader is not configured") | **Tested.** Read by position with no AI. The page cap of 40 is lifted to 600. |
| 3 | Many balance breaks and large unaccounted amounts (SBI 14, HDFC 19, Union 32) | **Tested.** Now 0 breaks on all three, and the net movement matches the statement. The one remaining break is the ICICI Oct-Dec case above. |
| 4 | SBI says June and August have no lines; SBI OD says no balance column; Indian Bank opening ₹5.28 L | **Tested for SBI and SBI OD.** August is read (14 lines); June genuinely has none in the file. The balance column is found, with DR as negative. Indian Bank: **not tested**, file not provided. |
| 5 | "The statement is for Tritiksha Gold & Diamonds, not ." and every statement held | **Tested.** The check compared two different ids (the client record id and the business id), so the client name came out blank and every file looked like another client's. Both now use the business id. |
| 6 | The balance check itself worked well | Kept. |

Suggestions: (1) PDF layouts for SBI, HDFC, ICICI, Union Bank: **done** by the position reader, which needs no per-bank layout. (2) Fix the blank client-name check: **done**. (3) Show the number of lines read on held files: **done** ("Lines read from the file: N. Compare with the bank's own count" on the statement check card; not seen on screen yet, so **built, needs a live test**).

## 2. First test: SBI Excel statements and the books workbook (The Moon)

| # | Observation | Status |
| --- | --- | --- |
| 1 | SBI Excel statements read as 0 or 18 of 292 lines (table split across sheets, header only on the first) | **Tested** on a statement built from the description (`sheets-choose.test.ts`): sheets are joined into one statement. Not run on the tester's own files. |
| 2 | The wrong sheet read (TDS challans instead of Bank Book) | **Tested** with the same fixtures, in either sheet order. |
| 3 | Worked after converting to CSV | Not needed any more. |
| 5 | 31 false "Duplicate suspect" on UPI receipts with unique UPI references | **Tested** (`recon-upi-ref.test.ts`): a new first stage matches on the 12-digit UPI/IMPS reference or the NEFT/RTGS UTR found in the narration, when it points to one entry on each side. Not run on the tester's 3,090 lines. |
| Suggestion 3 | Let the user choose the sheet | **Built, needs a live test.** A "Sheet to read" box appears on any Excel file with several sheets. |

## 3. Zoho Books test report (12 bugs)

| # | Bug | Priority | Status |
| --- | --- | --- | --- |
| 1 | A month pulled again is not applied (deleted entry stays) | High | **Built, needs a live test.** A Zoho pull now removes the month's old lines first, as the Tally pull already did, and reopens any bank line that was matched to a removed entry. The shared function is covered by existing tests; no Zoho-specific test yet. |
| 2 | Receivables and Payables aging ignore Zoho | High | **Tested** (`zoho-aging.test.ts`): when FynHelp's own ledger is empty and the client is linked to Zoho, open invoices and bills fill the aging reports. Invoice date is not available from Zoho's list, so "date" is blank. |
| 3 | No way to post into Zoho (read-only consent) | High | **Not done.** Posting already exists in the code behind the `ZOHO_POSTING_FIRMS` switch and Zoho's separate write consent, but it is off for the demo account. I did not switch it on. The approve panel for a Zoho client now says where to post. |
| 4 | Export CSV posts to the wrong account | High | **Tested** (`zoho-export-fixes.test.ts`): "Paid Through" and "Deposit To" now carry the linked Zoho bank account, and bank charges and tax payments have no vendor. **Not fixed:** Zoho's importer asked for "Expense Date" and "Amount" to be mapped by hand. I could not confirm Zoho's own template column names without a Zoho account, so the names are unchanged. Download Zoho's sample file and I will match it. |
| 5 | Two book sources doubled silently | Medium | **Built, needs a live test.** A warning now shows on the approve panel when a client is linked to both Tally and Zoho. It does not yet let you choose one source per month. |
| 6 | Expenses labelled "Tax Payable" | Medium | **Not done.** The label comes from the offset account Zoho returns. I need one sample response from Zoho's transactions API to read the expense account name correctly. |
| 7 | Client page says nothing is connected | Medium | **Built, needs a live test.** The client page now lists the Zoho account and last pull, and the Tally company, and drops the "No source connected" line when either exists. |
| 8 | Stale panel text ("Post to Tally" for a Zoho-only client) | Medium | **Built, needs a live test.** A Zoho-only client now gets a Zoho note instead of the Tally panel. |
| 9 | Counts disagree ("6 entries" vs "7 duplicates skipped") | Low | Follows from bug 1. **Built, needs a live test.** |
| 10 | MIS ignores Zoho | Low | **Partly done.** Aging uses Zoho (bug 2). The monthly MIS "owed" block is **not done**. |
| 11 | After consent the page opens Settings > General | Low | **Built, needs a live test.** Now returns to Settings > Integrations. |
| 12 | Not in the Zoho Marketplace | Low | **Not done.** Not a code change. |

## 4. Tally final report (13 Nov)

Fixed and merged earlier in [PR #98](https://github.com/prajwal245/fynny2.0/pull/98) and the PRs before it: reversed payments and the missing party (empty bank-allocation lists), cash-only vouchers left out of recon, the "look in Tally before writing" check and forced month fetch (connector 1.5.1), a statement of another client held, bank ledger default, sorting on every table, and the "Loading CA portal…" hang. These are **tested in unit tests**; the connector items are **Built, needs a live test** because only a running TallyPrime can prove them.

Not done from that report: the "pages left" explanation on approval (#18), the small items (#19), the "Books as of" strip and the month strip.

## 5. Automated Close checklist: where each item stands

"Tested" below means a unit test, never the "Done looks like" test on the live site, which the checklist requires before you tick a box. So no box on the checklist should be ticked from this report.

| ID | Feature | Status |
| --- | --- | --- |
| A1 | Every sync replaces the month | Tally: **Tested**. Zoho: **Built, needs a live test**. "Books as of" time: **Not done**. |
| A2 | Correct sign on FynHelp's own postings | **Tested** (reversed-payment cause fixed). Live proof needs Tally. |
| A3 | One books system per client per month | **Partly done.** Warning only (see Zoho bug 5). Choosing a source: **Not done**. |
| A4 | One consistent link state | **Partly done.** Client page now shows the link (Zoho bug 7). A single status shown everywhere: **Not done**. |
| A5 | Safe defaults | **Partly done.** Wrong-client hold fixed and tested; bank ledger default and Paid Through done. Picking the ledger from the account number: **Not done**. |
| B1 | Check Tally before writing | **Built, needs a live test** (connector 1.5.1). |
| B2 | Auto-confirm after posting | **Not done.** |
| B3 | Post to Zoho with read-back | **Not done** (see Zoho bug 3). |
| B4 | Complete export files | **Partly done.** Zoho CSV fixed as above; Tally file has a voucher id and Contra for cash. Zoho column names unconfirmed. |
| C1 | Scheduled Zoho pulls | **Not done.** |
| C2 | Tally watches all open months | **Built, needs a live test** (forced fetch). |
| C3 | Statements arrive by themselves | **Not done** here (Gmail intake exists and is unchanged). |
| C4 | Ledgers learned from approvals | **Not done.** |
| C5 | Connector health and alerts | **Partly done.** "Online, but Tally is not ready" shown; alerts **Not done**. |
| D1 | Recon runs after every sync | **Not done.** |
| D2 | Bank recon uses bank lines only | **Tested** (invoice rows ignored on the books side). |
| D3 | Aging, cash and MIS from connected books | **Partly done.** Aging from Zoho **Tested**; cash position and MIS **Not done**. |
| D4 | MIS drafted automatically | **Not done.** |
| D5 | Sign-off locks the month | **Not done.** |
| E1 | Firm-wide ready-to-sign board | **Not done.** |
| E2 | Screens match what the product does | **Partly done.** Stale Tally/Zoho texts fixed; a full sweep **Not done**. |
| E3 | Pages open in under 3 seconds | **Partly done.** The "Loading CA portal…" screen can no longer wait forever (8 s lookup limit with one retry, 12 s stop). The 3-second target is **not measured**. |
| E4 | One real client month (500+ lines) closed end to end | **Not done.** The ICICI quarters (1,300-1,600 lines each) read correctly, which is the first step. The close itself has not been run. |

Gate for saying "automated month-end close": not met. P0 and P1 are not all done, and E4 has not been passed on a real client.

## 6. Before the tester retests

1. Merge [PR #100](https://github.com/prajwal245/fynny2.0/pull/100). It needs no database migration.
2. The Tally PC still needs connector 1.5.1 and the new setup file from the earlier deploy.
3. Ask the tester to retest the same 11 statements and send the exact message shown for any file that is still held, plus the Indian Bank and Jajula John files (with the password through the unlock box).
4. Send one real response from Zoho's transactions API and Zoho's own sample expense file, so the "Tax Payable" label and the column names can be fixed on evidence.
