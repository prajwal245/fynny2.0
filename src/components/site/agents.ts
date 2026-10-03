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
    sub: "Documents classified, read and lifted into structured lines — amount, date, GSTIN, counterparty. A photo of a statement becomes rows you can work with.",
    stats: [
      ["98%", "field-level confidence shown"],
      ["4", "document types handled"],
      ["GSTIN", "validated against format"],
      ["Auto", "classification on upload"],
    ],
    useCases: [
      { t: "Bank statements", d: "PDFs and photos become dated, signed transaction rows — no retyping, no column mapping." },
      { t: "Invoices and bills", d: "Customer, number, amount and date lifted per line, with the source image kept alongside." },
      { t: "Confidence shown, not hidden", d: "Each extraction carries a confidence score. Low-confidence fields are flagged, never silently guessed." },
    ],
    outputs: ["Structured transaction rows", "Extracted invoice fields", "Source-linked document lines"],
    inputs: ["Bank statement PDFs", "Invoice photos and scans", "Expense bills"],
  },
  {
    slug: "recon",
    name: "Recon",
    footerUse: "bank matched to ledger",
    kicker: "Module 02",
    headline: "Bank lines drift to",
    italic: "ledger lines and lock",
    sub: "Bank lines drift toward ledger lines and lock. What doesn't lock stays visible — a step, not a failure. Every match is exact, then fuzzy, then your rules.",
    stats: [
      ["421", "matched in the sample run"],
      ["2", "exceptions left visible"],
      ["3-pass", "exact, fuzzy, rules"],
      ["100%", "matches traceable"],
    ],
    useCases: [
      { t: "Exact then fuzzy matching", d: "Amount and date first, then tolerance and narration similarity — only true mismatches reach you." },
      { t: "Exceptions stay visible", d: "Unmatched lines don't disappear. They queue with the reason, so month-end has no mystery balances." },
      { t: "Learns your rules", d: "Matches you confirm become rules for the next cycle, scoped strictly to your entity." },
    ],
    outputs: ["Match report with reasons", "Exception queue", "Confirmed match rules"],
    inputs: ["Extracted bank lines", "Sales and purchase ledger", "Prior match history"],
  },
  {
    slug: "narrate",
    name: "Narrate",
    footerUse: "drafts with sources attached",
    kicker: "Module 03",
    headline: "A narration writes itself",
    italic: "and clips its source",
    sub: "A narration writes itself out and clips its source document to the end. Deliberate, reviewable. Nothing posts until a human approves it.",
    stats: [
      ["Rule 42", "and peers cited inline"],
      ["1 click", "review and approve"],
      ["0", "entries posted unseen"],
      ["Draft", "status until approved"],
    ],
    useCases: [
      { t: "ITC reversals explained", d: "ITC reversed under Rule 42 — the amount, the section, and the working, in one drafted line." },
      { t: "Source clipped on", d: "Every draft carries the document it came from — GSTR-2B_Aug.pdf attached, not referenced vaguely." },
      { t: "Review before posting", d: "Drafts sit in a queue. Your review is the final step, not a formality after the fact." },
    ],
    outputs: ["Draft narrations with citations", "Source-clipped working papers", "Approval queue"],
    inputs: ["Reconciled lines", "Filing data (GSTR-2B)", "Statutory rules"],
  },
  {
    slug: "chaser",
    name: "Chaser",
    footerUse: "polite follow-ups that send themselves",
    kicker: "Module 04",
    headline: "A quiet, polite nudge",
    italic: "that sends and fades",
    sub: "Email follow-ups run on a schedule you set and stop the moment the item resolves. WhatsApp is a one-click quick-send link. Two unanswered nudges and the item escalates to you with full history.",
    stats: [
      ["Auto", "email follow-ups on schedule"],
      ["Manual", "WhatsApp via quick-send link"],
      ["Once more", "then escalates to you"],
      ["Logged", "every touch recorded"],
    ],
    useCases: [
      { t: "Automated email follow-ups", d: "Overdue requests and unpaid invoices trigger email nudges on a schedule you set. The cron runs nightly and stops automatically the moment the item is resolved." },
      { t: "WhatsApp quick-send link", d: "When email has not moved someone, a pre-composed WhatsApp message is ready in one click. The link opens with the right text already written — you send it. Full WhatsApp automation is coming in a future release." },
      { t: "Escalation when needed", d: "Two unanswered follow-ups and the item surfaces to you with the full history of what was sent, when, and who saw it. You make the call, not another automated nudge." },
    ],
    outputs: ["Sent follow-ups log", "Response tracking", "Escalation list"],
    inputs: ["Receivables ageing", "Contact details", "Follow-up schedule"],
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
      "Turn client bank statements (PDF, Excel, CSV, scans and photos) and Tally or Zoho exports into clean, dated transactions. Unsure lines go to review, never into the books.",
    keyword: "Bank statement extraction",
  },
  recon: {
    h1: "Bank reconciliation",
    h1Italic: "for CA firms",
    title: "Bank reconciliation software for CA firms",
    description:
      "Reconcile every client's bank statement to their Tally or Zoho books: exact matches, close matches within ₹1 (or 0.1%) and 3 days, then your firm's rules. Only real exceptions reach your team.",
    keyword: "Bank reconciliation",
  },
  narrate: {
    h1: "MIS reports your clients",
    h1Italic: "can trace to source",
    title: "Source-traceable MIS reports for chartered accountants",
    description:
      "Monthly MIS, bank reconciliation summaries and variance reports drafted from matched transactions only. Every number opens its source lines, and nothing goes out before partner sign-off.",
    keyword: "MIS reports",
  },
  chaser: {
    h1: "Client document collection,",
    h1Italic: "without the chasing",
    title: "Client document collection for CA practices",
    description:
      "Stop chasing clients for bank statements and bills. Polite email and WhatsApp follow-ups in your firm's name that stop the moment the document arrives.",
    keyword: "Document collection",
  },
};
