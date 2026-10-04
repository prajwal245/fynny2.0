FynHelp pilot sample pack (made-up data, safe to share)

Client: Sundara Textiles Pvt Ltd, September 2026

hdfc_statement_sep2026.csv    Bank statement, 8 lines (one is in USD)
tally_daybook_sep2026.xml     Tally day book export, 6 vouchers
purchase_register_sep2026.csv One purchase entry

Expected when uploaded in this order:
1. Statement: 7 transactions read, 1 line (the USD Stripe payout) sent to Review.
2. Tally day book: 6 transactions read. Recon runs on its own.
3. Recon: 5 matched, 2 bank lines left as exceptions
   (Cafe Coffee Day card spend has no book entry; SMS charges of 17.70
   on 5 Sep sit too far from the 30 Sep bank-charges voucher).
Closing balance on the statement: 4,86,484.30
