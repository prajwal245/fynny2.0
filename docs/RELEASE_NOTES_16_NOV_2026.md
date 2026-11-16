# FynHelp release: Month-end close workflow
**16 November 2026** · Database change applied · Additive release, no existing screen removed

## In one paragraph
FynHelp now tracks the whole client-month, not only the bank reconciliation. Bank statements are proved or held, exceptions are sorted into the seven kinds a CA recognises and have an owner, a status and a history, and every client has a month-end close checklist that separates "Bank and Books Closed" from "Fully Closed". Nothing posts to a client's books, files GST or pays TDS.

## What is new

### 1. Statement verification
- Every bank statement shows **Verification: Passed, Failed or Not available**.
- A statement with no printed bank summary says so and relies on the running balance.
- A statement that **fails** its checks is **held**: status "Needs review" with the reason, not counted as verified for the month. Its lines are never changed or removed.
- A partner or manager can **accept** a held statement with a written reason, recorded with their name and time. Otherwise upload a corrected statement.

### 2. Exception queue
- **Seven types**, each with a plain reason and a one-line action: unidentified receipt/payment, amount difference, timing difference, possible duplicate, GST mismatch, cash deposit/withdrawal, own-account/related-party transfer.
- **Own-account transfer pairing:** transfers between a client's own accounts are paired when amounts are equal, directions opposite, dates within two days, the legs are on different statements, and a reference is shared or a narration names the other account. Both legs are set aside (not income or expense) with the evidence written on them, nothing deleted, and an **Undo** list on the queue page. A one-sided transfer stays an exception.
- Up to three suggested matches per exception, each with its reason.

### 3. Team ownership and handover
- Each exception has an **owner, status** (Open, Query sent, Answered, Resolved, Accepted as timing), **remark, due date**, and who created and last changed it.
- Tabs **My exceptions / Unassigned / All**; filters by type, status, owner and client; **bulk assign**.
- **Senior review:** send to a partner or manager, who approves or returns it to the junior with a required note.
- **History** of every assignment, status change, remark and review, append-only (the database refuses edits and deletes).
- "Accepted as timing" requires a written reason.

### 4. Month-end close
- Ten steps per client per month. FynHelp checks five: statements received, statements verified, reconciliation run, exceptions explained, MIS prepared. People confirm GST, TDS, provisions (partner, manager or owner), and the MIS review (any team member). Partner sign-off uses the existing report sign-off.
- Two states, derived each time from the steps, so a month cannot show closed while a step is open: **Bank and Books Closed** and **Fully Closed**.
- **Expected bank statements** per client, with optional last 4 digits so another account's statement does not count.
- New **Month-end close** tab on each client and a portfolio **Month-end close** page with the 7th / 11th / 20th due dates, who is behind, and filters.
- Every manual confirmation records who and when, and can be taken back (the history keeps both).

## What changes for existing users
| Before | Now |
|---|---|
| Recon made whoever ran it the owner of every exception | New exceptions start **Unassigned**. Old open, untouched exceptions were reset to Unassigned by the database change. |
| A statement that failed its checks was filed as processed | It is **held** with the reason until accepted or replaced |
| Exception reason codes only | Reason codes remain, with the **type** shown first |
| "Close" meant partner sign-off of the MIS | Sign-off is one step of a ten-step close; the old process progress bar is unchanged |
| Transfers between a client's own accounts showed as two unexplained lines | Paired and set aside when the evidence is clear |

New navigation: **Month-end close** (side menu), **Month-end close** tab (each client).

## Guardrails (unchanged and enforced)
No silent deletion of transactions. No posting to a client's books. GST and TDS are never marked filed or paid by FynHelp. Bank summary figures are evidence, never instructions to change a line. Manual confirmations record who and when. History cannot be overwritten.

## Database (already applied)
New columns on `ca_exceptions` (type, work status, due date, remark, review state, created/updated by); new tables `ca_exception_events` (append-only), `ca_close_steps`, `ca_close_events`, `ca_client_document_requirements`; one-time reset of automatic exception owners. All additive. Verification results are stored with the document, not in a new table.

## After release
1. Open **Exception Queue**: tabs, filters and the Type column appear. Assign one exception to yourself and check its history.
2. Open a client, then **Month-end close**: add that client's **expected bank statements** (name and last 4 digits). Until then "All expected statements received" says none are set up rather than passing.
3. Tell the team: juniors take exceptions from **Unassigned**; partners and managers confirm GST, TDS and provisions on the checklist.

## Known limits
- Not in this release: Partner MIS v2, client query automation, firm rules and memory, ledger health checks, password handling.
- Linked-invoice details on an exception are not shown yet.
- The brief's 70% genuine-exception target needs real firm data; the measurement is not built. The "September UPI duplicate" scenario was not available to test.
- Own-account pairing needs the legs on different statements within the same client; a transfer whose other account is not uploaded stays an exception.
- Expected statements are matched by last 4 digits where given; without digits, any statement of the month satisfies one.

## Verification before release
Type-check clean; 1,442 automated tests pass (including database-behaviour tests for assignment, handover, review, history, close derivation, transfer pairing and statement acceptance); production build succeeds. Not clicked through with live firm data.

## Rollback
The release is additive. To roll back, revert the pull request. The new database columns and tables are harmless if unused and need no change.
