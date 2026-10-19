# FynHelp product walkthrough: test run

Recorded 19 Oct 2026 on the current build of `main`, run end to end in a real browser. 19 of 19 checks passed. No browser errors.

| # | Step | Result | What was checked |
|---|---|---|---|
| 1 | Website home page loads | Pass | FynHelp — Month-end close software for CA firms in India |
| 2 | Pricing page: toggle, plan helper (40 clients → Firm ₹5,689) | Pass | 40 active clients → Firm ₹5,689 |
| 3 | Sign up with email and password | Pass |  |
| 4 | Create the firm | Pass |  |
| 5 | Add the first client with WhatsApp number | Pass |  |
| 6 | Upload HDFC statement → 7 transactions structured | Pass | hdfc_statement_sep2026.csv Extract agent 0s Uploaded securely 7 transactions structured, 1 |
| 7 | Upload Tally day book → Recon runs automatically | Pass | Recon ran automatically: 5 of 7 bank lines matched (2 same amount and date, 2 close matches, 1 by rules or par |
| 8 | Recon summary shows matched and unmatched | Pass | 14 days left in your free trial. Run a reconciliation and make an MIS to extend it to 30 days. Every Firm feat |
| 9 | Review queue item opened and discarded | Pass | Item discarded |
| 10 | Exceptions: match with difference, resolve the rest | Pass | all exceptions decided |
| 11 | Generate MIS; open a figure's source lines | Pass | REVENUE ₹1,65,000, EXPENSES ₹78,515, NET ₹86,484 |
| 12 | Partner sign-off | Pass | Your first MIS is signed off. That is the whole monthly close, end to end. / Report signed off |
| 13 | Chase item, email follow-up sent, closes when invoice arrives | Pass | Email follow up sent → resolved when the invoice arrived |
| 14 | Gmail: connect, scheduled inbox check, client email filed under the client | Pass | scheduled check 200 → filed under Sundara (exact) |
| 15 | WhatsApp: link number, client sends statement, filed by phone and read | Pass | webhook queued → filed under Sundara by phone, 2 lines (parsed) |
| 16 | Zoho Books: connect, map client, pull October; Recon matches it | Pass | Zoho pull read; Recon matched 4 October lines against Gmail's HDFC statement |
| 17 | Today view and ⌘K runs Recon | Pass | Reconciling October 2026 Recon agent 0s 4 matched · 2 exceptions with reason codes |
| 18 | Invite a colleague | Pass |  |
| 19 | Usage meter; choose Firm yearly; Razorpay checkout; plan active | Pass | OCTOBER 2026 SO FAR Active clients 1 / 5 The trial covers 5. A client is active once a doc → Firm, yearly, act |

Stand-ins used (no real accounts or money): Razorpay Checkout and API, the email provider, Google sign-in and the Gmail API, Meta's WhatsApp API, and Zoho's sign-in and Books API. Each answers the way the real service does; everything else is the real app, database and agents.
