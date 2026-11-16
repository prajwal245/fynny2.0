# Real-statement results, 16 Nov 2026

Ten real bank statement PDFs from five clients (ICICI ×4 quarters, HDFC, SBI ×2, Indian Bank ×2, Union Bank) were put through the same path as an upload: stored, read, checked and filed. Client names and account numbers are deliberately not recorded here or in the tests; the files are not in the repository.

## Result
| Statement | Lines read and filed | Reviews raised | Tied to the bank's own figures | Verification |
|---|---|---|---|---|
| ICICI current, Apr–Jun | 1,464 | 0 | line numbers 1–1,464, all pages | Passed |
| ICICI current, Jul–Sep | 1,461 | 0 | line numbers, all pages | Passed |
| ICICI current, Oct–Dec | 1,293 | 0 | line numbers, all pages | Passed |
| ICICI current, Jan–Mar | 1,610 | 0 | line numbers, all pages | Passed |
| HDFC current | 161 | 0 | summary row: counts, totals, balances | Passed |
| SBI current | 179 | 0 | **new:** 108 debits, 71 credits, both totals, opening, closing | Passed |
| SBI overdraft | 110 | 0 | **new:** 57 debits, 53 credits, both totals, closing | Passed |
| Indian Bank ×2 | 43 and 5 | 0 | per-page counts and totals | Passed |
| Union Bank current | 836 | 0 | total row | Passed |

Total 7,162 lines, none held, none sent to review, no duplicates. The four ICICI quarters chain exactly (each closing balance is the next opening).

## Independent check
The reader's output is compared with the PDF's plain text, read by a different route. For all 7,162 lines, **every amount, every balance and every date the reader filed is present in the PDF's own text** (0 missing). Together with the running balance (each line moves the balance by exactly its amount) and the bank's own counts and totals, this means no line is invented, mis-read, or missing.

## What was found and fixed
1. **SBI prints a Statement Summary the reader ignored.** It is now read, so SBI statements are proved by the bank's own counts and totals like HDFC.
2. **A bank's summary can contradict itself.** SBI printed "Brought Forward 0.00" on an overdraft that began the year ₹4.94 crore overdrawn; its own totals only add up with the real opening. The reader had it right. The tie-out now notices when a printed summary does not add up, does not use the unreliable opening, and still requires the closing balance, counts and totals to tie. Without this the correct statement would have been wrongly held.
3. **Transfers between a client's own accounts.** SBI prints only "WDL TFR TRANSFER TO" and "DEP TFR TRANSFER FROM", with no account number. These are now paired when the amounts are equal, the legs are on different statements within two days, and the partner is unique; identical transfers on the same day are paired in order. On the client with two SBI accounts, **18 transfers paired and 0 were left over**; the client with two Indian Bank accounts paired its 1 transfer by the account named in the narration. Undo remains available for every pair.

## What is and is not proved
Proved: no line missing, none invented, amounts, directions, balances and dates exactly as printed, counts and totals tie wherever the bank prints them.
Not proved: narrations are not independently verified, and nothing here tests reconciliation against books (no books file was supplied) or exception handling on real data.

## Not tested
One savings-account Excel (xlsx) is password protected. The product correctly stops and asks for the password; the file's content has not been read.

## Re-running
`REAL_STATEMENTS=<folder> npx vitest run tests/unit/practice/upload-e2e-pdf.test.ts` (name each file `Client name||anything.pdf`). The folder is yours; nothing is committed.
