# FynHelp release, 17 Nov 2026: reconciliation accuracy, archive restore, loan accounts, AI reading

No database change. Nothing removed.

## Reconciliation (measured on real Tally Day Books and bank statements)
- **Identical amounts now match** (EMIs, FDR credits, daily receipts), following the party so two receipts of the same amount are never swapped. Equal numbers on each side are paired; unequal numbers only where the party agrees.
- **The Day Book's bank line is the book line**, charges included (a payment of ₹47,32,488 plus ₹29.21 charges matches the ₹47,32,517.21 that left the bank). A voucher between two bank accounts becomes one line per account. Cash-only vouchers are not bank lines.
- **Each bank account is matched against its own ledger.** Entries for bank accounts whose statement is not uploaded wait for it instead of becoming exceptions.
- **UPI reversals** (a debit and its RVSL credit) are paired and set aside when the books have no entry for the payment; **transfers between a client's own accounts** (including SBI's WDL TFR / DEP TFR) are paired. Every pair can be undone.
- **Bank-only clients** get a recorded result: transfers and reversals paired, nothing "waiting for books", and the close checklist says it was checked on the statements alone.
- Results: Satkaarika (Indian Bank CA vs Day Book) 42 of 43 matched, 1 exception (was 16 and 24); SSSL May (ICICI + HDFC vs Day Book) 465 of 469 (was 513 of 894).

## Statements and files
- SBI statements are proved against the bank's own counts and totals; a bank summary that contradicts itself no longer wrongly holds a correct statement.
- **Loan statements** are recognised from their own wording and kept as loan accounts with a summary, not reconciled as bank accounts (the EMIs are matched from the bank statement against the loan ledger).
- The AI reader reads long statements in parts (all-or-nothing) and applies the same balance proof; the daily AI cap is now a 100,000-call safety valve, not a limit.
- **Remove a file** (books files by anyone, bank statements by a partner): its matches are reversed and the other side reopens; the original stays stored.
- **Sheet picker:** a multi-sheet Excel shows each sheet as a card saying what is in it, with the one FynHelp reads marked.

## Clients and uploads
- **Archived clients can be restored for 14 days** (Clients, Archived). Archived clients no longer count toward the month's active clients.
- The plan limit is checked once before a batch of uploads, with one clear message and a timeout, instead of every file hanging.
- Exception changes show instantly and save in the background; the note box clears.
- Overview now follows the month on screen (an earlier month's recon is no longer forgotten), the percentage equals "n of m", and it links to the real Month-end close.

## MIS
- A bank code such as "TFR" is never reported as a customer ("TFR 66% of revenue" is gone).
- The two nets are named for what they are: **Net operating result** (receipts less expenses) and the cash movement across every rupee, including loans, taxes, advances and transfers.

## Platform
- An animated "agent at work" trace (steps, shimmer, spring-in checkmarks, reduced motion respected) on the close checklist, portfolio close, GST reader, restore and saving states.

## Check the AI after release
`GEMINI_API_KEY=<production key> node scripts/check-ai.mjs` (optional `GEMINI_MODEL`). It confirms the model answers and reads a three-line statement correctly. Until you run it, the AI reader (Kotak, Indian Bank CC, Axis, scans) has been verified with a stand-in model only.

## Known limits
MIS classification of creditor payments needs the books' ledger groups, which an Excel Day Book does not carry; it will be examined with the client's May MIS. The documents counters were correct: the files in the report never registered because uploads hung, now fixed.
