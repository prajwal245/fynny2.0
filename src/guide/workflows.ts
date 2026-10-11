/**
 * Resource & Product Guide content. Every rule, threshold and timing here is
 * taken from the running product (engine config, extract pipeline, Indian
 * rule checks) or measured in the retest packs; nothing is aspirational.
 */

export type Category = "agentic" | "tax" | "recon" | "erp";

export const CATEGORIES: { key: "all" | Category; label: string }[] = [
  { key: "all", label: "All Documentation" },
  { key: "agentic", label: "Agentic AI Workflows" },
  { key: "tax", label: "CA & Tax Compliance" },
  { key: "recon", label: "Bank & Ledger Reconciliation" },
  { key: "erp", label: "ERP & Tally Integration" },
];

export type NodeKind = "source" | "ai" | "rule" | "decision" | "human" | "output";

export interface FlowNode {
  id: string;
  label: string;
  kind: NodeKind;
  x: number;
  y: number;
  /** Shown when the node is clicked: the heuristic behind it, in plain words. */
  note: string;
}

export interface FlowEdge {
  from: string;
  to: string;
  label?: string;
  /** An exception path: leads to a person instead of straight through. */
  exception?: boolean;
}

export interface Workflow {
  id: string;
  title: string;
  category: Category;
  summary: string;
  /** 3–4 steps for the card's inline pipeline. */
  pipeline: string[];
  logic: "Autonomous agent" | "Human-in-the-loop" | "Rule engine" | "Agent + partner sign-off";
  /** The trust gate actually applied, not a marketing accuracy figure. */
  confidence: string;
  timing: string;
  keywords: string[];
  inputs: { label: string; detail: string }[];
  rules: string[];
  exceptions: { trigger: string; outcome: string }[];
  nodes: FlowNode[];
  edges: FlowEdge[];
  before: { columns: string[]; rows: string[][] };
  after: { columns: string[]; rows: string[][] };
}

