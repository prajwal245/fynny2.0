# Zoho Books: setup, safety and a go-live check

## What it does

| | Default | Needs |
|---|---|---|
| Pull a client's bank ledger for Recon | on | Connect (partner) |
| Read open invoices (sent, overdue, part-paid) | on | the `invoices.READ` scope; older connections reconnect once |
| Create one approved entry (bank charge, a receipt naming one open invoice, or a payment naming one open bill) | **off** | platform switch + a second Zoho consent + a per-client switch |

FynHelp never edits or deletes anything it did not create. Every entry it creates is tagged "Created by FynHelp", logged in Settings → Zoho Books, and can be undone there.

## 1. Zoho API Console (api-console.zoho.in, or your region)

1. Add a **Server-based Application**.
2. Authorised redirect URI: `https://www.fynhelp.com/api/integrations/zoho/callback`
3. Copy the Client ID and Client Secret.

## 2. Vercel environment variables (Production), then redeploy

| Variable | Value |
|---|---|
| `ZOHO_CLIENT_ID` / `ZOHO_CLIENT_SECRET` | from step 1 |
| `GMAIL_ENCRYPTION_KEY` | already set; also encrypts Zoho tokens |
| `ZOHO_ACCOUNTS_URL` | optional, default `https://accounts.zoho.in` |
| `ZOHO_REDIRECT_URI` | optional, default the URL above |
| `ZOHO_POSTING_FIRMS` | **Opt-in per firm.** Leave unset and nobody sees the approved-entries option. List firm ids (comma separated) to let in a pilot firm. Only `*` means every firm. Remove an id to switch that firm off at once. |

Paste each value without a trailing line break, space or quotes. FynHelp cleans them on read, but a stray line break in `ZOHO_CLIENT_ID` once sent partners to Zoho's "Invalid Client: Client ID passed does not exist" page (the sign-in address ended in `%0A`). Admin, System Health, "Zoho Books sign-in" tells you when a stored value needed cleaning or looks wrong.

## 3. Database (Supabase SQL editor)

Run `supabase/migrations/20261103090000_zoho_posting.sql` once, then `supabase/migrations/20261111090000_zoho_vendor_payments_drift.sql` (adds the vendor-payment kind and the drift columns; safe to run twice). Everything defaults to off.

## 4. Scopes FynHelp asks for

Read (always): `ZohoBooks.settings.READ`, `ZohoBooks.banking.READ`, `ZohoBooks.accountants.READ`, `ZohoBooks.invoices.READ`, `ZohoBooks.bills.READ` (connections made before this need one reconnect for bills; without it payments stay manual and charges still work)
Write (only when a partner clicks "Allow approved entries"): `ZohoBooks.expenses.CREATE`, `ZohoBooks.expenses.DELETE`, `ZohoBooks.customerpayments.CREATE`, `ZohoBooks.customerpayments.DELETE`, `ZohoBooks.vendorpayments.CREATE`, `ZohoBooks.vendorpayments.DELETE`. A firm that already allowed approved entries must click "Allow approved entries" again to grant the two new vendor-payment scopes.

## 5. Safety rules built in

- Posting needs all three: the firm listed in `ZOHO_POSTING_FIRMS`, that firm's own write consent in Zoho, and the client's switch. Connecting Zoho Books for reading is also a choice: a partner has to click Connect.
- Only a partner can approve; the bank line's amount, date and narration are read from FynHelp's database, never from the browser.
- Bank charges only, up to ₹5,000, booked to the "Bank Fees and Charges" expense account (FynHelp will not create accounts).
- Receipts only when the narration names exactly one open invoice and the amount does not exceed what is due.
- Vendor payments only when the narration names exactly one open bill and the amount does not exceed what is due.
- Two-way: after an entry is created FynHelp reads that month back from Zoho. "Check against Zoho" (Settings → Zoho Books) reads each entry FynHelp created and flags any that were changed or deleted in Zoho. It only reads; it never edits or re-creates anything.
- One live entry per bank line (database-enforced), so a double click or retry cannot post twice.
- A write is never retried automatically. If Zoho does not answer, the line is held as "check Zoho" until a person looks.

## 6. Go-live check (do this once on a Zoho test organisation before listing a firm in `ZOHO_POSTING_FIRMS`)

1. Connect Zoho in Settings; link a client to its bank account; pull a month.
2. Open a bank charge in Exceptions → "Post to Zoho Books…" is hidden until all three switches are on. Switch them on.
3. Preview shows the right account, amount and date; approve; confirm the expense appears in Zoho with the "Created by FynHelp" note.
4. Click Undo; confirm the expense is gone in Zoho.
5. Click approve twice quickly; confirm only one expense exists.
6. Post a receipt whose narration names one open invoice; confirm the payment is applied to it, then undo.
7. Post a payment whose narration names one open bill; confirm it is applied to the bill and the bill's balance drops, then undo.
8. Create an entry, edit its amount in Zoho, press "Check against Zoho"; confirm it shows "Changed in Zoho Books". Delete it in Zoho and check again; confirm "No longer in Zoho Books".

## Export for Zoho (no connection needed)

For a client whose books are in Zoho Books, FynHelp can write CSVs of what the books are missing, so a CA imports them by hand. FynHelp never writes to Zoho for this.

1. Exception Queue → **Export** button (it says Zoho Books or Tally, from the books FynHelp has seen for that client; with no client chosen you pick one in the drawer). Also on the client's Exceptions tab and inside each bank-side exception. It follows the month in the top bar or "All periods". For Tally it downloads one XML of Payment/Receipt vouchers (type the bank ledger name first; missing ledgers are created) and you import it via Gateway of Tally → Import → Data.
2. Download **Missing expenses**, **Missing receipts** or **Bank lines to categorise**.
3. In Zoho Books import the file (the path is shown under each file), map the columns, set Paid Through / Deposit To to the bank account, and check the account, customer and invoice guesses.
4. Run Recon again; the lines now match.

If a Zoho pull finds nothing, the message names the organisation and account and lists the months that do have entries.
