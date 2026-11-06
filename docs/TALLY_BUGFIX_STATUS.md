# Tally integration: status of the 11 bugs from the 6 Nov 2026 test (TallyPrime 7.2)

Source: "Tally integration: bugs I found in FynHelp" (Adireddy Tarun). I cannot run TallyPrime here, so every fix is
written from the code and checked with fixtures and unit tests. **Each one still needs a retest on a real TallyPrime 7.2.**

| # | Bug | What changed | Checked how | Retest on real Tally |
|---|---|---|---|---|
| 1 | Live connector sends no books ("No Tally companies reported yet") | The check-in no longer swallows a failed save of the companies: the reason is stored and shown ("Connector says: ..."), and an empty company list is reported with advice. Day Book now fetched with a fallback (see "Day Book dates"). **The root cause was not reproduced**; if it still happens the new message names the failing step. | Unit tests for the helpers | Yes: check-in, company list, months sent |
| 2 | XML upload fails ("No transactions were found") | A Tally XML with no vouchers (a Ledger report) now says so and tells the user to export Excel, or the Day Book as XML. Reading a Ledger XML is not built (no sample file). | Unit test | Send the XML that failed so a reader can be built |
| 3 | Junk rows can be confirmed (22 undated rows, Rs 1,42,34,776) | Undated amount lines in a Tally ledger (breakdowns, totals) are skipped at reading. "Confirm all" confirms only dated rows and says how many are undated; confirming an undated line is refused. | Unit tests | Re-upload the same Excel: expect no 22 undated rows |
| 4 | Only about 200 lines reach reconciliation | Cause found: the screen loaded at most 200 lines per file (and one page of 1,000 per batch). Now up to 2,000 per file, read in pages, and a notice when a file is longer ("Showing the first N of M lines. All are used for reconciliation."). Reconciliation itself always used every line. | Code reading; build | Kaveri's full-year ledger: expect to Dec |
| 5 | "Active" when nothing is arriving | Active only after books have arrived; otherwise "Connected, no data yet" with the next step. | Type check | Yes |
| 6 | Misleading "open a company" message | Wording now matches the real condition (Tally listed no companies; check Client/Server Both, port 9000, Alt+F3) and the last check-in time is shown. | Unit test of the connector | Yes |
| 7 | Possible wrong row count (50 vs 49) | **Not confirmed and not fixed.** Opening/closing balance and total lines were already skipped; more variants are now recognised (tests). The real cause needs the file. | Unit tests | Send the Nov file and the count from Tally |
| 8 | Day Book mixed into bank reconciliation | Sales, purchase, journal, credit/debit note vouchers with no bank or cash entry are left out of bank reconciliation; the activity log says how many. Receipts, payments and contras are always kept. | Unit tests | Yes |
| 9 | Trial balance and debtors ageing can't be read | Both are recognised at upload and rejected with a plain message saying what to export instead. They are not read. | Unit tests | Yes |
| 10 | Connector setup too technical | Windows setup (`fynhelp-connector-setup.cmd`): installs Node via winget if missing, asks for the token, tests, and starts the connector at sign-in. **Not tested on Windows** (written without a Windows machine). A packaged installer (.exe/.msi) is still to do. | None possible here | Yes, on a clean Windows PC |
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
