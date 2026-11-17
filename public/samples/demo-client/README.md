# FynHelp demo pack: Sunrise Traders Private Limited (fictional)

Every name, account number, GSTIN and amount is invented. Safe to screen-share and to leave behind with a prospect.
Regenerate with `python3 demo/sample-pack/make_pack.py`. `tests/unit/practice/demo-pack.test.ts` asserts every number below, so the pack and the script cannot drift.

| # | File | Upload as | What it shows |
|---|------|-----------|---------------|
| 01 | HDFC_Current_Sep2026.pdf | Bank statement | 26 lines read, ties to the bank's own summary row (14 debits, 12 credits) |
| 02 | ICICI_Current_Sep2026.pdf | Bank statement | Second account; holds the other leg of a Rs 5,00,000 transfer |
| 03 | HDFC_..._one_line_missing.pdf | Bank statement | Same statement minus one line (Rs 3,10,000 salary). Held, not trusted |
| 04 | Tally_DayBook_Sep2026.xlsx | Books (Tally Day Book) | 30 vouchers incl. a contra, a cash entry, a books-only cheque |
| 05 | Axis_Loan_Account_Statement.pdf | Any | Recognised as a loan statement, not bank lines |
| 06 | Purchase_Register_Sep2026.xlsx | GST: books side | 6 supplier invoices |
| 07 | GSTR2B_Sep2026.json | GST: portal side | 5 invoices; Kaveri Packers missing, Vasudeva amount differs |

## Expected results (Sep 2026)

- HDFC: 26 lines, status pass, tied to the bank's printed summary.
- File 03: status held for review. "The bank prints 14 debits and 12 credits. We read 13 and 12: 1 debit missing." Totals Rs 3,10,000.00 short.
- Reconcile 01 + 02 + 04: 32 bank lines, 26 matched, 4 set aside (1 own-account transfer + 1 reversed UPI payment), and the 2 contra legs in the books set aside with the transfer.
- Exactly 3 decisions: Kaveri Fashions cheque (bank Rs 1,00,000 vs books Rs 98,000), unidentified NEFT credit Rs 25,000, cheque 004512 Vasudeva Rs 30,000 in books only (timing).
- Quiet wins the engine handles: three identical Rs 42,500 EMIs, two Rs 50,000 receipts from different parties on one day, a payment with Rs 29.21 charges.
- GST: 4 matched, 1 amount mismatch (Vasudeva, Rs 1,800 tax difference), 1 missing on the portal (Kaveri Packers, Rs 7,560 ITC at risk).
