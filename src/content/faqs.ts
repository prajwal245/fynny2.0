/**
 * FAQ content shared by the pages that show it and by their FAQPage
 * structured data, so what Google reads always matches what visitors see.
 */
export const HOME_FAQS: [string, string][] = [
  ["Do we have to switch off Tally or Zoho?", "No. Keep your ledger exactly where it is. Upload the Tally day book or ledger export and your clients' bank statements, and FynHelp adds the extraction, reconciliation and review layer on top."],
  ["What does my team stop doing?", "Line-by-line matching of transactions that were always going to tie out, and chasing documents by hand. Your team keeps the judgement: exceptions, treatment decisions and sign-off."],
  ["What counts as an active client entity?", "One set of books you process in a given month: a company, LLP or proprietorship with its own ledger. Entities you don't process that month don't count."],
  ["How is client data kept safe?", "Each firm's data is isolated at the database level, files are kept in private storage and shared only through short-lived links, and every action is recorded on an audit trail. We publish certifications only once they are independently verified."],
  ["Do you train AI models on our data?", "No. Your clients' books never train shared or global models. Corrections your team makes are remembered only for your firm."],
];

export const PRICING_FAQS: [string, string][] = [
  [
    "What counts as an active client entity?",
    "Any client entity with at least one document processed or reconciliation run in the calendar month. Clients you did not touch that month cost you nothing — you pay for work you actually did.",
  ],
  [
    "What happens if we exceed our included clients?",
    "Extra active clients are billed at your tier's rate (₹149 / ₹119 / ₹99). Starter caps at 25 total; Professional and Scale have no cap. You can also upgrade anytime — monthly switches are instant, annual switches are pro-rated.",
  ],
  [
    "Is GST included in these prices?",
    "No — all prices are exclusive of GST. You will be invoiced as a SaaS subscription with GST added at the applicable rate.",
  ],
  [
    "How does the annual discount work?",
    "Paying yearly saves 15%, applied upfront. For example, Professional is ₹61,190 per year instead of ₹71,988 paid monthly — a saving of ₹10,798.",
  ],
  [
    "Do you train AI models on our clients' data?",
    "No. Every extracted number carries a source-traceable audit trail back to the original document, each firm's data is kept separate, and your clients' documents are never used to train AI models.",
  ],
  [
    "Can we switch to one flat price for the firm instead?",
    "Yes — at renewal, or by talking to us. Some partners prefer a single budget number; we will quote one that fits your book size.",
  ],
];
