# MIS reports: path to ledger-grade accuracy

**Today:** MIS reports are built from uploaded documents, bank transactions, balance sheet
snapshots and the receivables/payables ledgers. There is no Tally connection and no general
ledger, so P&L and Balance Sheet are "prepared from documents", not books. Every report
flags gaps, requires CA sign-off before sharing, and traces rows to source records.

## What is needed for 100% reliable reports

1. **Books of account as the source of truth.** Tally (XML/ODBC sync or export import), Zoho Books
   or Busy connectors, or an in-product double-entry ledger. Without a ledger, P&L cannot include
   depreciation, provisions or journals, and the Balance Sheet cannot be derived or proven.
2. **Trial balance and chart-of-accounts mapping.** Map every ledger to a reporting line
   (revenue, direct cost, opex, asset class). Reports compute from the mapped TB;
   assets = liabilities + capital is then enforced, not just checked.
3. **Complete, validated inputs.** Period-lock checklist: all bank accounts imported with
   statement balance tie-out, all documents reviewed and posted, no open exceptions.
   Block "final" status until it passes.
4. **Period-end as-of data.** Dated receivable/payable balances (invoice + settlement history)
   so aging is true at period end, not today.
5. **Account-level bank data.** Tag transactions to accounts for per-account balances and a
   book-vs-bank reconciliation statement.
6. **Statutory data for the locked reports.** GSTR-1/3B/2B filings and TDS challans/returns
   (GST Summary, TDS Summary); expense categories mapped to ledgers (Expense Analysis).
7. **Controls.** Preparer/reviewer separation, immutable versions of signed-off reports,
   change log when source data changes after sign-off, and automated reconciliation tests
   (report totals vs ledger) in CI with real client fixtures.
8. **Commentary last.** Add AI narrative only on top of locked numbers, clearly labelled.

Suggested order: (1) Tally/ledger import -> (2) CoA mapping and TB-based P&L/Balance Sheet
-> (3) period-lock checklist -> (4) unlock Expense Analysis, GST, TDS.
