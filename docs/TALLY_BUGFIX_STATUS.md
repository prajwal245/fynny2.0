# Tally integration: status of the 11 bugs from the 6 Nov 2026 test (TallyPrime 7.2)

Source: "Tally integration: bugs I found in FynHelp" (Adireddy Tarun). I cannot run TallyPrime here, so every fix is
written from the code and checked with fixtures and unit tests. **Each one still needs a retest on a real TallyPrime 7.2.**

| # | Bug | What changed | Checked how | Retest on real Tally |
|---|---|---|---|---|
| 1 | Live connector sends no books ("No Tally companies reported yet") | **One real cause found and fixed:** the site redirected `fynhelp.com` to `www` with a 301, which turns the connector's POST into a GET and drops its token, so a connector set to the address without "www" could not check in. API calls are no longer redirected, and the connector now says so if it ever meets a redirect. Also: a failed save of the companies is no longer swallowed (the reason shows as "Connector says: ..."), and the Day Book has a fallback (see "Day Book dates"). **Not proven to be the only cause**; the new messages name the failing step if it still happens. | Unit tests for the helpers | Yes: check-in, company list, months sent |
| 2 | XML upload fails ("No transactions were found") | A Tally XML with no vouchers (a Ledger report) now says so and tells the user to export Excel, or the Day Book as XML. Reading a Ledger XML is not built (no sample file). | Unit test | Send the XML that failed so a reader can be built |
| 3 | Junk rows can be confirmed (22 undated rows, Rs 1,42,34,776) | Undated amount lines in a Tally ledger (breakdowns, totals) are skipped at reading. "Confirm all" confirms only dated rows and says how many are undated; confirming an undated line is refused. | Unit tests | Re-upload the same Excel: expect no 22 undated rows |
| 4 | Only about 200 lines reach reconciliation | Cause found: the screen loaded at most 200 lines per file (and one page of 1,000 per batch). Now up to 2,000 per file, read in pages, and a notice when a file is longer ("Showing the first N of M lines. All are used for reconciliation."). Reconciliation itself always used every line. | Code reading; build | Kaveri's full-year ledger: expect to Dec |
| 5 | "Active" when nothing is arriving | Active only after books have arrived; otherwise "Connected, no data yet" with the next step. | Type check | Yes |
| 6 | Misleading "open a company" message | Wording now matches the real condition (Tally listed no companies; check Client/Server Both, port 9000, Alt+F3) and the last check-in time is shown. | Unit test of the connector | Yes |
| 7 | Possible wrong row count (50 vs 49) | **Not confirmed and not fixed.** Opening/closing balance and total lines were already skipped; more variants are now recognised (tests). The real cause needs the file. | Unit tests | Send the Nov file and the count from Tally |
| 8 | Day Book mixed into bank reconciliation | Sales, purchase, journal, credit/debit note vouchers with no bank or cash entry are left out of bank reconciliation; the activity log says how many. Receipts, payments and contras are always kept. | Unit tests | Yes |
| 9 | Trial balance and debtors ageing can't be read | Both are recognised at upload and rejected with a plain message saying what to export instead. They are not read. | Unit tests | Yes |
| 10 | Connector setup too technical | Windows setup (`fynhelp-connector-setup.cmd`): installs Node via winget if missing, asks for the token, tests, and starts the connector at sign-in. Also a single-file Windows program (`fynhelp-connector.exe`, no Node needed) built by the "Connector for Windows" workflow, which runs it on a real Windows machine and checks the setup script parses. The program is an artifact of that run: it is not published or linked from the site yet. | Built and run on Linux; Windows checked only by the workflow | Yes, on a clean Windows PC |
| 11 | Connector version mismatch | Header and code both say 1.2.0. | Test | n/a |

## Day Book dates (the "also test" note)
The Day Book is requested with dates the way Tally prints them (`1-Nov-2026`). If the answer covers only one day of the month,
the connector asks again with plain digits, and if that is still one day it asks day by day and joins the answers, so a month is
never half-read because of the date format. **Unverified against real Tally 7.2.**

