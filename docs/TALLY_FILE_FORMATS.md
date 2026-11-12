# Tally file formats FynHelp reads

One reference for people and for the agents. The same rules are given to every AI call (`INDIA_CONTEXT` in `src/lib/practice/india.ts`), and the code that applies them is deterministic: the AI never decides an amount, a date or a side. Sample files for every shape are published at `/samples` (folder `public/samples/tally`) and are tested in `tests/unit/practice/tally-sample-files.test.ts`.

## The rule behind all of them

In Tally files a **debit is written negative** and a credit positive. For a bank ledger a debit is money in and a credit is money out. FynHelp decides the side from the bank leg (or from which tag carries the amount), never from a guess.

## What each file is, and what FynHelp does with it

| File | How to spot it | What FynHelp does |
| --- | --- | --- |
| **Day Book / Vouchers** (export or "Import Data") | `<VOUCHER>` with `ALLLEDGERENTRIES.LIST` legs | Bank movements become lines to reconcile. Sales, purchase, journal, credit and debit notes with no bank leg are left out, and so are vouchers paid or received only in cash (they never reach a bank statement). The upload says how many of each. A Contra between cash and bank is kept. |
| **Bank book or cash book** (Ledger Vouchers as XML, UTF-16) | flat `DSPVCHDATE`, `DSPVCHLEDACCOUNT`, `INFOFIELD`, `DSPVCHTYPE`, `DSPVCHDRAMT`, `DSPVCHCRAMT` | One line per row. `DSPVCHLEDACCOUNT` is the *other* ledger. `(as per details)` means several ledgers (rent with TDS, GST heads, audit fee with TDS): the line is named by its biggest ledger and carries the amount that actually left the bank. The upload shows the debit and credit totals to tick against Tally. |
| **Customer or supplier ledger** (same flat format, with invoices) | Sales, Purchase, Credit or Debit Note rows with `(as per details)` | Summarised as invoiced, received or paid, outstanding for the period. Never used as bank lines: an invoice is not money moving through the bank. |
| **Masters** ("All Masters": `LEDGER NAME`, `PARENT`, `OPENINGBALANCE`) | `<LEDGER NAME=...>` and no vouchers | No transactions. Checks that opening debits equal opening credits, that a bank and a cash ledger exist, that no ledger name is twice, and that every ledger has a group. |

## Voucher types

| Voucher (Day Book) | Ledger report | Side |
| --- | --- | --- |
| Receipt | Rcpt | money in |
| Payment | Pymt | money out |
| Contra | Ctra | transfer between own accounts |
| Sales, Purchase, Journal, Credit Note, Debit Note | Sale, Purc, Jrnl, CrNt, DbNt | not a bank movement |

## Things that are not errors

- A cheque "not yet presented" is in the books and not in the bank yet: a timing difference.
- Two vouchers can share a `REMOTEID`; neither is dropped.
- A date like `4-Sep-26` is 4 September 2026. Amounts may carry `Dr` or `Cr`.
- A cash withdrawal or deposit is a Contra between the bank and Cash, never a payment to a made-up ledger.

## Checks that run on every file

- Totals are added in paise so they match Tally exactly.
- A file that is not a recognised shape is refused with the reason, not guessed at.
- Nothing is written to Tally for a line a person has not approved, and an entry that is not balanced to the paisa is refused on the server and again on the Tally PC (`docs/ACCURACY.md`).

## Adding a new shape

1. Put a real, made-up-data file in `public/samples/tally`.
2. Teach `src/lib/practice/extract` to recognise it before any other reader.
3. Add the expected counts and totals to `tally-sample-files.test.ts`.
4. Add a line to this page and to `INDIA_CONTEXT` if the agents need to know it.
