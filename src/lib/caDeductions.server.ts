/**
 * Pure detection logic for the deduction & exemption engine.
 * No Supabase calls here — every check takes real client rows and returns
 * candidate findings, so the maths stays reviewable and testable.
 */

export interface BankTxn {
  id: string;
  date: string;
  description: string | null;
  category: string | null;
  amount: number | null;
  type: string;
}

export interface ItcRow {
  id: string;
  supplier_name: string | null;
  invoice_number: string | null;
  total_itc: number | null;
  itc_blocked: boolean | null;
  block_reason: string | null;
}

export interface ClientRow {
  client_name: string;
  entity_type: string | null;
  dpiit_number: string | null;
  incorporation_date: string | null;
}

export interface WorkingPaperRow {
  content: unknown;
}

export interface Evidence {
  type: string;
  [k: string]: unknown;
}

export interface Candidate {
  provision: string;
  provision_label: string;
  category: string;
  estimated_benefit: number;
  confidence: "high" | "medium" | "low";
  evidence: Evidence[];
  explanation: string;
  action_required: string;
}

const TAX_RATE = 0.3;

export const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const round = (n: number) => Math.round(n * 100) / 100;

const hasAny = (text: string | null | undefined, words: string[]) => {
  const t = (text ?? "").toLowerCase();
  return words.some((w) => t.includes(w));
};

const inr = (n: number) => `Rs ${Math.round(n).toLocaleString("en-IN")}`;

