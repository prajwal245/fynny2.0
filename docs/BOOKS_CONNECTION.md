# Books connection: Tally and Zoho Books (21 Nov 2026)

The product reads the client's books from the system the client keeps them in. This page says what each system sends today (from the code), what it does not, and what to build next. The screens use the same table (`src/lib/practice/books/capabilities.ts`), so a connected badge never implies more than arrives.

## What arrives today
| Input the reviews need | Tally connector | Zoho Books | Uploaded file |
|---|---|---|---|
| Day Book (month) | Yes, pulled each month | No (Zoho has no Day Book) | Yes |
| Sales and purchase registers | Read out of the Day Book | Not read (needs a Zoho export) | Yes |
| GST ledgers and set-off journal | Read out of the Day Book | No | Yes |
| Bill-wise outstanding | **No** (not sent yet) | Open invoices and open bills (`ZohoBooks.invoices.READ`, `bills.READ`) | Yes |
| Trial Balance | **No** (not sent yet) | **No** (a Zoho report, not read yet) | Yes |
| Ledger masters with GSTIN, PAN, bill-wise flag | **No** (the connector sends ledger names and groups only) | **No** (contacts need `ZohoBooks.contacts.READ`, not asked for) | Yes |
| Bank ledger (books side of recon) | Inside the Day Book | The linked bank account's transactions (`banking.READ`) | Yes |

Nothing here writes to either system. Posting stays off for the QC module (`PRACTICE_TALLY_POSTING`, Zoho's separate write consent).

## How the product uses the connection
- `booksConnection()` (server) reads the client's Tally company mapping and connector check-in, or the Zoho link and connection status, and returns: system, state (none, waiting, live, stale, error), last sync, what it supplies for the month and what it cannot.
- **The sync button** (`BooksConnectionBar`): Tally cannot be called (the connector only makes outbound calls), so the button asks for the month and the connector sends it at its next check-in (the answer says if the connector is offline). Zoho reads the month at once. Not connected: the button goes to Settings.
- **Readiness**: what the connection supplies for the month ticks its inputs ("Synced from Tally · Satkaarika"). A Zoho bank ledger is never taken for a Day Book. A sync older than the month ticks nothing.
- **Gaps are named** next to the button, with what to do instead (export from Tally, update the connector).

## Build next (needs a real Tally and a real Zoho organisation to test)
These are not shipped, because they cannot be proved here without the real systems; each needs a test against real output before release, as the Day Book reader had.
1. **Tally connector, masters**: extend `ledgerListRequest` in `public/downloads/fynhelp-tally-connector.mjs` with the Ledger collection's `OpeningBalance`, `PartyGSTIN`, `IncomeTaxNumber`, `LedStateName`, `GSTRegistrationType` and `IsBillWiseOn` methods; store them with the ledger list; fill `ledger_masters` and the party master from them (the party master builder already takes this shape).
2. **Tally connector, Trial Balance**: a Trial Balance report request for the year's first and last day, filed as a document the Trial Balance reader (`readTrialBalance`) understands once converted.
3. **Tally connector, outstanding**: the Bills Receivable and Bills Payable reports for the bill-wise parties.
4. **Zoho**: add `ZohoBooks.contacts.READ` (GSTIN, PAN) at the next reconnect; confirm in Zoho's API reference which report endpoints exist for the Trial Balance before promising it.
5. After each of these, move the input from `GAPS` to `SUPPLY` in `capabilities.ts`; the screens, the request to the client and the tests follow from that one table.
