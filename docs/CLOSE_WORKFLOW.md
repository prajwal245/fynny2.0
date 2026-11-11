# The month-end close in FynHelp: what is tracked, who does it, what stays in your books

Close progress and the Portfolio follow one list of steps (`src/v2/lib/closeWorkflow.ts`). Each step's status comes from the same data as the rest of the app, never from a separate flag, and each is marked **Agent**, **You approve** or **Partner**. Only steps FynHelp really performs count toward the percentage.

## Tracked steps (five phases)

| Phase | Step | Who | What FynHelp really does |
|---|---|---|---|
| Documents | Collect the client's documents | Agent | Chaser follows up on missing documents (WhatsApp, email); documents arrive by upload, Gmail or WhatsApp intake |
| Documents | Read and sort each document | Agent | Extract sorts a document as sale, purchase, bank or journal, reads date, amount, party and reference, and scores its confidence |
| Documents | Bring in the books from Tally or Zoho Books | Agent | Tally connector reads the Day Book and ledger names; Zoho Books pulls the bank account ledger and open invoices and bills; or an export is uploaded |
| Review | Check the documents for repeats and GST | Agent | A file sent twice is ignored; the GSTIN, taxable value and tax columns of a register are checked |
| Review | Check the rows Extract was unsure about | You approve | Review Queue; corrections are remembered per client for next month |
| Recon | Match the bank statement to the books | Agent | Exact, then close matches (amount, date, party, reference within a tolerance and date window), then firm rules and aliases, then split matches. No AI: the same input gives the same matches |
| Exceptions | Investigate what did not match | You approve | Exception Queue with the three likeliest matches; a partner can approve one bank line to be written to Tally or Zoho Books, or export a file to import |
| MIS | Prepare the MIS from matched, verified data | Agent | Narrate uses only matched data; every figure links to its source |
| MIS | Partner reviews and signs off | Partner | Sign-off records the month as closed |

## Around FynHelp (never counted as progress)

| Work | Where it happens | Why it is listed |
|---|---|---|
| Record sales, purchases, expenses and journals | Tally or Zoho Books | FynHelp does not create these entries, draft entries or journals |
| Create ledgers and choose the accounting treatment | Tally or Zoho Books | FynHelp never creates a ledger; it suggests an existing ledger for a bank line you approve |
| Trial balance, day book review | Your accounting software | FynHelp reads the Day Book and ledger names; it does not prepare a trial balance |
| Bank Reconciliation Statement | Not in FynHelp yet | FynHelp matches lines and lists differences; it does not prepare the statement |

## Rules this keeps

- No step is marked done on a promise. "Exceptions" is not done before Recon has run.
- Nothing is posted to Tally or Zoho Books without a person's approval, one entry at a time.
- If a step is added to the product later, add it to `workflowFor` and to this table, and the Portfolio, the client page and the tests follow.

## Portfolio

- A summary band (clients, open exceptions, awaiting review, open chases; each opens its queue), a stage mix (click a segment to filter), tabs (All, Needs attention, Ready to sign off, Closed), search (`/`), sort and a cards or list view.
- Clients with exceptions come first, then rows to review, then document chases; closed clients last.
- Each client has one button: its next step, or Open MIS once closed. It is the primary button only when a person has something to do.
