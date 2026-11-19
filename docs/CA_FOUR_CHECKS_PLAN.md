# The CA's four checks: what FynHelp covers today, what is missing, and how we build it

Asked by the CA: opening balances against last year's audited closing; bank and loan reconciliation; GST reconciliation (GSTR-1 and 3B against sales, GSTR-2B against purchases including ITC available against claimed, GSTIN and amount mismatches, RCM liability against 3B and ITC); bill-to-bill mapping and ageing.

Principle for all four: **AI reads, code proves, people approve.** Every figure is computed in code from a source the CA can open. Where a source is missing we say what to upload; we never fill a gap with a guess.

## Honest status today

| Check | Today | Gap |
|---|---|---|
| 1. Opening balances | Tally masters are read (ledger, group, opening). We prove the opening balances balance among themselves. | Nothing compares them with **last year's audited closing**. We hold no prior-year closing to compare against. |
| 2. Bank and loan reconciliation | Built and tested on real files: per-account matching, own-account transfers, reversals, exceptions with owners, statement tie-out. Loan statements are recognised and kept out of bank lines. | Loans are recognised but not reconciled: no EMI, interest and principal split against the loan ledger, and no closing balance against the lender's statement. |
| 3. GST reconciliation | GSTR-2B against the purchase register: matched, amount differences, missing in portal, ITC at risk, vendor follow-up text. | GSTR-1 and 3B against the sales register; ITC available (2B) against ITC claimed (3B); RCM liability against 3B and ITC; GSTIN-level mismatch report. |
| 4. Bill-to-bill and ageing | Not built. | Needs bill allocations from Tally (references, dates, pending amounts) and a party-wise ageing. |

## What we need from the firm (data, in plain words)

- Check 1: last year's audited trial balance or closing balances (Excel or PDF), once per client per year. Tally masters we already read.
- Check 2 (loans): the lender's loan statement and the loan ledger. Both already arrive.
- Check 3: GSTR-1, GSTR-3B (JSON or PDF from the portal), GSTR-2B (already supported), the sales register, and for RCM the purchase entries marked reverse charge.
- Check 4: Day Book with bill allocations, or Tally's outstanding-receivables and payables reports. If the connector pulls it, no upload is needed.

## Build order and why

Ordered by (value to the CA) divided by (data risk), and by what depends on what.

**Phase 1: Opening-balance verification (smallest, unblocks trust in everything after).**
Upload last year's audited closing; FynHelp lists every ledger as matches, differs (with the amount), only in Tally, or only in the audit. Differences must be explained by a person (adjustment entry, regrouping) before the month can close. Add a Close step "Opening balances agree to last year's audit". Acceptance: on Satkaarika and SSSL, a deliberately altered ledger is caught and the unaltered pair shows zero differences.

**Phase 2: Loan reconciliation.**
From the loan statement: opening, EMIs, interest, principal, closing. Against the loan ledger: closing balance and the interest booked. Report: closing agrees or differs by X; interest booked versus charged. Acceptance: the four Indian Bank loan statements and HDFC CV loans classify as loans (the HDFC and Axis files are still needed, and until we see them we cannot say they will read).

**Phase 3: GST, in the order the CA named.**
3a. GSTR-1 and 3B against the sales register and books: taxable value and tax by month, differences by amount.
3b. ITC available (2B) against ITC claimed (3B), with the difference as a figure the CA can act on.
3c. GSTIN and amount mismatch list across 2B and purchase register (the 2B part already exists; this adds invalid-GSTIN checks by checksum and grouping by supplier).
3d. RCM: liability computed from flagged purchases, against the 3B RCM line and the ITC taken on it.
Each part ships separately so the CA can test it on a real month.

**Phase 4: Bill-to-bill mapping and ageing.**
Party-wise open bills with age buckets (0-30, 31-60, 61-90, 90+) from Tally bill allocations; receipts and payments matched to bills using references and amounts; unmapped receipts listed as "on account". Acceptance: party totals equal the ledger closing in Tally to the rupee, otherwise the report says it is incomplete.

## Rules for every check

1. A check that cannot be computed says exactly what is missing; it never shows a partial answer as complete.
2. Differences are decisions for a person, recorded with who, when and why, like exceptions today.
3. Nothing is posted to Tally by a check; corrections are proposed and approved like any other entry.
4. Any AI use (reading a PDF return or audit schedule) goes through the same tie-out: totals must agree with what the document itself prints.
5. Cost control: rules read structured files first; AI reads only unstructured PDFs, in the compact format, within the per-document call cap.

## Timing

We do not promise dates here. Phase 1 is a small build (a read, a comparison and a Close step) and can be in the CA's hands first. The CA tests each phase on Satkaarika or SSSL as it lands. Phases 3 and 4 depend on real GSTR-1/3B files and Tally bill allocations; until we have a sample of each we cannot give an honest estimate.

## Questions for the CA that change the design

1. Audited closing: is it usually an Excel trial balance or the signed PDF schedule?
2. Which month of GSTR-1 and 3B can we test with?
3. For ageing: bill-wise in Tally for all parties, or only debtors?
