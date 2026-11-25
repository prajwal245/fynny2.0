/**
 * What each review needs, who holds it, and what is still missing.
 *
 * The rule: a check never shows "passed" on data it does not have. Every check names the inputs it needs; with one missing it is
 * BLOCKED, waiting for that input, and the missing inputs become a request list per client. Data that arrives late re-opens the checks it unblocks.
 *
 * Three packs, collected once per client-year, every month, and at year end. Pure code: the server gathers what has arrived.
 */
export type Pack = "onboarding" | "monthly" | "year_end";
export type Holder = "client" | "tally" | "bank" | "gst_portal" | "it_portal" | "lender" | "party";

export const PACKS: { key: Pack; label: string; when: string }[] = [
  { key: "onboarding", label: "Year onboarding", when: "Once per client and year" },
  { key: "monthly", label: "Monthly", when: "After each GSTR-3B is filed" },
  { key: "year_end", label: "Year end", when: "Before the audit review" },
];

export const HOLDER_LABEL: Record<Holder, string> = {
  client: "Client or previous auditor", tally: "Tally", bank: "Bank", gst_portal: "GST portal", it_portal: "Income-tax portal", lender: "Lender", party: "Parties",
};

export interface InputDef {
  key: string; label: string; pack: Pack; holder: Holder;
  /** Where to get it, in the words a person needs. */
  how: string;
  /** The same ask in words for the person who holds it, used in the message to the client. Falls back to `how`. */
  ask?: string;
  /** Shown for an input that only some clients have. */
  conditional?: string;
}