## Two-way sync: what exists and what is proven
- Reading Tally into FynHelp: built; see the retest column above.
- Writing approved entries into Tally: built and off by default (`allowWrite`), only lines a partner or manager approved, one at a time;
  after a write the connector is asked to re-read the Day Book so Recon sees the new voucher. **Never run against a real Tally.**
  Treat it as unproven until a test company run passes (see TALLY_POSTING.md).

## Password-protected files
Locked PDFs and locked Excel (.xlsx) files now show a password box in the document panel (and a "Password needed" badge and a
prompt on the Documents page). The password is used once, in memory, and not stored or logged; tries are limited to 12 an hour per file.
Checked with real locked files (no password, wrong password, right password). Old locked .xls files and locked CSV/zip are not covered.

---

# Retest of 6 Nov 2026 (combined status): what was fixed, what is not

Every fix below is covered by unit tests built from the retest's own symptoms. **None has been run against a real TallyPrime or the live site**: please retest with the same files.

| Retest bug | Result | What changed |
|---|---|---|
| 8 Opening balance read as a transaction | Fixed | Cause: Tally's Excel ledger puts "By"/"To" under Particulars and the party name in the next, unheaded column, so the opening row's text was never checked. The party column is now read, and a row with no voucher type that says Opening/Closing/Total is skipped. |
| 10 "By"/"To" instead of the party | Fixed (same cause) | The party name is shown; a line with no name shows its voucher type and number. |
| 9 Guide recommends XML it can't read | Fixed | Settings, the first-close guide and the FAQ now say Excel (Spreadsheet) for a ledger and warn about the multi-sheet file. Reading Ledger XML is still not built (no sample). |
| N1 Multi-sheet Excel read only the first sheet | Fixed | The sheet that names the client (the latest one) is read; if none does, the last sheet is read; the activity log says which sheets were read and which were not. |
| 11 Day Book mixed into bank reconciliation | Fixed for Excel and XML | A Day Book file keeps only receipts and payments; sales, purchase and journal vouchers are left out. A bank **ledger** keeps every line it lists. |
| N5 Invoices and bills raise exceptions | Fixed | Invoice and bill lines are kept in the document but marked "ignored" for reconciliation. A re-read replaces them. |
| 12 Kotak CSV misread | **Safety net only** | If nearly every "amount" equals the day of its own date the file is refused instead of offering 500 wrong lines. The real cause needs the Kotak file. |
| 13 MIS calls receipts "Revenue" | Fixed | Labelled "Receipts" on the report, the list, exports and the guide. |
| 14 Trial balance and ageing | Fixed earlier | Recognised at upload and refused with a plain message. |
| N4 Statement footer added to a transaction | Fixed | Footer lines ("computer-generated statement...", page numbers, registered office, customer care) are never part of a narration. |
| 15 / N2 "Discard all" stalls and says done | Fixed | One server action for the whole file; the message reports the real count; a failure puts the rows back and says nothing was changed. |
| N3 Existing firm sent to "Name your firm" | Fixed | Only the server's own "Create your practice first" means no firm. Any other failure is retried and then shows "We could not open your practice just now" with a Try again button. |
| 17 Older months can't be selected | Fixed | The Period list now covers every month from the firm's first to last transaction. |
| 16 "Never writes to Tally" doesn't match the product | **Partly** | Position taken: read-only by default; writes only approved entries, only if switched on at the connector. FAQ, Security page and blog updated. **The Terms of Service (legal text) still say it never posts to Tally: your decision and a lawyer's review, not changed.** |
| N6 "Move it here" did nothing | **Not reproduced** | Now says so if the file could not be read after the move, and the exception card wording is corrected. |
| 7 Same lines added twice (overlap between a full-year and a monthly file) | Not retested, not changed | |
| Live connector, Windows setup, GST/TDS checks | Not part of this change | Still need the retests in the first table. |
