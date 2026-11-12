FynHelp Tally XML sample pack (made-up data, safe to share)

Three companies, each with the files a CA firm actually receives from Tally Prime.
Narmada Textile Mills LLP (ICICI), Godavari Spices & Foods Pvt Ltd (HDFC), Brahmaputra IT Services Pvt Ltd (SBI).

01_masters_*            Ledger masters with opening balances (Tally "Import Data", All Masters).
                        FynHelp reads them as masters: no transactions are created. It checks that opening debits
                        equal opening credits and that a bank and a cash ledger exist. In Tally a DEBIT balance is
                        written NEGATIVE.
02_vouchers_*           All books for a month (Tally "Import Data", Vouchers). Bank movements become lines to
                        reconcile; sales, purchase and journal vouchers and cash-only vouchers are left out, and the
                        upload says how many.
03_day_book_*           The Day Book as exported by Tally. Reads the same as the voucher file of that month.
04_bank_book_*          Ledger Vouchers of a bank ledger exported as XML (UTF-16, as Tally writes it).
                        Debit = money in, credit = money out. "(as per details)" entries (rent with TDS, GST
                        payment, audit fee with TDS) are read at the amount that actually left the bank.
05_cash_book_*          Ledger Vouchers of the Cash ledger. Withdrawals from the bank are Contras.
06_customer_ledger_*    A customer's ledger. Summarised (invoiced, received, outstanding) and kept for ageing.
                        Never used as bank lines, because invoices are not money moving through the bank.
07_supplier_ledger_*    A supplier's ledger, handled the same way.

Try this (Godavari, October 2026):
1. Add the client. Upload 04_bank_book_hdfc_godavari_oct2026.xml as BANK (43 lines).
2. Upload 02_vouchers_godavari_oct2026_import.xml as BOOKS (43 bank lines kept, 54 non-bank and 7 cash-only left out).
3. Recon: 43 of 43 matched, no exceptions.

Then try 01_masters_godavari_spices_foods.xml (43 ledgers, openings balance), and the Narmada pair
(02_vouchers_narmada_nov2026_import.xml and 03_day_book_nov2026_export.xml read to the same 42 lines).