export const INPUTS: InputDef[] = [
  // Year onboarding
  { key: "audited_statements", label: "Last year's signed audited statements, with notes and schedules", pack: "onboarding", holder: "client", how: "From the client or the previous auditor: the signed Balance Sheet, Profit and Loss and every note and schedule (Excel if they have it).", ask: "the signed Balance Sheet and Profit and Loss, with every note and schedule (Excel if you have it)" },
  { key: "asset_register", label: "Fixed asset register with put-to-use dates", pack: "onboarding", holder: "client", how: "From the client: each asset with cost, date put to use, the useful life under the Companies Act and the Income-tax block rate.", ask: "each fixed asset with its cost, the date it was put to use, its useful life under the Companies Act and its Income-tax block rate" },
  { key: "related_parties", label: "Related-party list", pack: "onboarding", holder: "client", how: "From the directors' or partners' declarations: names, PAN and the relationship.", ask: "the names, PAN and relationship of the directors' or partners' related parties, from their declarations" },
  { key: "udyam_details", label: "Suppliers' Udyam details", pack: "onboarding", holder: "client", how: "From the suppliers' Udyam certificates, or the client's vendor onboarding file.", ask: "the Udyam registration number of each supplier, or your vendor file that has them" },
  { key: "tb_opening", label: "Closing Trial Balance of the previous year", pack: "onboarding", holder: "tally", how: "Tally: Display, Trial Balance, ledger-wise, as at 31 March of the previous year (the closing balances that open this year). Export to Excel." },
  { key: "ledger_masters", label: "Ledger masters with GSTIN and PAN", pack: "onboarding", holder: "tally", how: "Tally: export the ledger masters with group, GSTIN, PAN and the bill-wise flag." },
  { key: "billwise_outstanding", label: "Bill-wise outstanding", pack: "onboarding", holder: "tally", how: "Tally: Outstandings, Receivables and Payables, for the parties kept bill-wise.", conditional: "Only where bill-wise is on" },
  // Monthly
  { key: "bank_statements", label: "Bank statements", pack: "monthly", holder: "bank", how: "Every bank account for the month, as the PDF or Excel the bank gives.", ask: "the statement of every bank account for the month (PDF or Excel)" },
  { key: "loan_statements", label: "CC, OD and loan statements", pack: "monthly", holder: "bank", how: "The cash-credit, overdraft and loan account statements for the month.", ask: "the statements of your CC, OD and loan accounts for the month", conditional: "Only where the client has them" },
  { key: "day_book", label: "Day Book", pack: "monthly", holder: "tally", how: "Tally: Display, Day Book, for the month. Export to Excel." },
  { key: "registers", label: "Sales and purchase registers", pack: "monthly", holder: "tally", how: "Tally: Sales Register and Purchase Register for the month, with the GST columns." },
  { key: "gst_ledgers", label: "GST ledgers and the set-off journal", pack: "monthly", holder: "tally", how: "Tally: the Input, Output and RCM ledgers, and the journal that sets off the tax." },
  { key: "gstr1", label: "GSTR-1", pack: "monthly", holder: "gst_portal", how: "GST portal: Returns, GSTR-1, download the filed return after it is filed." },
  { key: "gstr3b", label: "GSTR-3B", pack: "monthly", holder: "gst_portal", how: "GST portal: Returns, GSTR-3B, download the filed return (the annual Excel works)." },
  { key: "gstr2b", label: "GSTR-2B", pack: "monthly", holder: "gst_portal", how: "GST portal: Returns, GSTR-2B, download the month's Excel." },
  { key: "ims", label: "IMS status", pack: "monthly", holder: "gst_portal", how: "GST portal: Invoice Management System, download the accepted, rejected and pending report." },
  { key: "credit_ledger", label: "Electronic credit ledger", pack: "monthly", holder: "gst_portal", how: "GST portal: Services, Ledgers, Electronic Credit Ledger, for the year to date." },
  { key: "cash_ledger", label: "Electronic cash ledger", pack: "monthly", holder: "gst_portal", how: "GST portal: Services, Ledgers, Electronic Cash Ledger, for the year to date." },
  { key: "challans", label: "Challans and filing status", pack: "monthly", holder: "gst_portal", how: "GST portal: Challan history and the return filing status, for the whole year so far." },
  // Year end
  { key: "form_26as", label: "Form 26AS", pack: "year_end", holder: "it_portal", how: "Income-tax portal or TRACES: Annual Tax Statement for the year, as the PDF." },
  { key: "ais", label: "AIS", pack: "year_end", holder: "it_portal", how: "Income-tax portal: Annual Information Statement, download the Excel." },
  { key: "tax_challans", label: "Advance tax and self-assessment challans", pack: "year_end", holder: "it_portal", how: "Income-tax portal: e-Pay Tax, payment history for the year." },
  { key: "interest_certificates", label: "Interest certificates", pack: "year_end", holder: "lender", how: "From each lender: the interest certificate for the year.", ask: "the interest certificate for the year from each lender", conditional: "Only where the client has loans" },
  { key: "repayment_schedules", label: "Repayment schedules", pack: "year_end", holder: "lender", how: "From each lender: the current repayment schedule.", ask: "the current repayment schedule from each lender", conditional: "Only where the client has loans" },
  { key: "balance_confirmations", label: "Balance confirmations from parties", pack: "year_end", holder: "party", how: "Ask the main debtors, creditors and lenders to confirm their balance at year end." },
];

export const inputDef = (key: string) => INPUTS.find((i) => i.key === key);

export interface CheckDef { id: string; label: string; module: string; needs: string[]; /** Opens in this part of the product. */ opensIn: string }

