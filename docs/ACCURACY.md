# How FynHelp keeps its numbers right

The promise is **no silent errors**: every number FynHelp shows or writes is either proved by a check or put in front of a person. A literal "100%" can be proved for the file formats (tests against real Tally files) and for the rules (deterministic, repeatable). It cannot be proved for every real company without proof on a live Tally; the checklist at the end is how that proof is made.

## The layers, in the order a figure travels

| # | Layer | What is checked | Where | Status |
|---|---|---|---|---|
| 1 | **Read** | Each file type has its own deterministic reader (Day Book XML, Ledger Vouchers XML, Excel/CSV ledger, bank statements, registers). Every row keeps its source text. | `src/lib/practice/extract/` | Built. Ledger XML added 11 Nov |
| 2 | **Tie out** | Control totals a person can tick against Tally: voucher count, ledger debit and credit totals to the paisa, period, rows left out and why. A month that does not match the period asked for is refused, not filed. | Extract note, connector month check | Built |
| 3 | **Validate** | Repeated files are ignored; GSTIN, taxable value and tax columns of a register are checked; undated or total rows are skipped; unsure rows go to the Review Queue with a confidence score. | Extract, Review Queue | Built |
| 4 | **Match** | Recon is deterministic: exact, then close matches inside a tolerance and date window, then firm rules, then splits. No AI. Every match and exception carries the numbers behind it. | `recon/engine.ts` | Built |
| 5 | **Decide** | A person approves every entry, one at a time. Nothing is posted by an agent on its own. | Exceptions, Post to Tally and Zoho | Built |
| 6 | **Write: before** | The entry must be one new Receipt, Payment or Contra for a linked company, with an id, a valid date, at least two entries, debits equal to credits to the paisa, signs that agree with debit and credit, amounts of at most two decimals. Checked on the server before it is queued and again on the Tally PC before it is sent. Existing ledgers only; nothing is ever created, changed or deleted. | `tallyVoucher.ts`, connector `refuseImport` | Built 11 Nov |
| 7 | **Write: the shape** | The XML has the shape TallyPrime itself uses (Import Data envelope, REMOTEID, ACTION="Create", OBJVIEW, debit entries first, ISDEEMEDPOSITIVE, ISPARTYLEDGER, signed AMOUNT). A test compares it with a real Tally import file on every run. | `tally-golden.test.ts` | Built 11 Nov |
| 8 | **Write: once** | One live entry per bank line (database rule); a unique id per entry; a write is never retried; if the answer never came back the line is held for a person. | `ca_tally_postings` | Built |
| 9 | **Write: proof** | After Tally says "created", the connector reads the voucher back from Tally and checks type, date, ledgers and amounts. Only a match becomes "In Tally". A mismatch, a missing entry, or two identical entries holds the line as "Needs a look" with the reason. | connector `verifyWritten`, `reportResult` | Built 11 Nov (connector 1.4.0) |
| 10 | **Close the loop** | The next sync must show the new voucher matched to its bank line. A posted line that does not match is an exception. | Recon after the sync the write requests | Partly: the sync is requested after every write; an explicit "posted but not matched" alert is not built yet |
| 11 | **Audit** | Who approved what and when, Tally's reply, the read-back note, undo and hold history. | `ca_tally_postings`, activity log | Built |
| 12 | **Prove it** | Golden tests on real Tally files in CI: 123 Day Book vouchers, 104 import vouchers, a ledger export. Every voucher in them passes the soundness rules (no false alarms). | `tests/fixtures/tally/`, `tally-golden.test.ts` | Built 11 Nov |

## What the real files taught us

- A Tally **Ledger Vouchers XML** has no `<VOUCHER>`. It is a flat run of `DSPVCHDATE`, `DSPVCHLEDACCOUNT`, `INFOFIELD`, `DSPVCHTYPE`, `DSPVCHDRAMT`, `DSPVCHCRAMT`, `DSPEXPLVCHNUMBER`. It is written in **UTF-16**. The debit amount is written negative. The side is decided by which tag carries the amount, not by its sign. It names neither the ledger nor the company nor an opening balance, so FynHelp reports totals for a person to tick.
- Tally's own exports can give **two different vouchers the same REMOTEID** (Receipt 15 and Purchase 15 on one day are both `15-20261106`). FynHelp never treats a REMOTEID as unique when reading, narrows an id match by content when reading back, and writes its own unique id.
- Voucher numbers are per voucher type, so "15" alone identifies nothing.

## Known limits of what is written (deliberate, each one named)

- **Voucher number**: not sent. Tally numbers it if the voucher type is on automatic numbering. A type on manual numbering may refuse the entry; that shows as a failed write, not a wrong one.
- **Bill allocations**: not written. A receipt from or payment to a billwise party is recorded "on account", and the accountant allocates it. Writing allocations needs invoice-level matching FynHelp does not do.
- **Bank allocations** (instrument number, bank date): not written. The books are right; Tally's own bank reconciliation date is not set.
- **Journal, Sales, Purchase, ledger creation, edits and deletes**: never written.
- **Period lock, closed financial year, a voucher type Tally does not have**: Tally refuses; the line is held and the reason shown.

## The proof FynHelp still needs on a live Tally (do on a TEST company first)

1. A Receipt, a Payment, a Contra and a GST split charge: each appears once with the right ledgers and amounts; the connector log says "read back from Tally".
2. Resend the same entry (same id): Tally must not create a second one. Note exactly what Tally answers.
3. A ledger that does not exist, a wrong company, Tally closed, a locked period: each is refused or fails with a clear reason and writes nothing.
4. A voucher type on manual numbering, and a billwise party: what Tally does with each.
5. Read-back when Tally does not export the REMOTEID: the entry is found by type, date and money.
6. After each write, the next sync shows the voucher matched in Recon.
7. A month's voucher count and the ledger totals match Tally's own screens.

Until these are done, describe writing to Tally as "built, verified against real Tally files, pending live proof", not as proven.
