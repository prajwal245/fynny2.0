# 20-minute FynHelp demo: script

Audience: a partner or manager at a CA firm. Goal: they leave believing "my team would close books faster and I can trust it".
Pack: `demo/sample-pack/` (fictional client Sunrise Traders Private Limited, September 2026). Open all seven files in one folder before you start. Have a clean firm with no Sunrise client yet.

Rule for the whole demo: say "AI reads, code proves, people approve" once at the start, then show it instead of saying it.

## 0:00 to 2:00  The problem, in their words
Say: "At month end your team opens a bank PDF, a Tally export and a spreadsheet, and ticks lines by eye. The risk is not speed, it is the line nobody noticed was missing. Let me show how we handle that."
Do: sign in, land on the dashboard. Point at the clients list and the month-end close view. Do not click around.

## 2:00 to 4:00  Add the client
Do: Clients, Add client, name "Sunrise Traders Private Limited".
Say: "One client is one workspace: documents, reconciliation, exceptions, close checklist, GST."

## 4:00 to 7:30  Wow 1: a statement that proves itself, and one that is refused
Do: Documents, upload `01_HDFC` as bank statement. Watch the agent trace.
Say when it finishes: "26 lines. Notice it does not just say 'done'. It checked the running balance line by line and tied to the bank's own printed totals: 14 debits, 12 credits."
Do: now upload `03_HDFC_..._one_line_missing` as a bank statement.
Say: "Same statement, one line dropped, the way a scan or an AI can silently do. It is held. It tells you the bank prints 14 debits, we read 13, Rs 3,10,000 short. Nothing downstream uses it until a partner accepts it with a written reason."
Do: open the held card, show the reason box, then remove file 03.
Land it: "This is the difference between an AI demo and something you can sign under."

## 7:30 to 9:30  Upload the rest
Do: upload `02_ICICI`, then `04_Tally_DayBook` as books. Optionally `05_Axis_Loan` to show it is recognised as a loan statement and kept out of bank lines.
Say: "Two bank accounts, one Day Book. It knows which book entries belong to which account from the ledger names."

## 9:30 to 13:30  Wow 2: reconciliation and only three decisions
Do: Reconciliation, run for September 2026.
Say: "32 bank lines. 26 matched on their own. Four are set aside, and I can show you why."
Do: open the set-aside list. Show the Rs 5,00,000 own-account transfer (HDFC to ICICI, same reference), the reversed UPI payment, and mention the two contra legs in the Day Book were set aside with it. Click Undo once to show nothing is hidden, then run again.
Say: "Three identical Rs 42,500 EMIs, two Rs 50,000 receipts the same day from different parties, and a payment with Rs 29.21 of bank charges: these usually break reconciliation tools. They matched."
Do: open the three exceptions.
1. Kaveri Fashions: bank Rs 1,00,000, books Rs 98,000. "A genuine Rs 2,000 difference. The tool does not guess, it asks."
2. Rs 25,000 NEFT credit, unknown remitter. "Nobody booked it."
3. Cheque 004512 Vasudeva Rs 30,000, in books only, dated 30 Sep. "Issued, not presented. Timing."

## 13:30 to 16:00  Work the exceptions like a team
Do: on the cheque choose Accepted as timing difference. On the Rs 25,000 assign to a team member and set Query sent. On Kaveri add a note.
Say: "Every change is logged and cannot be edited later. Your articled assistant works it, the manager reviews."
Be honest: automated client query messages (WhatsApp/email) are templates you copy today, not sent by the system yet.

## 16:00 to 18:00  Month-end close
Do: Close, September.
Say: "Ten steps. Documents received, statements verified, recon done and exceptions explained are ticked by the system from what it has proven. GST, TDS and provisions are ticked by a person with the right role. Partner signs off last."
Do: show the checklist with the auto steps ticked and the manual ones open. Show the due-days chip.

## 18:00 to 19:30  GST in two minutes
Do: GST reconciliation, upload `06_Purchase_Register` and `07_GSTR2B`.
Say: "4 matched, one amount differs by Rs 1,800 of tax, and Kaveri Packers is not on the portal, so Rs 7,560 of ITC is at risk. Here is the vendor follow-up message, ready to copy."

## 19:30 to 20:00  Close
Say: "Everything you saw is from fictional files you can keep. Pilot it on one real client's last month: we will tell you in an hour whether it ties to what your team did by hand."
Ask: which client and which month, and book the pilot.

## If something misbehaves
- A file will not upload: continue with the next file; every step stands alone.
- AI reader fallback: the pack's PDFs are text PDFs and read without AI. Do not claim the AI reader was verified on scanned files; say it is available and checked by the same tie-out.
- Run out of time: drop GST (18:00 block) and the loan statement.

## What not to claim
No GST filing, no posting back into Tally, no automatic sending of client queries, no senior-review flow until the firm has a second partner seat.
