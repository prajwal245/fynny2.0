/**
 * Registers and reports that are not bank or books: GST sales/purchase
 * registers, GSTR-2B, TDS registers, payroll sheets and payment-gateway
 * settlement reports. They are read and summarised, but never turned into
 * bank or book transactions: they would double count in Recon and flood the
 * Review Queue (a 40-invoice register is not 40 bank lines).
 *
 * Detection reads the header row only, so a bank statement or ledger export
 * (date, narration, debit, credit, balance) is never mistaken for one.
 */
import { round2 } from "../core";

export type RegisterKind =
  | "gst_sales_register"
  | "gst_purchase_register"
  | "invoice_register"
  | "gstr2b"
  | "tds_register"
  | "payroll"
  | "gateway_settlement";

export const REGISTER_LABELS: Record<RegisterKind, string> = {
  gst_sales_register: "GST sales register",
  gst_purchase_register: "GST purchase register",
  invoice_register: "Invoice register",
  gstr2b: "GSTR-2B",
  tds_register: "TDS register",
  payroll: "Payroll sheet",
  gateway_settlement: "Payment gateway settlement report",
};

export interface RegisterSummary {
  kind: RegisterKind;
  label: string;
  entries: number;
  totals: { label: string; amount: number }[];
  /** Per settlement (gateway) or per section (TDS): small breakdown for the firm. */
  groups?: { key: string; amount: number; count: number }[];
  note: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[_\s]+/g, " ").replace(/[^a-z0-9% ]/g, "").trim();

function findHeader(rows: string[][]): { index: number; cols: string[] } | null {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const cells = rows[i].map((c) => norm(String(c ?? "")));
    if (cells.filter(Boolean).length >= 3) return { index: i, cols: cells };
  }
  return null;
}

const has = (cols: string[], ...words: (string | RegExp)[]) =>
  words.some((w) => cols.some((c) => (typeof w === "string" ? c === w || c.includes(w) : w.test(c))));

/** Which register a table is, from its header and file name, or null for bank/books. */
export function detectRegister(rows: string[][], filename: string): RegisterKind | null {
  const h = findHeader(rows);
  if (!h) return null;
  const c = h.cols;
  const name = filename.toLowerCase();
  // Bank statements and ledgers carry a running balance or debit/credit pair with a narration.
  const looksLikeBank = has(c, "balance", "closing balance") && has(c, "withdrawal", "deposit", "debit", "credit", "dr", "cr");

  if (/razorpay|cashfree|payu|stripe|paytm|phonepe|ccavenue|settlement/.test(name) || (has(c, "settlement id", "settlement utr", "settlement") && has(c, "fee", "fees"))) {
    if (has(c, "fee", "fees", "settled", "settlement")) return "gateway_settlement";
  }
  if (looksLikeBank) return null;
  if (/gstr ?-?2b/.test(name) || has(c, "itc availability", "itc available", /^gstr/)) return "gstr2b";
  if (has(c, "employee", "emp code", "emp id", "employee name", "staff name") && has(c, "basic", "hra", "gross", "net pay", "net salary", "pf", "esi", "ctc")) return "payroll";
  if (has(c, "deductee", "tds amount", "tds deducted", "tax deducted") && has(c, "section", "pan", "deductee")) return "tds_register";
  const gst = has(c, "gstin", "taxable value", "taxable amount", "taxable") && has(c, "cgst", "sgst", "igst", "gst amount", "tax amount", "gstin");
  const invoiceCols = has(c, "invoice no", "invoice number", "inv no", "bill no", "invoice");
  if (gst || (invoiceCols && has(c, "taxable", "cgst", "igst", "gstin"))) {
    if (/sales|outward|gstr ?1\b|sale/.test(name) || has(c, "customer", "buyer", "recipient")) return "gst_sales_register";
    if (/purchase|inward|expense|vendor|supplier/.test(name) || has(c, "supplier", "vendor", "seller")) return "gst_purchase_register";
    return "invoice_register";
  }
  return null;
}

