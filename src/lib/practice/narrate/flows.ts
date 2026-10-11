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
  if (TAX.test(text) && !STATUTORY_EXPENSE.test(text)) return "tax_payment";
  if (t.category === "tax" && !STATUTORY_EXPENSE.test(text)) return "tax_payment";
  if (ADVANCE.test(text)) return "advance_paid";
  return "expense";
}