export const WORKFLOWS: Workflow[] = [
  {
    id: "extract",
    title: "Document intake and extraction",
    category: "agentic",
    summary:
      "Every file that arrives (upload, Gmail or WhatsApp) is identified, read into structured lines and scored. Only lines the agent is unsure of go to a person.",
    pipeline: ["Data ingestion", "Format detection", "Parser / AI reader", "Confidence gate"],
    logic: "Human-in-the-loop",
    confidence: "Lines below 75% confidence go to Review",
    timing: "Seconds per file; AI reads stop by 35 s",
    keywords: ["upload", "pdf", "excel", "csv", "photo", "scan", "ocr", "review queue", "confidence", "hdfc statement", "icici", "sbi", "axis", "kotak"],
    inputs: [
      { label: "Formats", detail: "CSV, Excel (.xls/.xlsx), Tally XML, text PDFs, scanned PDFs and photos (OCR), up to 25 MB" },
      { label: "Bank layouts", detail: "Header row found within the first 40 rows: date, narration, debit/credit or a signed amount, balance" },
      { label: "Client context", detail: "The client's name and GSTIN state code are given to the AI so money in/out and IGST vs CGST/SGST are read from the client's side" },
    ],
    rules: [
      "Spreadsheets and Tally exports are read in code; the AI only reads PDFs and photos that have no table layout.",
      "The AI may never invent an amount or date: every amount it returns must appear in the source text, or the line goes to Review.",
      "Totals, opening/closing balance and carried-forward lines are skipped; multi-line narrations are joined.",
      "Identical lines inside one file are kept once; the copy goes to Review for a person to confirm.",
      "The same file sent twice is recognised by its content hash and adds nothing.",
      "Lessons from earlier corrections for this client are applied first (only for distinctive party names).",
    ],
    exceptions: [
      { trigger: "Confidence below 75%", outcome: "Line waits in the Review Queue; nothing becomes a transaction until confirmed" },
      { trigger: "Foreign currency or unsigned single amount column", outcome: "Sent to Review with the reason" },
      { trigger: "Password-protected PDF", outcome: "Marked Failed with a plain request for an unlocked copy" },
      { trigger: "Server time limit reached", outcome: "Closed as Failed with Retry within 90 s; never stuck on Reading" },
    ],
    nodes: [
      { id: "in", label: "Upload / Gmail / WhatsApp", kind: "source", x: 20, y: 120, note: "Files arrive from the Documents page, a connected Gmail inbox (checked daily and on demand) or WhatsApp. Each one is stored privately under the firm and the client." },
      { id: "kind", label: "Detect format", kind: "rule", x: 230, y: 120, note: "Decided from the file's bytes, not its name: spreadsheet, delimited text, Tally XML, text PDF or image. Word files are refused with an explanation." },
      { id: "table", label: "Table parser", kind: "rule", x: 440, y: 40, note: "Finds the header row, maps date / narration / debit / credit / balance columns, reads Indian dates day-first and Indian digit grouping." },
      { id: "ai", label: "AI reader (PDF, photo)", kind: "ai", x: 440, y: 200, note: "Reads unstructured documents with Indian accounting context. Anti-hallucination check: an amount the AI returns must be printed in the source text." },
      { id: "gate", label: "Confidence ≥ 75%?", kind: "decision", x: 660, y: 120, note: "Each line is scored. At or above 0.75 it becomes a transaction; below, it waits for a person with the reason shown." },
      { id: "txn", label: "Transactions", kind: "output", x: 880, y: 60, note: "Structured bank or book lines, ready for Recon. Recon runs by itself once both sides of a month are in." },
      { id: "review", label: "Review Queue", kind: "human", x: 880, y: 190, note: "A person confirms or edits the line. The correction is remembered for this client's next month." },
    ],
    edges: [
      { from: "in", to: "kind" },
      { from: "kind", to: "table", label: "CSV / Excel / Tally" },
      { from: "kind", to: "ai", label: "PDF / photo" },
      { from: "table", to: "gate" },
      { from: "ai", to: "gate" },
      { from: "gate", to: "txn", label: "≥ 75%" },
      { from: "gate", to: "review", label: "< 75%", exception: true },
    ],
    before: {
      columns: ["Raw statement line"],
      rows: [
        ["02/07/26,NEFT CR-KAVERI FASHIONS-INV 101,N1830001,02/07/26,,118000.00,618000.00"],
        ["05/07/26,NEFT DR-OFFICE MART-STATIONERY,N1860003,05/07/26,4750.00,,613250.00"],
      ],
    },
    after: {
      columns: ["Date", "Direction", "Amount", "Party", "Reference", "Confidence"],
      rows: [
        ["2026-07-02", "in", "₹1,18,000.00", "KAVERI FASHIONS", "N1830001", "0.97"],
        ["2026-07-05", "out", "₹4,750.00", "OFFICE MART", "N1860003", "0.97"],
      ],
    },
  },
  {
    id: "recon",
    title: "Bank ↔ ledger reconciliation",
    category: "recon",
    summary:
      "Matches every bank line against the books in five stages, from exact to part payments. Anything it cannot settle with certainty becomes an exception with a reason code.",
    pipeline: ["Bank + books", "Exact & fuzzy match", "Exception checkpoint", "Reconciled ledger"],
    logic: "Autonomous agent",
    confidence: "Fuzzy match ≥ 0.82 and clear of the runner-up by 0.03",
    timing: "~0.4 s per client-month (measured)",
    keywords: ["recon", "reconciliation", "matching", "fuzzy", "part payment", "split", "bank charges", "interest", "exception", "hdfc statement"],
    inputs: [
      { label: "Bank side", detail: "Bank statement lines for the month (any supported bank layout)" },
      { label: "Books side", detail: "Tally day book / ledger lines for the same bank account and month" },
      { label: "Memory", detail: "Firm rules (bank charges, interest, tax) and learned party aliases" },
    ],
    rules: [
      "Stage 1 exact: same amount (within ₹1 or 0.1%), same reference or same party, within 3 days.",
      "Stage 1b: the only entry with the same amount within 2 days on both sides, references ignored.",
      "Stage 2 fuzzy: score = 40% amount + 25% date + 25% party name + 10% reference; matched only at ≥ 0.82 and 0.03 ahead of the next candidate.",
      "Stage 3 rules: bank charges, interest and tax payments matched to their book entries within the rule's window; learned aliases within 7 days.",
      "Stage 4 part payments: 2–3 lines from the same party adding up exactly to one entry, only when the split is unambiguous.",
      "A tie is never guessed: it becomes a 'Duplicate suspect' exception for a person.",
    ],
    exceptions: [
      { trigger: "No entry with a comparable amount", outcome: "No candidate (e.g. bank charges not yet booked)" },
      { trigger: "Same party, amount differs", outcome: "Partial payment suspect (bank < books) or Amount mismatch (bank > books, overpayment)" },
      { trigger: "Amount and date agree, references differ", outcome: "Reference mismatch" },
      { trigger: "Two candidates score within 0.03", outcome: "Duplicate suspect: pick manually" },
    ],
    nodes: [
      { id: "bank", label: "Bank lines", kind: "source", x: 20, y: 50, note: "Statement lines dated in the month." },
      { id: "books", label: "Book entries", kind: "source", x: 20, y: 190, note: "Tally lines for the same month; Debit in the bank ledger = money in." },
      { id: "exact", label: "Stage 1 / 1b exact", kind: "rule", x: 240, y: 120, note: "Same amount within ₹1 or 0.1%, same reference or party, within 3 days; or the only same-amount pair within 2 days." },
      { id: "fuzzy", label: "Stage 2 fuzzy score", kind: "rule", x: 450, y: 120, note: "Weighted score: amount 40%, date 25%, party name 25%, reference 10%. Auto-match at ≥ 0.82 only when 0.03 ahead of the runner-up." },
      { id: "rules", label: "Stage 3 rules · 4 splits", kind: "rule", x: 660, y: 120, note: "Bank charges / interest / tax rules, learned aliases (7-day window), then exact 2–3-line part payments from the same party." },
      { id: "matched", label: "Matched → MIS", kind: "output", x: 880, y: 50, note: "Only matched lines are allowed into the MIS." },
      { id: "ex", label: "Exception Queue", kind: "human", x: 880, y: 190, note: "Each unmatched line carries a reason code and the best candidates. A person matches, ignores or marks it reconciled elsewhere, always with a note." },
    ],
    edges: [
      { from: "bank", to: "exact" },
      { from: "books", to: "exact" },
      { from: "exact", to: "fuzzy" },
      { from: "fuzzy", to: "rules" },
      { from: "exact", to: "matched" },
      { from: "fuzzy", to: "matched", label: "≥ 0.82" },
      { from: "rules", to: "matched" },
      { from: "rules", to: "ex", label: "unsettled", exception: true },
    ],
    before: {
      columns: ["Side", "Date", "Narration", "Amount"],
      rows: [
        ["Bank", "06-07", "NEFT CR-SUNRISE TRADERS-PART 1", "₹1,00,000.00"],
        ["Bank", "07-07", "NEFT CR-SUNRISE TRADERS-PART 2", "₹50,000.00"],
        ["Books", "06-07", "Sunrise Traders · Receipt RC-103", "₹1,50,000.00"],
        ["Bank", "20-07", "BANK CHARGES GST ON CHG", "−₹590.00"],
      ],
    },
    after: {
      columns: ["Bank line(s)", "Book entry", "Stage", "Result"],
      rows: [
        ["PART 1 + PART 2", "RC-103", "4 · split", "Matched ₹1,50,000.00"],
        ["BANK CHARGES", "—", "—", "Exception · No candidate"],
      ],
    },
  },
  {
    id: "exceptions",
    title: "Exception decisions and agent learning",
    category: "agentic",
    summary:
      "People decide what the agent could not. Every decision needs a note, can be undone, and teaches the Recon agent to propose the same decision next month.",
    pipeline: ["Exception", "Person decides", "Audit trail", "Learned proposal"],
    logic: "Human-in-the-loop",
    confidence: "Nothing learned is applied without a person confirming",
    timing: "One click from any unmatched line",
    keywords: ["exception", "ignore", "reconciled elsewhere", "match with difference", "undo", "memory", "learning", "alias"],
    inputs: [
      { label: "Exception", detail: "Line, reason code, best candidates (already-matched entries are never offered)" },
      { label: "Decision", detail: "Match (one or several entries), Match with difference, Ignore, or Reconciled elsewhere" },
    ],
    rules: [
      "A match with a difference is never silent: the difference is shown and a note is required.",
      "Ignore and Reconciled elsewhere ask for confirmation and a note; Undo is available right after.",
      "The note is kept on the audit trail and in the Activity log.",
      "Ignore / Reconciled elsewhere are remembered by side, direction and narration pattern for this client.",
      "Next month the same kind of line shows 'Learned' with who decided, when and the note; one click applies it after a person confirms.",
      "Party aliases are learned only from clean one-to-one matches with distinctive names; generic words (salary, against inv) never become rules.",
    ],
    exceptions: [
      { trigger: "Chosen entry already matched elsewhere", outcome: "Refused with the reason shown in the drawer" },
      { trigger: "Decision undone", outcome: "Line reopens and what it taught is taken back" },
    ],
    nodes: [
      { id: "ex", label: "Open exception", kind: "source", x: 20, y: 120, note: "Shown once per decision: a failed bank line and its book twin count as one." },
      { id: "prec", label: "Learned before?", kind: "decision", x: 240, y: 120, note: "Looks up a remembered decision for the same side, direction and narration pattern." },
      { id: "prop", label: "Proposal with source", kind: "rule", x: 460, y: 40, note: "Shows who decided, when and the note. Nothing is applied until a person presses Use the same decision and confirms." },
      { id: "person", label: "Person decides + note", kind: "human", x: 460, y: 200, note: "Match, Match with difference, Ignore or Reconciled elsewhere. A note is required where judgement is involved." },
      { id: "audit", label: "Audit trail + memory", kind: "output", x: 700, y: 120, note: "Decision, note and person stored; Activity log entry written; memory updated (or reversed on Undo)." },
    ],
    edges: [
      { from: "ex", to: "prec" },
      { from: "prec", to: "prop", label: "yes" },
      { from: "prec", to: "person", label: "no" },
      { from: "prop", to: "person", label: "confirm" },
      { from: "person", to: "audit" },
    ],
    before: {
      columns: ["Month", "Line", "State"],
      rows: [["Jul 2026", "BANK CHARGES GST ON CHG −₹590.00", "Open · No candidate"]],
    },
    after: {
      columns: ["Month", "Line", "State"],
      rows: [
        ["Jul 2026", "BANK CHARGES GST ON CHG −₹590.00", "Reconciled elsewhere · note: JV-14"],
        ["Aug 2026", "BANK CHARGES GST ON CHG −₹590.00", "Learned · proposal shown"],
      ],
    },
  },
  {
    id: "tally",
    title: "Tally day book and ledger import",
    category: "erp",
    summary:
      "Tally XML day books and CSV/Excel ledger exports are read as the books side, with Tally's debit/credit convention handled correctly whatever the file is called.",
    pipeline: ["Tally export", "Voucher detection", "Direction from Vch Type", "Books side"],
    logic: "Rule engine",
    confidence: "Deterministic: no AI involved",
    timing: "Under a second per file",
    keywords: ["tally", "erp", "day book", "ledger", "vch type", "voucher", "xml", "debit credit"],
    inputs: [
      { label: "Tally XML", detail: "Day book export (vouchers with date, type, number, party, amount)" },
      { label: "Ledger CSV / Excel", detail: "Date, Particulars, Vch Type, Vch No., Debit, Credit" },
    ],
    rules: [
      "Voucher columns (Vch Type or Vch No.) mean the file is the books, even if its name says 'bank'.",
      "In a bank ledger, Debit = money received and Credit = money paid (the opposite of a bank statement).",
      "Receipt and Sales vouchers are money in; Payment and Purchase are money out; the voucher type wins when present.",
      "The party comes from Particulars, so book entries show the party, not the narration.",
    ],
    exceptions: [
      { trigger: "A line without a date or amount", outcome: "Sent to Review" },
      { trigger: "File re-filed by a person as Bank", outcome: "Read again on that side; the choice is kept" },
    ],
    nodes: [
      { id: "file", label: "Tally export", kind: "source", x: 20, y: 120, note: "XML day book or a ledger exported to CSV/Excel." },
      { id: "vch", label: "Voucher columns?", kind: "decision", x: 240, y: 120, note: "Vch Type or Vch No. present: it is the books, regardless of the file name." },
      { id: "dir", label: "Debit = in · Vch Type wins", kind: "rule", x: 470, y: 120, note: "Receipt/Sales → in; Payment/Purchase → out; otherwise Debit = in for the bank ledger." },
      { id: "books", label: "Books side", kind: "output", x: 700, y: 120, note: "Ready to reconcile against the bank statement for the month." },
    ],
    edges: [
      { from: "file", to: "vch" },
      { from: "vch", to: "dir", label: "yes" },
      { from: "dir", to: "books" },
    ],
    before: {
      columns: ["Date", "Particulars", "Vch Type", "Vch No.", "Debit", "Credit"],
      rows: [
        ["02-07-2026", "Kaveri Fashions", "Receipt", "RC-101", "118000.00", ""],
        ["05-07-2026", "Office Mart", "Payment", "PY-201", "", "4450.00"],
      ],
    },
    after: {
      columns: ["Side", "Date", "Direction", "Amount", "Party"],
      rows: [
        ["books", "2026-07-02", "in", "₹1,18,000.00", "Kaveri Fashions"],
        ["books", "2026-07-05", "out", "₹4,450.00", "Office Mart"],
      ],
    },
  },
  {
    id: "gst",
    title: "GST registers: sales, purchase and GSTR-2B",
    category: "tax",
    summary:
      "GST registers are summarised with their totals and checked under GST rules in code. They are kept out of bank reconciliation so nothing is counted twice.",
    pipeline: ["Register upload", "Register detection", "GST rule checks", "Summary + flags"],
    logic: "Rule engine",
    confidence: "Checks run in code; failures are flagged, never auto-corrected",
    timing: "Under a second per file",
    keywords: ["gst", "gstin", "gstr-2b", "2b vs purchase", "purchase register", "sales register", "gstr-1", "igst", "cgst", "sgst", "itc"],
    inputs: [
      { label: "Columns", detail: "Invoice No, Date, Party, GSTIN, Taxable Value, CGST, SGST, IGST, Invoice Value" },
      { label: "Types", detail: "Sales (GSTR-1) register, purchase register, invoice register, GSTR-2B" },
    ],
    rules: [
      "GSTIN check character verified with the GSTN algorithm (base 36, alternating weights).",
      "Each invoice is either inter-state (IGST only) or intra-state (equal CGST and SGST).",
      "Tax ÷ taxable value must be a GST rate: 0, 5, 18 or 40%, plus 12 and 28% for periods before 22 Sep 2025 and special rates (0.1, 0.25, 1.5, 3, 6%).",
      "Totals: taxable value, IGST, CGST, SGST and invoice total; a closing Total row is never added twice.",
      "GSTR-2B vs purchase register: both are read and checked; line-by-line 2B matching is not automated yet, so compare the totals shown on each file.",
    ],
    exceptions: [
      { trigger: "GSTIN fails the check character", outcome: "Flagged with the invoice number: mistyped or not genuine" },
      { trigger: "IGST and CGST/SGST on one invoice, or CGST ≠ SGST", outcome: "Flagged for review" },
      { trigger: "Tax is not a GST rate", outcome: "Flagged with the effective rate" },
    ],
    nodes: [
      { id: "file", label: "GST register", kind: "source", x: 20, y: 120, note: "Recognised from its header (GSTIN, taxable value, CGST/SGST/IGST), not from its name." },
      { id: "sum", label: "Summarise totals", kind: "rule", x: 240, y: 120, note: "Taxable, IGST, CGST, SGST and invoice totals; kept as a register, never as bank lines." },
      { id: "chk", label: "GSTIN · rate · IGST/CGST", kind: "rule", x: 470, y: 120, note: "Three checks under GST rules, done in code." },
      { id: "ok", label: "Register summary", kind: "output", x: 700, y: 50, note: "Shown on the document with each check and its result." },
      { id: "flag", label: "Flag for a person", kind: "human", x: 700, y: 190, note: "The exact invoices that fail are listed so they can be corrected at source." },
    ],
    edges: [
      { from: "file", to: "sum" },
      { from: "sum", to: "chk" },
      { from: "chk", to: "ok", label: "pass" },
      { from: "chk", to: "flag", label: "fail", exception: true },
    ],
    before: {
      columns: ["Invoice No", "Supplier GSTIN", "Taxable", "CGST", "SGST", "IGST"],
      rows: [
        ["OM-551", "27AABCO1234M1Z…", "3771.19", "339.41", "339.40", "0"],
        ["SL-208", "29AAACS5678K1Z…", "16610.17", "0", "0", "2989.83"],
      ],
    },
    after: {
      columns: ["Check", "Result"],
      rows: [
        ["GSTIN", "OM-552 fails the check character"],
        ["IGST vs CGST/SGST", "All invoices consistent"],
        ["GST rate", "All at standard rates (18%, 12%)"],
      ],
    },
  },
  {
    id: "tds",
    title: "TDS register and section rates",
    category: "tax",
    summary:
      "TDS registers are totalled by section from the TDS deducted column and every entry is checked against the rate for its section.",
    pipeline: ["TDS register", "Section grouping", "Rate check", "Summary + due date"],
    logic: "Rule engine",
    confidence: "Rate checked per entry; 20% no-PAN rate accepted",
    timing: "Under a second per file",
    keywords: ["tds", "194c", "tds 194c", "194j", "194i", "194h", "194a", "194q", "194t", "section", "deductee", "pan", "challan"],
    inputs: [
      { label: "Columns", detail: "Deductee, PAN, Section, Amount Paid, TDS Deducted (a TDS Rate % column is recognised and never totalled)" },
    ],
    rules: [
      "The TDS total is read from TDS Deducted / TDS Amount, never from a rate or % column.",
      "194C contractors 1% (individual/HUF) or 2%; 194J professional 10% or technical 2%; 194I rent 10% (land/building) or 2% (plant); 194H 2%; 194A 10%; 194Q 0.1%; 194T 10%.",
      "From 1 April 2026 the Income-tax Act, 2025 applies; registers still use the 1961 section codes, which are read as written.",
      "TDS deducted in a month is due by the 7th of the next month (30 April for March); the MIS shows the date.",
    ],
    exceptions: [
      { trigger: "Deducted amount does not match any rate for the section", outcome: "Flagged with the effective rate (a lower-deduction certificate may explain it)" },
    ],
    nodes: [
      { id: "file", label: "TDS register", kind: "source", x: 20, y: 120, note: "Recognised from Deductee / Section / TDS columns." },
      { id: "col", label: "Pick TDS Deducted", kind: "rule", x: 240, y: 120, note: "Rate and % columns are excluded, so a 10% rate is never added up as ₹10." },
      { id: "rate", label: "Rate for section?", kind: "decision", x: 470, y: 120, note: "Deducted ÷ paid compared with the section's rates and the 20% no-PAN rate." },
      { id: "ok", label: "Totals by section", kind: "output", x: 700, y: 50, note: "TDS per section with counts." },
      { id: "flag", label: "Flag entry", kind: "human", x: 700, y: 190, note: "Entry, section and effective rate shown for checking." },
    ],
    edges: [
      { from: "file", to: "col" },
      { from: "col", to: "rate" },
      { from: "rate", to: "ok", label: "match" },
      { from: "rate", to: "flag", label: "mismatch", exception: true },
    ],
    before: {
      columns: ["Deductee", "Section", "Amount Paid", "TDS Rate %", "TDS Deducted"],
      rows: [
        ["Prime Estates", "194I", "85000", "10", "8500"],
        ["Swift Logistics", "194C", "20000", "2", "400"],
        ["Rao & Co", "194J", "96000", "10", "9600"],
      ],
    },
    after: {
      columns: ["Section", "Entries", "TDS", "Rate check"],
      rows: [
        ["194I", "1", "₹8,500.00", "10% ✓"],
        ["194C", "1", "₹400.00", "2% ✓"],
        ["194J", "1", "₹9,600.00", "10% ✓"],
        ["Total", "3", "₹18,500.00", "Due 7 Aug 2026"],
      ],
    },
  },
  {
    id: "payroll",
    title: "Payroll register: PF and ESI",
    category: "tax",
    summary:
      "Payroll sheets are summarised (gross, PF, ESI, PT, TDS, net) and each employee's PF and ESI is checked. Salary payments themselves are reconciled from the bank.",
    pipeline: ["Payroll sheet", "Totals", "PF / ESI checks", "Summary + due date"],
    logic: "Rule engine",
    confidence: "Checked per employee",
    timing: "Under a second per file",
    keywords: ["payroll", "salary", "pf", "epf", "esi", "esic", "professional tax", "wages"],
    inputs: [{ label: "Columns", detail: "Employee, Basic, Gross, PF, ESI, Net Pay (PT and TDS optional)" }],
    rules: [
      "PF is 12% of basic (or of the ₹15,000 ceiling); a combined employee + employer column at 24% is also accepted.",
      "ESI applies only when gross wages are up to ₹21,000 a month: employee 0.75%, employer 3.25% (4% combined).",
      "PF and ESI for the month are due by the 15th of the next month; the MIS shows the date.",
    ],
    exceptions: [{ trigger: "ESI deducted above the ₹21,000 wage limit, or PF not 12% of basic", outcome: "Employee flagged with the amounts" }],
    nodes: [
      { id: "file", label: "Payroll sheet", kind: "source", x: 20, y: 120, note: "Recognised from employee and pay columns." },
      { id: "sum", label: "Totals", kind: "rule", x: 240, y: 120, note: "Gross, PF, ESI, PT, TDS and net pay." },
      { id: "chk", label: "PF 12% · ESI ≤ ₹21,000", kind: "decision", x: 470, y: 120, note: "Checked per employee." },
      { id: "ok", label: "Payroll summary", kind: "output", x: 700, y: 50, note: "Kept for reference; salary, PF and ESI payments are matched from the bank." },
      { id: "flag", label: "Flag employee", kind: "human", x: 700, y: 190, note: "Name and amounts shown." },
    ],
    edges: [
      { from: "file", to: "sum" },
      { from: "sum", to: "chk" },
      { from: "chk", to: "ok", label: "pass" },
      { from: "chk", to: "flag", label: "fail", exception: true },
    ],
    before: {
      columns: ["Employee", "Basic", "Gross", "PF", "ESI"],
      rows: [
        ["Anita Desai", "12000", "20000", "1440", "150"],
        ["Rahul Menon", "30000", "52000", "1800", "390"],
      ],
    },
    after: {
      columns: ["Check", "Result"],
      rows: [
        ["PF", "12% of basic for all employees ✓"],
        ["ESI", "Rahul Menon: ₹390 on ₹52,000 gross, above the ₹21,000 limit"],
      ],
    },
  },
  {
    id: "gateway",
    title: "Payment gateway settlements (Razorpay, Cashfree, PayU)",
    category: "recon",
    summary:
      "Gateways pay the bank net of fees. With the settlement report uploaded, each payout is grossed up in the MIS: revenue at what customers paid, fees and GST on fees as expenses.",
    pipeline: ["Settlement report", "Payout match", "Gross-up", "MIS revenue & fees"],
    logic: "Rule engine",
    confidence: "Payout must match net within ₹1 and 5 days",
    timing: "Part of MIS generation",
    keywords: ["razorpay", "cashfree", "payu", "stripe", "gateway", "settlement", "mdr", "fees", "gross up"],
    inputs: [{ label: "Columns", detail: "Payment ID, Amount, Fee, Tax, Settled Amount, Settlement ID, Settled At (without a settlement id the file totals are used)" }],
    rules: [
      "The report is kept as a register: orders are never added to the bank side, so nothing is counted twice.",
      "A bank receipt equal to a settlement's net amount (±₹1) within 5 days is grossed up.",
      "GST on gateway fees must be 18% of the fees; this is checked in code.",
    ],
    exceptions: [{ trigger: "No bank payout matches a settlement", outcome: "Revenue stays at the net amount and nothing is grossed up" }],
    nodes: [
      { id: "file", label: "Settlement report", kind: "source", x: 20, y: 120, note: "Recognised from settlement / fee columns or the gateway's name." },
      { id: "net", label: "Net per settlement", kind: "rule", x: 240, y: 120, note: "Gross − fee − GST per settlement id (or for the whole file)." },
      { id: "match", label: "Payout in bank?", kind: "decision", x: 470, y: 120, note: "Same net amount within ₹1, within 5 days, with fees > 0." },
      { id: "mis", label: "Gross revenue + fees", kind: "output", x: 700, y: 120, note: "Revenue includes the fee and GST the gateway kept; the same amount is booked as gateway fees and GST on fees." },
    ],
    edges: [
      { from: "file", to: "net" },
      { from: "net", to: "match" },
      { from: "match", to: "mis", label: "yes" },
    ],
    before: {
      columns: ["Payment ID", "Amount", "Fee", "Tax", "Settled"],
      rows: [
        ["pay_A1", "30000", "600", "108", "29292"],
        ["pay_A2", "20000", "400", "72", "19528"],
      ],
    },
    after: {
      columns: ["MIS line", "Amount"],
      rows: [
        ["Revenue (gross collected)", "₹50,000.00"],
        ["Gateway fees", "₹1,000.00"],
        ["GST on fees (18%)", "₹180.00"],
        ["Bank payout (net)", "₹48,820.00"],
      ],
    },
  },
  {
    id: "mis",
    title: "MIS generation and partner sign-off",
    category: "agentic",
    summary:
      "The Narrate agent writes the monthly MIS from matched transactions only. Figures are computed in code; AI insights must cite real transaction ids; a partner signs off.",
    pipeline: ["Matched lines", "Figures in code", "Cited AI insights", "Partner sign-off"],
    logic: "Agent + partner sign-off",
    confidence: "Every insight must cite transaction ids and quote given figures",
    timing: "~14 s per MIS (measured)",
    keywords: ["mis", "report", "narrate", "insights", "sign off", "pdf", "excel", "variance", "statutory"],
    inputs: [{ label: "Data", detail: "Matched bank lines for the month, prior month for variances, registers for gateway gross-up" }],
    rules: [
      "Revenue and expenses are operating flows only; GST/TDS payments, advances, loans and own-account transfers are shown separately.",
      "Bank and gateway charges (with their GST) are expenses, not tax payments.",
      "Unmatched lines are excluded and the report says how many.",
      "AI insights that cite unknown ids or new numbers are rejected; rule-based insights stand in.",
      "Statutory dates follow from the month's payments: TDS by the 7th, PF/ESI by the 15th, GSTR-3B by the 20th.",
      "Sign-off asks for confirmation and lists anything still open; it can be reopened with a reason.",
    ],
    exceptions: [
      { trigger: "Open exceptions or review rows at sign-off", outcome: "Listed; the partner must acknowledge them to sign off" },
      { trigger: "Partner sends it back", outcome: "Correction requested with the note; the preparer fixes and regenerates" },
    ],
    nodes: [
      { id: "m", label: "Matched lines only", kind: "source", x: 20, y: 120, note: "Only reconciled data can reach the MIS." },
      { id: "b", label: "Buckets in code", kind: "rule", x: 240, y: 120, note: "Revenue, expenses, taxes, advances, loans, transfers; gateway gross-up applied." },
      { id: "ai", label: "AI insights + citations", kind: "ai", x: 470, y: 120, note: "Indian CA context; every statement must cite transaction ids; validated before it is shown." },
      { id: "p", label: "Partner sign-off", kind: "human", x: 700, y: 120, note: "Accept, or request a correction with a note. Open items must be acknowledged." },
      { id: "out", label: "PDF · Excel", kind: "output", x: 910, y: 120, note: "Exports match the screen: ₹ with paise, status, other flows, statutory dates." },
    ],
    edges: [
      { from: "m", to: "b" },
      { from: "b", to: "ai" },
      { from: "ai", to: "p" },
      { from: "p", to: "out", label: "signed off" },
    ],
    before: {
      columns: ["Bank line", "Amount"],
      rows: [
        ["GST PMT CPIN 26070012345", "−₹1,12,500.00"],
        ["BANK CHARGES GST ON CHG", "−₹590.00"],
        ["NEFT DR-MEERA TEXTILES-ADVANCE", "−₹1,50,000.00"],
      ],
    },
    after: {
      columns: ["MIS bucket", "Amount"],
      rows: [
        ["Taxes paid (GST, TDS)", "₹1,12,500.00"],
        ["Expenses · bank charges", "₹590.00"],
        ["Advances paid", "₹1,50,000.00"],
      ],
    },
  },
  {
    id: "chaser",
    title: "Document chaser",
    category: "agentic",
    summary:
      "When a month is missing a statement or the books, the Chaser follows up with the client by email or WhatsApp and closes itself when the document arrives.",
    pipeline: ["Missing side", "Chase created", "Follow-ups", "Auto-close on arrival"],
    logic: "Autonomous agent",
    confidence: "Closes only when a matching document arrives",
    timing: "Follow-ups on the firm's chase day",
    keywords: ["chaser", "follow up", "reminder", "missing bank statement", "whatsapp", "email", "escalation"],
    inputs: [{ label: "Client contact", detail: "Email and/or WhatsApp number from the client record" }],
    rules: [
      "Recon tells you which side is missing; Ask the client creates a chase with the right request in one click.",
      "Follow-ups go out by email; WhatsApp opens a pre-written message.",
      "A document from the client for that request closes the chase automatically and logs why.",
    ],
    exceptions: [{ trigger: "No reply after the follow-ups", outcome: "Escalated and shown in Needs you" }],
    nodes: [
      { id: "gap", label: "Recon: side missing", kind: "source", x: 20, y: 120, note: "Bank or books for the month not in yet." },
      { id: "c", label: "Chase created", kind: "rule", x: 240, y: 120, note: "Request, contact and due date filled from the client." },
      { id: "f", label: "Follow-ups", kind: "rule", x: 470, y: 120, note: "Email follow-ups on schedule; WhatsApp message ready to send." },
      { id: "d", label: "Document arrives?", kind: "decision", x: 700, y: 120, note: "Matched by client and request type." },
      { id: "close", label: "Auto-closed", kind: "output", x: 910, y: 50, note: "Logged with the document that closed it." },
      { id: "esc", label: "Escalated", kind: "human", x: 910, y: 190, note: "A person calls the client." },
    ],
    edges: [
      { from: "gap", to: "c" },
      { from: "c", to: "f" },
      { from: "f", to: "d" },
      { from: "d", to: "close", label: "yes" },
      { from: "d", to: "esc", label: "no reply", exception: true },
    ],
    before: { columns: ["Client", "Month", "Bank", "Books"], rows: [["Retest R3 Pvt Ltd", "Jul 2026", "17 lines", "—"]] },
    after: { columns: ["Chase", "Status"], rows: [["Books (Tally day book or ledger) for July 2026", "Closed: R02 arrived"]] },
  },
];

export const KIND_LABEL: Record<NodeKind, string> = {
  source: "Data source",
  ai: "AI step",
  rule: "Rule logic",
  decision: "Decision",
  human: "Human review",
  output: "Output",
};
