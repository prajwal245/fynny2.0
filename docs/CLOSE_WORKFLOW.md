# Close workflow (16 Nov 2026)

Built from the "Product Enhancement Implementation Scope" brief, the four "Build first" modules. Nothing here posts to a client's books, files GST, or pays TDS.

## Database
Run `supabase/apply_nov_2026.sql` (it also contains `supabase/migrations/20261116100000_close_workflow.sql`). It is additive and safe to run again. Until it is run: the Exception Queue shows the new columns empty and its team actions say so in plain words; the close checklist shows the system-checked steps and says that confirmations cannot be read yet.

One data change: before this release, recon made whoever ran it the owner of every exception, and nothing could change that. The SQL sets those open, never-touched owners back to unassigned so "Unassigned" and "My exceptions" mean what they say. New exceptions start unassigned.

## Module 1: statement verification
- The result is one of **Passed**, **Failed**, **Not available** (`src/lib/practice/statementVerification.ts`), shown on every statement card and in the close checklist.
- A statement with no printed bank summary says so and rests on the running balance.
- A statement that **fails** is **held**: its status is "Needs review" with the reason, it does not count as verified for the month, and every line stays exactly as read. A partner or manager can **accept it with a written reason** (recorded with their name and the time), or upload a corrected file.
- Bank summary figures are evidence only. Nothing changes a transaction.
- Stored with the document (`extracted.statement_check`); no second copy of the truth.

## Module 2: exception management
- Seven kinds, worked out in code from what recon already knows, never by AI: unidentified receipt/payment, amount difference, timing difference, duplicate, GST mismatch (a gap that GST at 5/12/18/28% explains), cash deposit/withdrawal, own-account/related-party transfer. Each shows its reason and a one-line action.
- **Own-account transfers are paired** at recon time when the amounts are equal, directions opposite, dates within two days, the legs are on different statements, and a UTR/reference is shared or a narration names the other account. Both legs are set aside (not income or expense), the evidence is written on them, and nothing is deleted. A one-sided transfer stays an exception. The queue shows the paired list with **Undo**.
- Up to three suggested matches, each with the recon's reason. Previously accepted treatment ("Learned from your team") is unchanged.

## Module 3: team ownership and handover
- Every exception has an owner, a handling status (Open, Query sent, Answered, Resolved, Accepted as timing), a remark, a due date, who created and last changed it.
- Tabs: **My exceptions**, **Unassigned**, **All**; filters by type, status, owner and client; **bulk assign**; per-exception **history** (append-only in the database: an edit or delete is refused).
- **Senior review**: send to a partner or manager, who approves or returns it to the junior with a required note.
- "Accepted as timing" needs a written reason. Resolving a line sets its handling status to Resolved.

## Module 5: month-end close
- Ten steps per client per month. FynHelp checks five (statements received, statements verified, reconciliation run, exceptions explained, MIS prepared). People confirm GST, TDS, provisions (partner, manager or owner), and the MIS review (any team member). Partner sign-off is the existing report sign-off.
- Two states, derived each time from the steps so a month can never show closed while a step is open: **Bank and Books Closed** and **Fully Closed**.
- Expected bank statements per client (with optional last 4 digits so a statement of another account does not count).
- Client tab **Month-end close**; portfolio page **Month-end close** with the 7th / 11th / 20th due dates, who is behind, and a filter. Every confirmation records who and when.
- GST and TDS are never marked filed or paid by FynHelp.

## Not built in this release
Partner MIS v2, client query automation, firm memory and rules, ledger health checks (needs the Tally/Zoho feasibility spike first), password handling (needs the security review). Linked-invoice details on an exception and the 70% genuine-exception measurement need real firm data; the measurement is not built yet.

## Checks that could not be done here
The "known September UPI duplicate scenario" from the brief was not available to test against, so the zero-false-duplicates criterion is not yet verified. Reference-resolved lines being excluded from the unresolved count is existing recon behaviour and was not re-verified.