/** "YYYY-MM" -> { from, to } ISO dates covering the whole month. */
export function periodRange(period: string): { from: string; to: string } {
  const m = /^(\d{4})-(\d{2})$/.exec(period.trim());
  const now = new Date();
  const year = m ? Number(m[1]) : now.getUTCFullYear();
  const month = m ? Number(m[2]) - 1 : now.getUTCMonth();
  const from = new Date(Date.UTC(year, month, 1));
  const to = new Date(Date.UTC(year, month + 1, 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

/** Previous month of a "YYYY-MM" period, same format. */
export function priorPeriod(period: string): string {
  const { from } = periodRange(period);
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** GST filing period key (MMYYYY) for a "YYYY-MM" period. */
export function gstFilingPeriod(period: string): string {
  const { from } = periodRange(period);
  return `${from.slice(5, 7)}${from.slice(0, 4)}`;
}

const SALARY_WORDS = ["salary", "payroll", "wages", "stipend"];
const DONATION_WORDS = ["donation", "donate", "ngo", "trust", "pm cares", "relief fund", "charitable"];
const CAPEX_WORDS = ["laptop", "equipment", "machinery", "vehicle", "computer", "server", "furniture", "plant"];

const debits = (rows: BankTxn[]) => rows.filter((r) => String(r.type).toLowerCase() === "debit");
const credits = (rows: BankTxn[]) => rows.filter((r) => String(r.type).toLowerCase() === "credit");
const total = (rows: BankTxn[]) => rows.reduce((s, r) => s + Math.abs(num(r.amount)), 0);

/** CHECK 1 — Section 80JJAA: 30% of additional wages for new regular employees. */
export function check80JJAA(current: BankTxn[], prior: BankTxn[]): Candidate | null {
  const cur = debits(current).filter((r) => hasAny(r.description, SALARY_WORDS) || hasAny(r.category, SALARY_WORDS));
  const prev = debits(prior).filter((r) => hasAny(r.description, SALARY_WORDS) || hasAny(r.category, SALARY_WORDS));
  if (cur.length - prev.length <= 2) return null;

  const curTotal = total(cur);
  const prevTotal = total(prev);
  const additionalWages = curTotal - prevTotal;
  if (additionalWages <= 0) return null;

  const benefit = round(additionalWages * TAX_RATE);
  if (benefit <= 0) return null;

  return {
    provision: "80JJAA",
    provision_label: "Section 80JJAA — Additional employee cost deduction",
    category: "Employment",
    estimated_benefit: benefit,
    confidence: "medium",
    evidence: [
      {
        type: "transaction",
        description: "Payroll debits increased versus the prior period",
        current_period_count: cur.length,
        prior_period_count: prev.length,
        current_period_total: round(curTotal),
        prior_period_total: round(prevTotal),
        additional_wages: round(additionalWages),
      },
    ],
    explanation:
      "Section 80JJAA allows 30% deduction on additional wages paid to new regular employees for 3 years. Based on your payroll data, we detected an increase in employees this period.",
    action_required:
      "Confirm new employee count with HR records and claim 80JJAA in ITR. Maintain Form 10DA.",
  };
}

const PRESUMPTIVE_ENTITIES = ["sole proprietorship", "proprietorship", "partnership firm", "partnership", "huf"];

/** CHECK 2 — Section 44AD: presumptive taxation at 8% of turnover under Rs 2 crore. */
export function check44AD(client: ClientRow, current: BankTxn[]): Candidate | null {
  const entity = (client.entity_type ?? "").toLowerCase();
  if (!PRESUMPTIVE_ENTITIES.some((e) => entity === e || entity.includes(e))) return null;

  const turnover = total(credits(current));
  if (turnover <= 0 || turnover >= 20000000) return null;

  const presumptiveIncome = turnover * 0.08;
  const outflow = total(debits(current));
  const actualProfit = turnover - outflow;
  // 44AD only helps when the presumptive base is lower than the real profit.
  if (actualProfit <= presumptiveIncome) return null;

  const benefit = round((actualProfit - presumptiveIncome) * TAX_RATE);
  if (benefit <= 0) return null;

  return {
    provision: "44AD",
    provision_label: "Section 44AD — Presumptive taxation scheme",
    category: "Presumptive Taxation",
    estimated_benefit: benefit,
    confidence: "high",
    evidence: [
      {
        type: "transaction",
        description: "Bank credits and debits for the period",
        entity_type: client.entity_type,
        turnover: round(turnover),
        outflow: round(outflow),
        actual_profit_estimate: round(actualProfit),
        presumptive_income_8pc: round(presumptiveIncome),
      },
    ],
    explanation:
      "Section 44AD allows eligible businesses with turnover under Rs 2 crore to declare 8% of turnover as profit, eliminating the need for maintaining detailed books and tax audit.",
    action_required:
      "Opt for Section 44AD in ITR. No books of accounts required if opted. Cannot claim other deductions under Chapter VI-A if opted.",
  };
}

function grossProfitFromPapers(papers: WorkingPaperRow[]): number | null {
  for (const p of papers) {
    const c = p.content as Record<string, unknown> | null;
    if (!c || typeof c !== "object") continue;
    const direct = c["gross_profit"];
    if (direct !== undefined && direct !== null && Number.isFinite(Number(direct))) return Number(direct);
    const lines = c["lines"];
    if (Array.isArray(lines)) {
      for (const l of lines as Record<string, unknown>[]) {
        if (String(l?.["label"] ?? "").toLowerCase().includes("gross profit")) {
          const v = Number(String(l?.["value"] ?? "").replace(/[^\d.-]/g, ""));
          if (Number.isFinite(v)) return v;
        }
      }
    }
  }
  return null;
}

/** CHECK 3 — Section 80-IAC: DPIIT startup tax holiday. */
export function check80IAC(client: ClientRow, current: BankTxn[], papers: WorkingPaperRow[]): Candidate | null {
  if (!client.dpiit_number) return null;
  if (!client.incorporation_date) return null;
  const inc = new Date(client.incorporation_date);
  if (Number.isNaN(inc.getTime())) return null;
  const years = (Date.now() - inc.getTime()) / (365.25 * 24 * 3600 * 1000);
  if (years > 10) return null;

  const turnover = total(credits(current));
  const fromPapers = grossProfitFromPapers(papers);
  const profit = fromPapers !== null && fromPapers > 0 ? fromPapers : turnover * 0.2;
  const benefit = round(profit * TAX_RATE);
  if (benefit <= 0) return null;

  return {
    provision: "80-IAC",
    provision_label: "Section 80-IAC — Startup tax holiday",
    category: "Startup",
    estimated_benefit: benefit,
    confidence: "high",
    evidence: [
      {
        type: "client_profile",
        description: "DPIIT recognition and incorporation window",
        dpiit_number: client.dpiit_number,
        incorporation_date: client.incorporation_date,
        years_since_incorporation: Math.round(years * 10) / 10,
      },
      {
        type: fromPapers !== null ? "working_paper" : "transaction",
        description: fromPapers !== null ? "Gross profit from working papers" : "Profit estimated at 20% of bank credits",
        turnover: round(turnover),
        estimated_profit: round(profit),
      },
    ],
    explanation:
      "DPIIT-recognised startups can claim 100% deduction on profits for 3 consecutive years within the first 10 years of incorporation under Section 80-IAC.",
    action_required:
      "File Form 10CCB with ITR. Ensure startup recognition certificate is current. Claim in Schedule 80-IAC.",
  };
}

const BUSINESS_USE_HINTS = ["logistics", "transport", "delivery", "courier", "freight", "cargo", "fleet"];
const SOFT_BLOCK_REASONS = ["personal", "motor vehicle", "motor car", "vehicle"];

/** CHECK 4 — Section 17(5): ITC potentially blocked in error. */
export function checkBlockedItc(rows: ItcRow[]): Candidate | null {
  const suspects = rows.filter(
    (r) => r.itc_blocked === true && hasAny(r.block_reason, SOFT_BLOCK_REASONS) && hasAny(r.supplier_name, BUSINESS_USE_HINTS),
  );
  if (!suspects.length) return null;
  const amount = round(suspects.reduce((s, r) => s + num(r.total_itc), 0));
  if (amount <= 0) return null;

  return {
    provision: "Sec 17(5) Review",
    provision_label: "Section 17(5) — Blocked ITC review",
    category: "ITC",
    estimated_benefit: amount,
    confidence: "low",
    evidence: suspects.slice(0, 25).map((r) => ({
      type: "itc_record",
      itc_record_id: r.id,
      supplier_name: r.supplier_name,
      invoice_number: r.invoice_number,
      block_reason: r.block_reason,
      total_itc: round(num(r.total_itc)),
    })),
    explanation: `ITC blocked under Section 17(5) on ${suspects.length} invoices totalling ${inr(amount)}. Based on supplier names, these may qualify as business-use input services eligible for credit.`,
    action_required:
      "Review each blocked credit with your CA. If genuinely for business use, file rectification in GSTR-3B next period.",
  };
}

/** CHECK 5 — Section 80G: donations to approved funds. */
export function check80G(current: BankTxn[]): Candidate | null {
  const rows = debits(current).filter((r) => hasAny(r.description, DONATION_WORDS) || hasAny(r.category, DONATION_WORDS));
  if (!rows.length) return null;
  const amount = total(rows);
  const benefit = round(amount * 0.5);
  if (benefit <= 0) return null;

  return {
    provision: "80G",
    provision_label: "Section 80G — Donations to approved funds",
    category: "Donations",
    estimated_benefit: benefit,
    confidence: "medium",
    evidence: rows.slice(0, 25).map((r) => ({
      type: "transaction",
      transaction_id: r.id,
      date: r.date,
      description: r.description,
      amount: round(Math.abs(num(r.amount))),
    })),
    explanation:
      "Donations detected in your transactions. Eligible donations to approved funds qualify for 50-100% deduction under Section 80G.",
    action_required:
      "Collect Form 80G receipts from donee organisations. Claim in ITR under Chapter VI-A.",
  };
}

/** CHECK 6 — Depreciation on capital assets bought during the period. */
export function checkDepreciation(current: BankTxn[]): Candidate | null {
  const rows = debits(current).filter(
    (r) => Math.abs(num(r.amount)) > 10000 && (hasAny(r.description, CAPEX_WORDS) || hasAny(r.category, CAPEX_WORDS)),
  );
  if (!rows.length) return null;
  const amount = total(rows);
  const benefit = round(amount * 0.15);
  if (benefit <= 0) return null;

  return {
    provision: "Depreciation",
    provision_label: "Depreciation on capital assets",
    category: "Capital Allowances",
    estimated_benefit: benefit,
    confidence: "medium",
    evidence: rows.slice(0, 25).map((r) => ({
      type: "transaction",
      transaction_id: r.id,
      date: r.date,
      description: r.description,
      amount: round(Math.abs(num(r.amount))),
    })),
    explanation: `Capital expenditure detected in ${rows.length} transactions. Depreciation under the Income Tax Act can significantly reduce taxable income.`,
    action_required:
      "Classify as capital assets in books. Claim depreciation at applicable rates (40% computers, 15% machinery, 10% furniture) in ITR.",
  };
}

export function runAllChecks(input: {
  client: ClientRow;
  current: BankTxn[];
  prior: BankTxn[];
  itc: ItcRow[];
  papers: WorkingPaperRow[];
}): Candidate[] {
  return [
    check80JJAA(input.current, input.prior),
    check44AD(input.client, input.current),
    check80IAC(input.client, input.current, input.papers),
    checkBlockedItc(input.itc),
    check80G(input.current),
    checkDepreciation(input.current),
  ].filter((c): c is Candidate => c !== null && c.estimated_benefit > 0);
}
