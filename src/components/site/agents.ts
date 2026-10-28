export type Agent = {
  slug: string;
  name: string;
  /** Short use-case shown next to the module name in the footer. */
  footerUse: string;
  kicker: string;
  headline: string;
  italic: string;
  sub: string;
  stats: [string, string][];
  useCases: { t: string; d: string }[];
  outputs: string[];
  inputs: string[];
};

/**
 * The four modules of the FynHelp pipeline — the same four steps the home
 * page shows: Extract, Recon, Narrate, Chaser. Nothing else ships today.
 */
export const AGENTS: Agent[] = [
  {
    slug: "extract",
    name: "Extract",
    footerUse: "documents to structured lines",
    kicker: "Module 01",
    headline: "Every document read",
    italic: "into structured lines",
    sub: "Bank statements, Tally exports, invoices and GST, TDS and payroll registers read into structured lines: date, amount, counterparty, GSTIN. Lines it is unsure of go to a review queue.",
    stats: [
      ["5", "file formats: CSV, Excel, Tally XML, PDF, photo"],
      ["GSTIN", "check digit verified"],
      ["Review", "queue for low-confidence lines"],
      ["Auto", "classification on upload"],
    ],
    useCases: [
      { t: "Bank statements", d: "PDF, CSV and Excel statements become dated, signed transaction rows, with no retyping and no column mapping." },
      { t: "Registers, checked", d: "GST and TDS registers are read as registers and checked: GSTIN check digits, TDS rates by section, and totals." },
      { t: "Confidence shown, not hidden", d: "Each line carries a confidence score. Lines below the bar wait in the Review queue for a person to confirm." },
    ],
    outputs: ["Structured transaction rows", "Checked GST and TDS registers", "Source-linked document lines"],
    inputs: ["Bank statements", "Tally day book or ledger exports", "Invoices, GST, TDS and payroll registers"],
  },
  {
    slug: "recon",
    name: "Recon",
    footerUse: "bank matched to ledger",
    kicker: "Module 02",
    headline: "Bank lines matched",
    italic: "to the books",
    sub: "Bank lines are matched to book lines in passes: exact, same-day, close, your firm’s rules, then split payments. What does not match stays visible with a reason code.",
    stats: [
      ["5", "matching passes"],
      ["Reason", "code on every exception"],
      ["Note", "required when amounts differ"],
      ["100%", "matches traceable"],
    ],
    useCases: [
      { t: "Exact, then fuzzy", d: "Amount and date first, then tolerance and narration similarity, so only real mismatches reach you." },
      { t: "Exceptions stay visible", d: "Unmatched lines queue with their reason: no candidate, amount differs, duplicate. Nothing disappears." },
      { t: "Learns from your decisions", d: "Lines your team ignores or marks reconciled are remembered for that client, with who decided and why." },
    ],
    outputs: ["Match report with reasons", "Exception queue", "Decisions remembered per client"],
    inputs: ["Extracted bank lines", "Book lines from Tally exports or a connected Zoho Books", "Your firm’s past decisions"],
  },
  {
    slug: "narrate",
    name: "Narrate",
    footerUse: "MIS with sources attached",
    kicker: "Module 03",
    headline: "A monthly MIS",
    italic: "with its sources attached",
    sub: "Builds the client’s monthly MIS from matched lines only: revenue, expenses, statutory dates and a few plain-language insights, each citing the transactions behind it. A partner signs it off.",
    stats: [
      ["Matched", "lines only, never guesses"],
      ["Every", "figure opens its source lines"],
      ["PDF", "and Excel export"],
      ["Sign-off", "by a partner"],
    ],
    useCases: [
      { t: "Figures you can open", d: "Click any number in the MIS to see the transactions behind it, with a total that ties." },
      { t: "Insights that cite", d: "Each insight names the transactions it is based on. If the data is not there, the MIS says so instead of guessing." },
      { t: "Review before it goes out", d: "A partner signs off or sends it back with a note. Nothing reaches the client unseen." },
    ],
    outputs: ["Monthly MIS report", "Cited insights", "Signed-off PDF and Excel"],
    inputs: ["Reconciled lines", "Payment gateway reports", "Statutory due dates"],
  },
  {
    slug: "chaser",
    name: "Chaser",
    footerUse: "polite follow-ups that send themselves",
    kicker: "Module 04",
    headline: "A quiet, polite nudge",
    italic: "for the missing documents",
    sub: "Email follow-ups for missing documents run on a schedule and stop the moment the item resolves. WhatsApp is a one-click quick-send link. After two unanswered follow-ups the item escalates to the partner.",
    stats: [
      ["Day 0, 3, 7", "default email schedule"],
      ["WhatsApp", "via quick-send link"],
      ["2", "follow-ups, then escalates"],
      ["Logged", "every touch recorded"],
    ],
    useCases: [
      { t: "Automated email follow-ups", d: "Ask a client for a statement once and the reminders follow on a schedule you set. They stop as soon as the document arrives." },
      { t: "WhatsApp quick-send link", d: "When email has not moved someone, a pre-written WhatsApp message opens in one click. You press send." },
      { t: "Escalation when needed", d: "After two unanswered follow-ups the item surfaces to the partner with the full history of what was sent and when." },
    ],
    outputs: ["Sent follow-ups log", "Response tracking", "Escalation list"],
    inputs: ["Documents still missing for the month", "Client contact details", "Follow-up schedule"],
  },
];

export const agentBySlug = (slug: string) => AGENTS.find((a) => a.slug === slug);

/**
 * Search titles and descriptions per module, written for how CA firms
 * search (bank reconciliation, MIS reports, document collection) rather
 * than how the product names things.
 */
export const AGENT_SEO: Record<string, { title: string; description: string; keyword: string; h1: string; h1Italic: string }> = {
  extract: {
    h1: "Bank statement extraction",
    h1Italic: "for CA firms",
    title: "Bank statement & Tally export extraction for CA firms",
    description:
      "Convert client bank statements (PDF, Excel, scans) and Tally exports or a connected Zoho Books ledger into dated transactions. Lines below 75% confidence go to review first.",
    keyword: "Bank statement extraction",
  },
  recon: {
    h1: "Bank reconciliation",
    h1Italic: "for CA firms",
    title: "Bank reconciliation software for CA firms",
    description:
      "Bank reconciliation software for CA firms in India: exact, same-day, close and split-payment matches to Tally or a connected Zoho Books. Only real exceptions reach you.",
    keyword: "Bank reconciliation",
  },
  narrate: {
    h1: "MIS reports your clients",
    h1Italic: "can trace to source",
    title: "Source-traceable MIS reports for chartered accountants",
    description:
      "MIS reporting software for CA firms in India: monthly MIS drafted from matched transactions, every figure linked to its source lines, partner sign-off.",
    keyword: "MIS reports",
  },
  chaser: {
    h1: "Client document collection,",
    h1Italic: "without the chasing",
    title: "Client document collection for CA practices",
    description:
      "Stop chasing clients for bank statements and bills. Polite email and WhatsApp follow-ups in your firm’s name that stop the moment the document arrives.",
    keyword: "Document collection",
  },
};
