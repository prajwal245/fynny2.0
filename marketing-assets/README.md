# Reel visuals: product screens, scene by scene

Every image is the real FynHelp interface. Nothing here is a mock-up and nothing is real client data.

Two kinds of image, marked in each file name:

| Marker | What it is |
| --- | --- |
| `__current-UI` | Rendered on 24 Nov 2026 from the app's own components (the same code that runs in production), filled with invented demo data: firm "Rao & Mehta Associates", clients such as "Sundara Textiles Pvt Ltd". 2x resolution PNG. |
| `__Oct-UI` | Real screenshots of the product guide (`public/guide`, captured 31 Oct 2026 on a test firm, client "Sample Client Pvt Ltd"). 1440x900 JPG. The layout is slightly older (no "Month-end close" page yet), so use them for the flow, not for the newest details. |

## Video 1: Complete month-end workflow

| Scene | Line | Folder | What is in it |
| --- | --- | --- | --- |
| 1 | Human on camera | `human-on-camera` | Nothing to capture. |
| 2 | Client documents and close dashboard | `scene-02-client-documents-and-close-dashboard` | Month-end close dashboard (six clients, due dates, "What needs a person", progress per client); portfolio overview; a client's Documents tab with the upload box and file list. |
| 3 | Reconciliation and exception queue | `scene-03-reconciliation-and-exception-queue` | Bank side and books side with Match buttons; Exception Queue; match with a difference and a note; set aside with a reason; a learned decision. |
| 4 | Close checklist and MIS | `scene-04-close-checklist-and-mis` | Client close checklist (10 steps, who confirms each, partner sign-off); generate MIS; the MIS report; click a figure to see its source lines; partner sign-off; signed off. |
| 5 | Human on camera | `human-on-camera` | Nothing to capture. |

## Video 2: Bank statement sorting

| Scene | Line | Folder | What is in it |
| --- | --- | --- | --- |
| 1 | Human on camera | `human-on-camera` | Nothing to capture. |
| 2 | Upload statement | `scene-02-upload-statement` | Upload box and file list; "17 transactions structured". |
| 3 | Transaction table and verification | `scene-03-transaction-table-and-verification` | Statement check passed (running balance, opening and closing balance, dates); the bank lines table. |
| 4 | Held statement and ledger suggestions | `scene-04-held-statement-and-ledger-suggestions` | A statement held because the balance does not follow, with the lines where it breaks; one held because the account holder differs; the Tally ledger suggestions list with Approve for Tally. |
| 5 | Human on camera | `human-on-camera` | Nothing to capture. |

## Check these lines in your scripts before you record

These are the places where the wording goes further than the product does.

1. **Video 2, scene 3: "Transactions are sorted by type, such as UPI, NEFT, RTGS, bank charges and transfers."**
   The product tags each line as a receipt, payment, bank charge, interest, tax, salary or transfer, and reads the counterparty and reference from the narration (including UPI, NEFT and RTGS references). It has no UPI / NEFT / RTGS type column. Suggested line: "Each transaction is read with its date, amount, direction, counterparty and reference, and tagged as a payment, receipt, bank charge, interest, tax, salary or transfer."
2. **Video 2, scene 3: "FynHelp checks the extracted figures against the bank's own totals."**
   It always checks every line against the statement's running balance, and also against the bank's own totals where the bank prints them. Suggested line: "FynHelp proves every line against the statement's running balance, and against the bank's own totals where they are printed." (The check-passed image shows both.)
3. **Video 2, scene 4: "FynHelp can suggest an existing Tally ledger."**
   True, with two conditions worth keeping on screen: it only ever suggests ledgers that already exist in Tally, and nothing is written to Tally without an approval click. This needs the Tally connector. The image shows a line with no close ledger being left for a person.
4. **Video 1, scene 2: "collecting missing documents".**
   The dashboard shows who is waiting on the client, but there is no image of the Chaser here. Add one if you want to show the collecting step.
5. **Video 1, scene 4: "partners can review the work and sign off".**
   Accurate. Sign-off is a separate action from "Request correction", and GST, TDS, provisions and MIS review are confirmed by people, not by FynHelp. The checklist image says so.

## Before you publish

- The demo clients and figures are invented. If you want real-looking figures from a real firm, get that client's written permission first.
- The newest screens (Month-end close, the checklist, the held-statement cards, the ledger suggestions) are `__current-UI`. For full-page, full-colour recordings of the live app, run `scripts/record-client-flow.mjs` with a test-firm login (see `docs/RECORD_CLIENT_FLOW.md`).

## How the current-UI images were made

`_how-these-were-made` holds the render script and the screenshot script (as `.txt` so the test runner does not pick them up). They render `ClosePage`, `CloseChecklist`, `StatementCheckCard` and `TallyPosting` with mocked data and photograph them at 2x.
