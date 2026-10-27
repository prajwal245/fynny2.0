/**
 * FAQ content shared by the pages that show it and by their FAQPage
 * structured data, so what Google reads always matches what visitors see.
 */
export const HOME_FAQS: [string, string][] = [
  ["Do we have to switch off Tally or Zoho?", "No. Keep your ledger exactly where it is. Upload the Tally day book or ledger export, or connect Zoho Books to pull a client's bank ledger, and FynHelp adds the extraction, reconciliation and review layer on top."],
  ["What does my team stop doing?", "Line-by-line matching of transactions that were always going to tie out, and chasing documents by hand. Your team keeps the judgement: exceptions, treatment decisions and sign-off."],
  ["What counts as an active client?", "A client is active in a month if FynHelp processes at least one document or runs one reconciliation for them. Clients you don't touch that month are free, and so are archived clients."],
  ["How is client data kept safe?", "Each firm's data is isolated at the database level, files are kept in private storage and shared only through short-lived links, and every action is recorded on an audit trail. We publish certifications only once they are independently verified."],
  ["Do you train AI models on our data?", "No. Your clients' books never train shared or global models. Corrections your team makes are remembered only for your firm."],
];

export const PRICING_FAQS: [string, string][] = [
  [
    "What is an active client?",
    "A client is active in a month if FynHelp processes at least one document or runs one reconciliation for them. Clients you don't touch that month are free, and so are archived clients. In a quiet month you pay only for the clients you work on.",
  ],
  [
    "What counts as a document?",
    "One uploaded file. A bank statement counts as one document however many lines it has; one invoice is one document. Each plan includes a pooled allowance per active client: 40 on Essential, 50 on Firm, 60 on Scale.",
  ],
  [
    "What happens if we go over the allowance?",
    "Nothing stops. You get a notice at 80% and at 100%, uploads, extraction, reconciliation and the MIS carry on, and extra documents are billed at ₹499 per 250 (rounded up) on the next invoice. Active clients above your plan's included number are billed at ₹149, ₹119 or ₹99 each. Essential covers up to 25 active clients; from the 26th, move to Firm.",
  ],
  [
    "Do we have to leave Tally or Zoho?",
    "No migration. Upload Tally exports (XML or Excel) as you do today, or connect Zoho Books and pull each client's bank ledger and open invoices. Both are read-only by default, and FynHelp never writes to Tally.",
  ],
  [
    "Does FynHelp change anything in Zoho Books?",
    "Not unless you ask it to. Connecting Zoho Books is read-only. A partner can optionally switch on approved entries for a client: a bank charge, or a receipt that names exactly one open invoice. Each one is previewed first, needs a partner's approval, is tagged \"Created by FynHelp\", is logged, and can be undone. Anything else stays in Zoho for your team to enter.",
  ],
  [
    "Which file formats can FynHelp read?",
    "Bank statements and registers as CSV, Excel or text PDF, Tally XML and Excel exports, and scans or photos through OCR. GST, TDS, payroll and payment gateway registers are summarised and never mixed into bank reconciliation.",
  ],
  [
    "Do you train AI on our clients' data?",
    "No. Your clients' documents are never used to train AI models. Each firm's data is kept separate, and corrections your team makes are remembered only for your firm.",
  ],
  [
    "What if FynHelp reads something wrongly?",
    "Lines it is not sure about go to the review queue instead of into your books, and every figure in an MIS links back to the lines behind it. When your team corrects a line, FynHelp remembers the correction for that client.",
  ],
  [
    "Can we switch plans or cancel?",
    "Yes, from Settings, Billing. A higher plan starts at once and Razorpay charges only the pro-rated difference; a lower plan, or a switch between monthly and yearly, starts at your next renewal. Cancelling stops renewal and the plan runs to the end of the paid period. Annual plans have a full refund within 30 days of starting.",
  ],
  [
    "Do we get a GST invoice, and can we pay by UPI?",
    "Prices exclude 18% GST, which is added on every invoice. Add your GSTIN when you choose a plan and it appears on the invoice so you can claim input tax credit. Pay by UPI or card through Razorpay; for bank transfer on an annual plan, write to support@fynhelp.com.",
  ],
  [
    "What happens to our data after the trial?",
    "If you don't choose a plan, the account becomes read-only for 30 days: you can still view and export everything. After that the data is deleted, and we email you 7 days and 1 day before.",
  ],
];
