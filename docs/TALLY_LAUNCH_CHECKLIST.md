# Tally launch checklist and demo script

What is proven by automated tests, what only a live Tally can prove, and the order to show the product.

## Proven by tests (run on every change)

| Step in a CA firm's month | Test |
| --- | --- |
| Read the client's books from a Tally **Day Book XML** (bank-touching vouchers only, the rest left out and said so) | `firm-workflow-e2e`, `tally-golden` (123 real vouchers) |
| Read books from a **Ledger Vouchers XML** (cash book, UTF-16) | `tally-ledger-xml`, `firm-workflow-e2e` |
| Read a **bank statement** the way HDFC, ICICI, SBI, Kotak, Yes and Axis print it | `bank-styles-golden` |
| **Reconcile** bank against books: every bank line is matched to its own entry or becomes an exception with a reason, never force-matched | `firm-workflow-e2e` |
| **Categorise**: an existing ledger is suggested only when the payee clearly matches; bank charges, interest and cash withdrawals are recognised; an unknown payee is never guessed | `tally-suggest-pricing`, `firm-workflow-e2e` |
| **Approve, then write**: nothing is entered until a person approves; the entry is one new Receipt, Payment or Contra, balanced to the paisa | `tally-voucher`, `tally-writeback`, `tally-golden` |
| **Read back** every written voucher from Tally and compare | `tally-writeback`, connector 1.4.0 |
| **No books yet** (Flow B): bank statement only, same categorise-approve-write path | `firm-workflow-e2e` |
| Duplicate lines in a statement are flagged, not doubled | `firm-workflow-e2e` |

## Only a live Tally can prove (do once before the first customer)

Use a throwaway company in Tally Prime with the connector 1.4.0 running and "Y" chosen at setup.

1. Approve one Payment, one Receipt and one Contra (cash withdrawal) from FynHelp. Each must appear in the Day Book once, with the right ledgers and amount, and FynHelp must show "Posted and verified".
2. Approve a bank charge with "includes GST" ticked. Check the charge and both GST ledgers.
3. Approve the same line twice (double click, then again after a refresh). Tally must show one voucher.
4. Stop the connector, approve a line, start the connector. The entry must post once.
5. Close the Tally company, approve a line. FynHelp must say why it did not post and must not mark it posted.
6. Import a real Day Book from a client, reconcile, and compare the exception list with the client's own reconciliation by hand.

## Show-and-tell order (about 8 minutes)

1. **Connect** (the guide video): Settings > Integrations > TallyPrime, add connector, run the setup file, connector shows Online, link the Tally company to the client.
2. **Flow A, books in Tally**: Sync now, add the bank statement, open Recon. Show matched lines, then the Exception Queue. Approve a suggested ledger, tick "includes GST" on a bank charge, mark a cash withdrawal as a transfer. Approve for Tally and show the entry in Tally with "Posted and verified".
3. **Flow B, no books yet**: pick a client with no Tally data, upload the bank statement (unlock it if protected), check the lines, approve entries the same way.
4. **Close the client**: Portfolio > the client > Close progress. Show each stage turning done as the work is finished, and the partner's next step.

## Known limits to say out loud

- A payee that is not yet a ledger in Tally is not entered. FynHelp tells the user to create the ledger in Tally first.
- Sales, purchase and journal vouchers are not reconciled against bank; they are left out and counted.
- Writing to Tally needs the connector running on the Tally PC and "Y" chosen at setup.
