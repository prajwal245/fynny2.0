# Trust and accuracy: what FynHelp promises, and the tests that hold it

1. **Figures are code.** MIS totals, recon matches, GST/TDS/PF/ESI checks and due dates come from fixed rules. The AI only writes commentary, and `validateInsights` rejects any sentence that cites an unknown transaction, has no citation, or quotes a figure that is not in the data.
2. **Doubt goes to a person.** A line the engine cannot settle with evidence becomes an exception. A partner (or admin) signs off the MIS, and open items must be acknowledged first. The MIS says how many rupees it left out.
3. **Learning is a suggestion.** Earlier decisions are shown ("Learned from your team", "Nothing is applied until you confirm"), and Extract memory pre-fills a line but leaves it in the Review Queue.

## Golden tests (a failure is a wrong number in a report)
- `india-classification.test.ts`, `narration-styles-golden.test.ts`: where narrations land in the MIS.
- `bank-styles-golden.test.ts`: the same ten events as HDFC, ICICI, SBI, Kotak, Yes Bank and Axis print them.
- `india-tax-golden.test.ts`: TDS sections and rates, GST rates and splits, GSTIN, PF, ESI, gateway GST, due dates.
- `trust-guarantees.test.ts`: the three promises above.

Add a case here every time a wrong result is found.

## Not yet covered
GSTR-2B vs purchase register (ITC) matching, and blocked-credit (s.17(5)) rules, are not implemented; GSTR-2B files are read and summarised only.
