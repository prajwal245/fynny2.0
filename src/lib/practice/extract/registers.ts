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
import { checkGatewayGst, checkGst, checkPayroll, checkTds, type ComplianceCheck } from "../india";

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
  groups?: { key: string; amount: number; count: number; gross?: number; fee?: number; tax?: number; date?: string | null }[];
  /** Checks under Indian GST, TDS and payroll rules, done in code (not by AI). */
  checks?: ComplianceCheck[];
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
  // A rate or percentage column is never an amount ("TDS Rate %" is not "TDS").
  const isRate = (c: string) => /%|\brate\b|percent/.test(c);
  const col = (...words: (string | RegExp)[]) => {
    const ok = (c: string, w: string | RegExp) => (typeof w === "string" ? c === w || c.includes(w) : w.test(c));
    // Earlier words win: "tds deducted" before a bare "tds".
    for (const w of words) {
      const i = h.cols.findIndex((c) => !isRate(c) && ok(c, w));
      if (i >= 0) return i;
    }
    return -1;
  };
  const sum = (i: number) => (i < 0 ? 0 : round2(data.reduce((s, r) => s + (amount(r[i]) ?? 0), 0)));
  const totals: { label: string; amount: number }[] = [];
  const push = (label: string, i: number) => {
    if (i >= 0) totals.push({ label, amount: sum(i) });
  };
  let groups: RegisterSummary["groups"];
  let checks: ComplianceCheck[] = [];
  const num = (r: string[], i: number) => (i >= 0 ? amount(r[i]) ?? 0 : 0);
  const txt = (r: string[], i: number) => (i >= 0 ? String(r[i] ?? "").trim() : "");
  let note = "Kept as a register. Its entries are not bank or book transactions, so it does not change Recon or the MIS.";

  if (kind === "gst_sales_register" || kind === "gst_purchase_register" || kind === "invoice_register" || kind === "gstr2b") {
    push("Taxable value", col("taxable value", "taxable amount", "taxable"));
    push("IGST", col("igst"));
    push("CGST", col("cgst"));
    push("SGST", col("sgst", "utgst"));
    push("Invoice total", col("invoice value", "invoice amount", "total value", "total amount", /^total$/, "grand total"));
    const [ti, ii, ci, si] = [col("taxable value", "taxable amount", "taxable"), col("igst"), col("cgst"), col("sgst", "utgst")];
    const gi = col("supplier gstin", "customer gstin", "party gstin", "gstin");
    const ri = col("invoice no", "invoice number", "inv no", "bill no", "invoice");
    if (ti >= 0)
      checks = checkGst(data.map((r) => ({ ref: txt(r, ri), gstin: txt(r, gi), taxable: num(r, ti), igst: num(r, ii), cgst: num(r, ci), sgst: num(r, si) })));
    if (kind === "gstr2b") note = "GSTR-2B summary kept for GST reconciliation. Not used in bank reconciliation.";
  } else if (kind === "tds_register") {
    const tdsCol = col("tds deducted", "tds amount", "tax deducted", "tds deduction", /^tds$/, "tds");
    push("Amount paid / credited", col("amount paid", "amount credited", "gross amount", /^amount$/, "payment amount", "bill amount", "invoice amount"));
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
    const paidCol = col("amount paid", "amount credited", "gross amount", /^amount$/, "payment amount", "bill amount", "invoice amount");
    const party = col("deductee", "party", "name", "vendor");
    if (sec >= 0 && tdsCol >= 0 && paidCol >= 0)
      checks = checkTds(data.map((r) => ({ party: txt(r, party), section: txt(r, sec), paid: num(r, paidCol), tds: num(r, tdsCol) })));
  } else if (kind === "payroll") {
    push("Gross salary", col("gross", "gross salary", "gross pay", "ctc"));
    push("PF", col("pf", "provident fund", "epf"));
    push("ESI", col("esi", "esic"));
    push("Professional tax", col("professional tax", /^pt$/));
    push("TDS", col("tds", "income tax"));
    push("Net pay", col("net pay", "net salary", "net amount", "take home"));
    const [bi, gri, pfi, esii, ni] = [col(/^basic/), col("gross", "gross salary", "gross pay"), col(/^pf$/, "pf employee", "employee pf", "provident fund", "epf", "pf"), col(/^esi$/, "esi employee", "employee esi", "esic", "esi"), col("employee name", "name", "employee")];
    if (gri >= 0 && (pfi >= 0 || esii >= 0))
      checks = checkPayroll(
        data.map((r) => ({ name: txt(r, ni), basic: bi >= 0 ? num(r, bi) : undefined, gross: num(r, gri), pf: pfi >= 0 ? num(r, pfi) : undefined, esi: esii >= 0 ? num(r, esii) : undefined })),
      );
    note = "Payroll sheet kept for reference. The salary, PF and ESI payments themselves are matched from the bank statement and the books.";
  } else if (kind === "gateway_settlement") {
    const gross = col(/^amount$/, "gross amount", "gross", "order amount", "payment amount", /^amount/, "amount");
    const fee = col("fee", "fees", "commission", "mdr");
    const tax = col("gst on fee", /^tax$/, "tax on fee", "service tax", /^gst$/, "gst", "tax");
    const net = col("settled amount", "settlement amount", "net amount", "credit amount", "amount settled");
    push("Gross collected", gross);
    push("Gateway fees", fee);
    push("GST on fees", tax);
    push("Net settled to bank", net);
    const sid = col("settlement id", "settlement utr", "settlement ref", "utr");
    const when = col("settled at", "settlement date", "settled on", "settled_at", "created at", "date");
    if (sid >= 0) {
      type G = { amount: number; count: number; gross: number; fee: number; tax: number; date: string | null };
      const by = new Map<string, G>();
      for (const r of data) {
        const k = String(r[sid] ?? "").trim();
        if (!k) continue;
        const g = by.get(k) ?? { amount: 0, count: 0, gross: 0, fee: 0, tax: 0, date: null };
        const gr = gross >= 0 ? amount(r[gross]) ?? 0 : 0;
        const fe = fee >= 0 ? amount(r[fee]) ?? 0 : 0;
        const tx = tax >= 0 ? amount(r[tax]) ?? 0 : 0;
        const n = net >= 0 ? amount(r[net]) : gross >= 0 ? round2(gr - fe - tx) : null;
        g.amount = round2(g.amount + (n ?? 0));
        g.gross = round2(g.gross + gr);
        g.fee = round2(g.fee + fe);
        g.tax = round2(g.tax + tx);
        g.count++;
        if (!g.date && when >= 0) {
          const d = String(r[when] ?? "").trim().slice(0, 10);
          g.date = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
        }
        by.set(k, g);
      }
      groups = [...by.entries()].map(([key, g]) => ({ key, ...g }));
    }
    if (fee >= 0 && tax >= 0) checks = checkGatewayGst(sum(fee), sum(tax));
    note = "Settlement report kept as a reference: the bank already shows each payout once (net). Orders are not added to the bank side, so nothing is counted twice. Book the fees and GST on fees from the totals.";
  }
  return { kind, label: REGISTER_LABELS[kind], entries: data.length, totals, ...(groups ? { groups } : {}), ...(checks.length ? { checks } : {}), note };
}