function amount(raw: string): number | null {
  const s = String(raw ?? "").replace(/[₹,\s]/g, "").replace(/^\((.*)\)$/, "-$1").replace(/(cr|dr)$/i, "");
  if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

/** Totals a firm cares about for each register, read by column name. */
export function summariseRegister(kind: RegisterKind, rows: string[][]): RegisterSummary {
  const h = findHeader(rows)!;
  const body = rows.slice(h.index + 1).filter((r) => r.some((x) => String(x ?? "").trim()));
  // Skip a closing "Total" row so it is not added twice.
  const data = body.filter((r) => !/^\s*(grand\s*)?total\b/i.test(String(r[0] ?? "")) && !r.some((x) => /^\s*(grand\s*)?total\s*$/i.test(String(x ?? ""))));
  const col = (...words: (string | RegExp)[]) =>
    h.cols.findIndex((c) => words.some((w) => (typeof w === "string" ? c === w || c.includes(w) : w.test(c))));
  const sum = (i: number) => (i < 0 ? 0 : round2(data.reduce((s, r) => s + (amount(r[i]) ?? 0), 0)));
  const totals: { label: string; amount: number }[] = [];
  const push = (label: string, i: number) => {
    if (i >= 0) totals.push({ label, amount: sum(i) });
  };
  let groups: RegisterSummary["groups"];
  let note = "Kept as a register. Its entries are not bank or book transactions, so it does not change Recon or the MIS.";

  if (kind === "gst_sales_register" || kind === "gst_purchase_register" || kind === "invoice_register" || kind === "gstr2b") {
    push("Taxable value", col("taxable value", "taxable amount", "taxable"));
    push("IGST", col("igst"));
    push("CGST", col("cgst"));
    push("SGST", col("sgst", "utgst"));
    push("Invoice total", col("invoice value", "invoice amount", "total value", "total amount", /^total$/, "grand total"));
    if (kind === "gstr2b") note = "GSTR-2B summary kept for GST reconciliation. Not used in bank reconciliation.";
  } else if (kind === "tds_register") {
    const tdsCol = col("tds amount", "tds deducted", "tax deducted", "tds");
    push("Amount paid / credited", col("amount paid", "amount credited", "gross amount", "amount"));
    push("TDS", tdsCol);
    const sec = col("section");
    if (sec >= 0 && tdsCol >= 0) {
      const by = new Map<string, { amount: number; count: number }>();
      for (const r of data) {
        const k = String(r[sec] ?? "").trim() || "Unknown";
        const g = by.get(k) ?? { amount: 0, count: 0 };
        g.amount = round2(g.amount + (amount(r[tdsCol]) ?? 0));
        g.count++;
        by.set(k, g);
      }
      groups = [...by.entries()].map(([key, g]) => ({ key, ...g }));
    }
  } else if (kind === "payroll") {
    push("Gross salary", col("gross", "gross salary", "gross pay", "ctc"));
    push("PF", col("pf", "provident fund", "epf"));
    push("ESI", col("esi", "esic"));
    push("Professional tax", col("professional tax", /^pt$/));
    push("TDS", col("tds", "income tax"));
    push("Net pay", col("net pay", "net salary", "net amount", "take home"));
    note = "Payroll sheet kept for reference. The salary, PF and ESI payments themselves are matched from the bank statement and the books.";
  } else if (kind === "gateway_settlement") {
    const gross = col("amount", "gross amount", "order amount", "payment amount");
    const fee = col("fee", "fees", "commission", "mdr");
    const tax = col("tax", "gst on fee", "service tax", "gst");
    const net = col("settled amount", "settlement amount", "net amount", "credit amount", "amount settled");
    push("Gross collected", gross);
    push("Gateway fees", fee);
    push("GST on fees", tax);
    push("Net settled to bank", net);
    const sid = col("settlement id", "settlement utr", "settlement ref", "utr");
    if (sid >= 0) {
      const by = new Map<string, { amount: number; count: number }>();
      for (const r of data) {
        const k = String(r[sid] ?? "").trim();
        if (!k) continue;
        const g = by.get(k) ?? { amount: 0, count: 0 };
        const n = net >= 0 ? amount(r[net]) : gross >= 0 ? round2((amount(r[gross]) ?? 0) - (fee >= 0 ? amount(r[fee]) ?? 0 : 0) - (tax >= 0 ? amount(r[tax]) ?? 0 : 0)) : null;
        g.amount = round2(g.amount + (n ?? 0));
        g.count++;
        by.set(k, g);
      }
      groups = [...by.entries()].map(([key, g]) => ({ key, ...g }));
    }
    note = "Settlement report kept as a reference: the bank already shows each payout once (net). Orders are not added to the bank side, so nothing is counted twice. Book the fees and GST on fees from the totals.";
  }
  return { kind, label: REGISTER_LABELS[kind], entries: data.length, totals, ...(groups ? { groups } : {}), note };
}
