/**
 * What a bank line means for the MIS. Revenue and expenses are operating
 * flows only: GST/TDS/advance-tax payments, advances, loans, capital and
 * transfers between the client's own accounts move cash but are not income
 * or expense, so they are shown separately instead of inflating either side.
 */
export type MisBucket =
  | "revenue"
  | "other_income"
  | "expense"
  | "tax_payment"
  | "advance_received"
  | "advance_paid"
  | "loan_capital"
  | "transfer"
  | "refund";

export const BUCKET_LABELS: Record<MisBucket, string> = {
  revenue: "Revenue",
  other_income: "Other income (interest)",
  expense: "Expenses",
  tax_payment: "Taxes paid (GST, TDS, advance tax)",
  advance_received: "Advances received",
  advance_paid: "Advances paid",
  loan_capital: "Loans and capital",
  transfer: "Transfers between own accounts",
  refund: "Refunds and reversals",
};

interface Line {
  direction: "in" | "out";
  category: string | null;
  description: string | null;
  counterparty: string | null;
}

const TAX = /\b(gst|cgst|sgst|igst|tds|advance tax|adv tax|income tax|self assessment tax|itns ?\d*|oltas|cbdt|tin ?nsdl|gst ?(pmt|payment|challan)|challan)\b/i;
const STATUTORY_EXPENSE = /\b(pf|epf|epfo|esi|esic|professional tax|ptax|labour welfare)\b/i;
// Bank and gateway charges carry GST, but the charge (with its GST) is an expense, not a tax payment.
const CHARGES = /\b(bank charges?|charges|chrgs?|chgs?|chg|sms (charges?|chg)|service charges?|processing fees?|min(imum)? bal|amc|annual fee|card fee|gst on (chg|chgs|charges?)|commission|mdr)\b/i;
const ADVANCE = /\b(advance|adv)\b(?!\s*tax)/i;
const LOAN = /\b(loan|emi|od a\/?c|cc a\/?c|overdraft|capital|director'?s? (contribution|loan)|drawings?|unsecured)\b/i;
const TRANSFER = /\b(self|own a\/?c|own account|sweep|fd (booking|closure|maturity)|fixed deposit|inter ?account|contra|transfer to (my|own)|a\/c transfer)\b/i;
const REFUND = /\b(refund|reversal|reversed|rev\b|chargeback|returned)\b/i;

export function misBucket(t: Line): MisBucket {
  const text = `${t.description ?? ""} ${t.counterparty ?? ""}`;
  if (t.category === "transfer" || TRANSFER.test(text)) return "transfer";
  if (LOAN.test(text)) return "loan_capital";
  if (t.direction === "in") {
    if (REFUND.test(text)) return "refund";
    if (ADVANCE.test(text)) return "advance_received";
    if (t.category === "interest") return "other_income";
    return "revenue";
  }
  if (CHARGES.test(text) && !/\b(challan|cpin|itns|tds|advance tax)\b/i.test(text)) return "expense";
  if (TAX.test(text) && !STATUTORY_EXPENSE.test(text)) return "tax_payment";
  if (t.category === "tax" && !STATUTORY_EXPENSE.test(text)) return "tax_payment";
  if (ADVANCE.test(text)) return "advance_paid";
  return "expense";
}

export interface Settlement {
  key: string;
  /** Net amount paid into the bank. */
  amount: number;
  fee?: number;
  tax?: number;
  date?: string | null;
}

/**
 * The settlements a gateway register describes. Per-settlement groups when the
 * report has a settlement id and fee columns; otherwise the whole file as one
 * payout (net = "Net settled" total, or gross − fees − GST).
 */
export function settlementsFromRegister(
  reg: { totals?: { label: string; amount: number }[]; groups?: Settlement[] } | null | undefined,
  key = "settlement",
): Settlement[] {
  if (!reg) return [];
  const groups = (reg.groups ?? []).filter((g) => (g.fee ?? 0) + (g.tax ?? 0) > 0);
  if (groups.length) return groups;
  const total = (label: string) => reg.totals?.find((t) => t.label === label)?.amount;
  const gross = total("Gross collected");
  const fee = total("Gateway fees") ?? 0;
  const tax = total("GST on fees") ?? 0;
  const net = total("Net settled to bank") ?? (gross !== undefined ? Math.round((gross - fee - tax) * 100) / 100 : undefined);
  if (net === undefined || fee + tax <= 0) return [];
  return [{ key, amount: net, fee, tax, date: null }];
}

/**
 * Payment gateways pay the bank net of their fees. When the settlement report
 * is uploaded, each payout that matches a settlement (same net amount, within
 * 5 days) is grossed up: revenue is what customers paid, and the fee and GST
 * on it are an expense. Every match is listed so it can be checked.
 */
export function gatewayGrossUp(
  receipts: { id: string; amount: number; txn_date: string }[],
  settlements: Settlement[],
): { fees: number; tax: number; matches: { txn_id: string; settlement: string; fee: number; tax: number }[] } {
  const used = new Set<string>();
  const matches: { txn_id: string; settlement: string; fee: number; tax: number }[] = [];
  const days = (a: string, b: string) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 864e5;
  for (const r of receipts) {
    const s = settlements.find(
      (x) => !used.has(x.key) && Math.abs(x.amount - r.amount) <= 1 && (!x.date || days(x.date, r.txn_date) <= 5) && (x.fee ?? 0) + (x.tax ?? 0) > 0,
    );
    if (!s) continue;
    used.add(s.key);
    matches.push({ txn_id: r.id, settlement: s.key, fee: s.fee ?? 0, tax: s.tax ?? 0 });
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return { fees: round(matches.reduce((t, m) => t + m.fee, 0)), tax: round(matches.reduce((t, m) => t + m.tax, 0)), matches };
}
