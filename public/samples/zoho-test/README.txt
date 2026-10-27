Made-up test data for reconciliation (no real people, companies or accounts)

customers.csv / vendors.csv   5 customers and 3 vendors in India with GSTINs that pass the GSTIN check-character test
invoices.csv                  10 sales invoices: 5 unpaid, 5 partially paid
bills.csv                     5 vendor bills (3 paid or part-paid, 2 open)
bank_statement_sep2026.csv    10 bank lines (6 deposits, 4 withdrawals), HDFC layout. Opening 5,00,000.00, closing 7,02,450.00
books_bank_ledger_sep2026.csv The bank ledger as the books hold it (8 entries)

Upload in FynHelp: the statement as a bank document and the ledger as books. Expected: 8 matched, 2 exceptions
- 21 Sep deposit of 12,500.00 (UPI, walk-in customer): received in the bank, never recorded in the books
- 30 Sep withdrawal of 590.00 (bank charges): charged by the bank, never recorded in the books

To use the same data in Zoho Books, import customers, vendors, invoices and bills from the CSVs (Zoho's import screen lets you map columns), then record the customer receipts and vendor payments listed in the bank ledger. Zoho's import templates change, so map by column name rather than position.