export const CHECKS: CheckDef[] = [
  { id: "recon", label: "Bank reconciliation", module: "Reconciliation", needs: ["bank_statements", "day_book"], opensIn: "recon" },
  { id: "loans", label: "Loan and CC statement review", module: "Reconciliation", needs: ["loan_statements"], opensIn: "documents" },
  { id: "gstr1_3b", label: "GSTR-1 against GSTR-3B", module: "GST", needs: ["gstr1", "gstr3b", "registers"], opensIn: "gst" },
  { id: "itc_2b", label: "Input credit against GSTR-2B", module: "GST", needs: ["gstr2b", "gstr3b", "registers"], opensIn: "gst" },
  { id: "ims", label: "IMS status and credit at risk", module: "GST", needs: ["gstr2b", "ims"], opensIn: "gst" },
  { id: "setoff", label: "Set-off against table 6.1", module: "GST", needs: ["gstr3b", "gst_ledgers", "day_book"], opensIn: "gst" },
  { id: "credit_loop", label: "Credit ledger loop", module: "GST", needs: ["credit_ledger", "gstr3b", "tb_opening"], opensIn: "gst" },
  { id: "cash_loop", label: "Cash ledger and challans", module: "GST", needs: ["cash_ledger", "challans", "gstr3b", "day_book"], opensIn: "gst" },
  { id: "tb_integrity", label: "Trial Balance and opening balances", module: "Opening balances", needs: ["tb_opening", "ledger_masters"], opensIn: "close" },
  { id: "opening_audit", label: "Opening balances against the audit", module: "Opening balances", needs: ["audited_statements", "tb_opening"], opensIn: "close" },
  { id: "ageing", label: "Debtors and creditors ageing", module: "Ageing", needs: ["tb_opening", "day_book"], opensIn: "close" },
  { id: "ageing_billwise", label: "Ageing of bill-wise parties", module: "Ageing", needs: ["billwise_outstanding"], opensIn: "close" },
  { id: "tds_26as", label: "TDS against Form 26AS", module: "TDS", needs: ["form_26as", "tb_opening", "day_book"], opensIn: "close" },
  { id: "tax_paid", label: "Advance tax and tax paid", module: "Income tax", needs: ["tax_challans", "form_26as"], opensIn: "close" },
  { id: "msme_43bh", label: "MSME dues (section 43B(h))", module: "MSME", needs: ["udyam_details", "ledger_masters", "day_book"], opensIn: "close" },
  { id: "fixed_assets", label: "Fixed assets and depreciation", module: "Fixed assets", needs: ["asset_register", "audited_statements"], opensIn: "close" },
  { id: "related", label: "Related-party transactions", module: "Related parties", needs: ["related_parties", "day_book"], opensIn: "close" },
  { id: "loans_year", label: "Loan interest and repayment", module: "Loans", needs: ["interest_certificates", "repayment_schedules"], opensIn: "close" },
  { id: "confirmations", label: "Balance confirmations", module: "Ageing", needs: ["balance_confirmations"], opensIn: "close" },
];

/* ── state ─────────────────────────────────────────────── */

export type InputStatus = "received" | "missing" | "not_applicable";
export interface InputState { status: InputStatus; at?: string | null; by?: string | null; source?: "detected" | "marked" | "connector" | null; note?: string | null }
export type InputStates = Record<string, InputState | undefined>;

export type CheckStatus = "passed" | "failed" | "ready" | "blocked" | "not_applicable";
export interface CheckState { def: CheckDef; status: CheckStatus; waitingFor: InputDef[] }

const have = (s: InputState | undefined) => s?.status === "received" || s?.status === "not_applicable";

/**
 * "passed" needs a result that passed AND every input present. A result that exists while an input is missing is ignored: it was computed on partial data.
 * A check whose every input is marked not applicable is not applicable.
 */
export function checkState(def: CheckDef, inputs: InputStates, result?: "passed" | "failed" | null): CheckState {
  const waitingFor = def.needs.filter((k) => !have(inputs[k])).map((k) => inputDef(k)!).filter(Boolean);
  if (def.needs.every((k) => inputs[k]?.status === "not_applicable")) return { def, status: "not_applicable", waitingFor: [] };
  if (waitingFor.length) return { def, status: "blocked", waitingFor };
  if (result === "passed") return { def, status: "passed", waitingFor: [] };
  if (result === "failed") return { def, status: "failed", waitingFor: [] };
  return { def, status: "ready", waitingFor: [] };
}

export function allChecks(inputs: InputStates, results: Record<string, "passed" | "failed" | null | undefined> = {}): CheckState[] {
  return CHECKS.map((c) => checkState(c, inputs, results[c.id]));
}

export interface PackProgress { pack: Pack; received: number; notApplicable: number; missing: number; total: number; percent: number }
export function packProgress(inputs: InputStates): PackProgress[] {
  return PACKS.map(({ key }) => {
    const list = INPUTS.filter((i) => i.pack === key);
    const na = list.filter((i) => inputs[i.key]?.status === "not_applicable").length;
    const rec = list.filter((i) => inputs[i.key]?.status === "received").length;
    const applicable = list.length - na;
    return { pack: key, received: rec, notApplicable: na, missing: applicable - rec, total: list.length, percent: applicable === 0 ? 100 : Math.round((rec / applicable) * 100) };
  });
}

