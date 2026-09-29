/**
 * Working paper generation.
 *
 * A working paper is a frozen snapshot of what the ledger said at the moment
 * a preparer signed it. The figures are pulled live at generation time and
 * then stored verbatim, so a later ledger correction never silently rewrites
 * the paper a reviewer approved.
 */
import { supabase } from "@/integrations/supabase/client";
import { periodRange } from "@/lib/caClose";

export type PaperType = "bank_recon" | "sales_ledger" | "purchase_ledger" | "expense_scrutiny" | "gst_summary";

export const PAPER_TYPES: { value: PaperType; label: string; blurb: string }[] = [
  { value: "bank_recon", label: "Bank reconciliation", blurb: "Opening/closing movement with reconciled vs unreconciled split." },
  { value: "sales_ledger", label: "Sales ledger", blurb: "Invoices raised in the period with collection status." },
  { value: "purchase_ledger", label: "Purchase ledger", blurb: "Bills and vendor payments recorded in the period." },
  { value: "expense_scrutiny", label: "Expense scrutiny", blurb: "Expenses grouped by head, flagging uncategorised spend." },
  { value: "gst_summary", label: "GST summary", blurb: "Output tax on sales against input credit claimed." },
];

export interface PaperLine {
  label: string;
  value: string;
  note?: string;
}

export interface PaperContent {
  generated_at: string;
  period: string;
  paper_type: PaperType;
  lines: PaperLine[];
  /** Anything the preparer must eyeball before signing. */
  observations: string[];
}

const money = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

const sum = (rows: { amount?: number | null; total_amount?: number | null }[], key: "amount" | "total_amount") =>
  rows.reduce((s, r) => s + Number(r[key] ?? 0), 0);

export async function buildPaperContent(
  businessId: string,
  period: string,
  paperType: PaperType,
): Promise<PaperContent> {
  const { from, to } = periodRange(period);
  const lines: PaperLine[] = [];
  const observations: string[] = [];

  if (paperType === "bank_recon") {
    const { data } = await supabase
      .from("bank_transactions")
      .select("amount, type, reconciled")
      .eq("business_id", businessId)
      .gte("date", from)
      .lte("date", to);
    const rows = (data ?? []) as { amount: number; type: string; reconciled: boolean }[];
    const credits = rows.filter((r) => r.type === "credit");
    const debits = rows.filter((r) => r.type === "debit");
    const open = rows.filter((r) => !r.reconciled);
    lines.push(
      { label: "Lines in period", value: String(rows.length) },
      { label: "Money in", value: money(sum(credits, "amount")) },
      { label: "Money out", value: money(sum(debits, "amount")) },
      { label: "Net movement", value: money(sum(credits, "amount") - sum(debits, "amount")) },
      { label: "Reconciled", value: `${rows.length - open.length} of ${rows.length}` },
      { label: "Unreconciled value", value: money(sum(open, "amount")) },
    );
    if (open.length) observations.push(`${open.length} bank line(s) remain unmatched and carry into the next period.`);
  }

  if (paperType === "sales_ledger" || paperType === "gst_summary") {
    const { data } = await supabase
      .from("invoices")
      .select("total_amount, tax_amount, outstanding_amount, status")
      .eq("business_id", businessId)
      .gte("invoice_date", from)
      .lte("invoice_date", to);
    const rows = (data ?? []) as { total_amount: number; tax_amount: number | null; outstanding_amount: number | null; status: string }[];
    const outstanding = rows.reduce((s, r) => s + Number(r.outstanding_amount ?? 0), 0);
    if (paperType === "sales_ledger") {
      lines.push(
        { label: "Invoices raised", value: String(rows.length) },
        { label: "Gross billed", value: money(sum(rows, "total_amount")) },
        { label: "Collected", value: money(sum(rows, "total_amount") - outstanding) },
        { label: "Outstanding at period end", value: money(outstanding) },
      );
      if (outstanding > 0) observations.push("Outstanding receivables should be aged and chased before sign-off.");
    } else {
      const output = rows.reduce((s, r) => s + Number(r.tax_amount ?? 0), 0);
      const { data: itc } = await supabase
        .from("gst_itc_lines")
        .select("itc_safe, itc_at_risk")
        .eq("business_id", businessId)
        .eq("period", period);
      const itcRows = (itc ?? []) as { itc_safe: number | null; itc_at_risk: number | null }[];
      const input = itcRows.reduce((s, r) => s + Number(r.itc_safe ?? 0), 0);
      const atRisk = itcRows.reduce((s, r) => s + Number(r.itc_at_risk ?? 0), 0);
      lines.push(
        { label: "Output tax (sales)", value: money(output) },
        { label: "Input credit (purchases)", value: money(input) },
        { label: "Net GST payable", value: money(Math.max(0, output - input)) },
        { label: "Credit carried forward", value: money(Math.max(0, input - output)) },
        { label: "Credit at risk", value: money(atRisk) },
      );
      observations.push("Input credit is taken from matched GSTR-2B lines; credit at risk is not claimable until the vendor files.");
    }
  }

  if (paperType === "purchase_ledger" || paperType === "expense_scrutiny") {
    const { data } = await supabase
      .from("expenses")
      .select("amount, category, payment_status")
      .eq("business_id", businessId)
      .gte("date", from)
      .lte("date", to);
    const rows = (data ?? []) as { amount: number; category: string | null; payment_status: string | null }[];
    if (paperType === "purchase_ledger") {
      const unpaid = rows.filter((r) => r.payment_status !== "paid");
      lines.push(
        { label: "Bills recorded", value: String(rows.length) },
        { label: "Total spend", value: money(sum(rows, "amount")) },
        { label: "Unpaid bills", value: String(unpaid.length) },
        { label: "Payables at period end", value: money(sum(unpaid, "amount")) },
      );
    } else {
      const byHead = new Map<string, number>();
      for (const r of rows) byHead.set(r.category ?? "Uncategorised", (byHead.get(r.category ?? "Uncategorised") ?? 0) + Number(r.amount ?? 0));
      for (const [head, amt] of [...byHead.entries()].sort((a, b) => b[1] - a[1])) {
        lines.push({ label: head, value: money(amt) });
      }
      const unc = byHead.get("Uncategorised") ?? 0;
      if (unc > 0) observations.push("Uncategorised spend must be assigned a ledger head before the period closes.");
      if (!rows.length) observations.push("No expenses recorded in this period — confirm this is expected.");
    }
  }

  return { generated_at: new Date().toISOString(), period, paper_type: paperType, lines, observations };
}