/** The checks that came unblocked when new data arrived: what to re-run, and what to tell the team. */
export function reopened(before: InputStates, after: InputStates): CheckState[] {
  const was = new Map(allChecks(before).map((c) => [c.def.id, c.status]));
  return allChecks(after).filter((c) => was.get(c.def.id) === "blocked" && c.status !== "blocked");
}

/** For each missing input, the checks it holds up: the reason to ask for it. */
export function whatItUnblocks(inputKey: string, inputs: InputStates): CheckDef[] {
  return CHECKS.filter((c) => c.needs.includes(inputKey) && c.needs.every((k) => k === inputKey || have(inputs[k])));
}

/** What can be asked of the client now: items that only some clients have (bill-wise, loans) wait until the team says they apply. */
export const askable = (missing: InputDef[]) => missing.filter((i) => !i.conditional);

/* ── who is asked ──────────────────────────────────────── */

export interface Plan { firmTasks: InputDef[]; clientRequests: InputDef[]; partyRequests: InputDef[] }
/**
 * Who has to act. The client is asked only for what the client really holds. The GST and income-tax portal downloads are a task for the firm when it
 * holds the login (most do); Tally exports are the firm's when the Tally connector is on, else the client's.
 */
export function requestPlan(missing: InputDef[], opts: { firmHoldsGstLogin: boolean; firmHoldsItLogin: boolean; tallyConnected: boolean }): Plan {
  const plan: Plan = { firmTasks: [], clientRequests: [], partyRequests: [] };
  for (const i of missing) {
    if (i.holder === "party") plan.partyRequests.push(i);
    else if (i.holder === "gst_portal") (opts.firmHoldsGstLogin ? plan.firmTasks : plan.clientRequests).push(i);
    else if (i.holder === "it_portal") (opts.firmHoldsItLogin ? plan.firmTasks : plan.clientRequests).push(i);
    else if (i.holder === "tally") (opts.tallyConnected ? plan.firmTasks : plan.clientRequests).push(i);
    else plan.clientRequests.push(i);
  }
  return plan;
}

/** The one message to the client: plain words, one list, one upload link, no jargon about checks. */
export function composeRequest(client: string, items: InputDef[], opts: { period?: string | null; uploadUrl?: string | null; firm?: string | null; dueOn?: string | null }): string {
  const lines = items.map((i, n) => `${n + 1}. ${i.label}${i.conditional ? ` (${i.conditional.toLowerCase()})` : ""}\n   Please send ${i.ask ?? i.how.replace(/^[^:]*: /, "").replace(/^./, (c) => c.toLowerCase())}`);
  return [
    `Hello ${client},`,
    "",
    `To complete your ${opts.period ? `${opts.period} ` : ""}books review, we need ${items.length === 1 ? "one item" : `${items.length} items`} from you:`,
    "",
    ...lines,
    "",
    opts.uploadUrl === "auto" ? "You can upload them all through the secure link that comes with this message, no login needed." : opts.uploadUrl ? `You can upload them all here, no login needed: ${opts.uploadUrl}` : "Please reply with them as attachments.",
    opts.dueOn ? `If you can send them by ${opts.dueOn}, we can finish on time.` : "",
    "",
    `Thank you${opts.firm ? `, ${opts.firm}` : ""}`,
  ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n").trim();
}

/**
 * Which file a dropped document is, by the readers' own names, so an upload ticks the right item. A report derived from the returns (the ITC 3B vs 2B report,
 * ITC claimed and utilised) is NOT the electronic credit ledger or the GSTR-3B itself, so it ticks nothing: the credit loop stays blocked on the portal's ledger.
 */
export function inputFromKind(kind: string): string | null {
  const map: Record<string, string> = {
    trial_balance: "tb_opening", ledger_masters: "ledger_masters", day_book: "day_book", gstr3b_annual: "gstr3b", gstr1_report: "gstr1", gstr2b_report: "gstr2b", gstr2b: "gstr2b",
    tally_register: "registers", tally_journals: "gst_ledgers", challans: "challans", filing_status: "challans",
    loan_statement: "loan_statements", bank_statement: "bank_statements", form_26as: "form_26as", audited_statements: "audited_statements",
  };
  return map[kind] ?? null;
}
