/**
 * The return-level GST checks a CA does at month end, from the files the portal gives and the firm's own registers:
 *
 *   1. Sales: the firm's sales register against GSTR-1 (what was reported), invoice by invoice.
 *   2. Outward tax: GSTR-1 against the outward supplies paid in GSTR-3B (table 3.1).
 *   3. Input tax credit: what GSTR-2B makes available against what GSTR-3B claimed.
 *   4. Reverse charge: tax on RCM purchases in the books against the RCM liability in GSTR-3B, and the credit taken on it.
 *
 * Pure code. Every line states both figures, where each came from and the difference. A check whose files are missing says which file
 * it needs; it never shows a partial answer as complete. Nothing is filed or changed.
 */
import { isoDate, money, readGstr2bJson, type GstInvoice, type ReadInvoices } from "./invoices";
import { reconcileGstr2b, type Gstr2bRecon } from "./reconcile";

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => money(v) ?? 0;
/** A difference of up to a rupee is rounding, as the portal rounds each invoice. */
export const TOLERANCE = 1;

export interface TaxSplit { taxable: number; igst: number; cgst: number; sgst: number; cess: number }
export const taxOf = (t: TaxSplit) => r2(t.igst + t.cgst + t.sgst + t.cess);
const zero = (): TaxSplit => ({ taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 });
const add = (a: TaxSplit, b: Partial<TaxSplit>): TaxSplit => ({ taxable: r2(a.taxable + (b.taxable ?? 0)), igst: r2(a.igst + (b.igst ?? 0)), cgst: r2(a.cgst + (b.cgst ?? 0)), sgst: r2(a.sgst + (b.sgst ?? 0)), cess: r2(a.cess + (b.cess ?? 0)) });

export function sumInvoices(list: GstInvoice[]): TaxSplit {
  return list.reduce<TaxSplit>((t, i) => add(t, i), zero());
}

const det = (o: Record<string, unknown> | undefined): Partial<TaxSplit> => ({ taxable: num(o?.["txval"]), igst: num(o?.["iamt"]), cgst: num(o?.["camt"]), sgst: num(o?.["samt"]), cess: num(o?.["csamt"]) });
const periodOf = (fp: unknown): string | null => {
  const s = String(fp ?? "");
  return /^\d{6}$/.test(s) ? `${s.slice(2)}-${s.slice(0, 2)}` : null;
};
const parse = (input: unknown): Record<string, unknown> | null => {
  try { return (typeof input === "string" ? JSON.parse(input) : input) as Record<string, unknown>; } catch { return null; }
};

/* ── GSTR-1 ─────────────────────────────────────────────── */

export interface Gstr1Read extends ReadInvoices {
  /** Sales to unregistered buyers (B2C), which have no invoice numbers on the return. */
  b2c: TaxSplit;
  /** Exports and nil-rated or exempt supplies, shown but not part of the 3.1(a) comparison. */
  exportsAndNil: TaxSplit;
}

/** GSTR-1 JSON as the portal or offline tool saves it: b2b and cdnr by invoice, b2cs and b2cl and exp as totals. */
export function readGstr1Json(input: unknown): Gstr1Read {
  const doc = parse(input);
  const empty = (note: string): Gstr1Read => ({ invoices: [], period: null, ownGstin: null, notes: [note], b2c: zero(), exportsAndNil: zero() });
  if (!doc) return empty("The file is not valid JSON. Download GSTR-1 again from the GST portal (Returns → GSTR-1 → Download).");
  const base = readGstr2bJson(doc);
  let b2c = zero();
  let other = zero();
  for (const r of (Array.isArray(doc["b2cs"]) ? doc["b2cs"] : []) as Record<string, unknown>[]) b2c = add(b2c, det(r));
  for (const g of (Array.isArray(doc["b2cl"]) ? doc["b2cl"] : []) as Record<string, unknown>[])
    for (const inv of (Array.isArray(g["inv"]) ? g["inv"] : []) as Record<string, unknown>[])
      for (const it of (Array.isArray(inv["itms"]) ? inv["itms"] : []) as Record<string, unknown>[]) b2c = add(b2c, det((it["itm_det"] as Record<string, unknown>) ?? it));
  for (const e of (Array.isArray(doc["exp"]) ? doc["exp"] : []) as Record<string, unknown>[])
    for (const inv of (Array.isArray(e["inv"]) ? e["inv"] : []) as Record<string, unknown>[])
      for (const it of (Array.isArray(inv["itms"]) ? inv["itms"] : []) as Record<string, unknown>[]) other = add(other, det(it));
  const period = periodOf(doc["fp"]) ?? base.period;
  const ownGstin = String(doc["gstin"] ?? "").toUpperCase() || base.ownGstin;
  const hasAny = base.invoices.length || b2c.taxable || other.taxable;
  if (!hasAny) return { ...empty("No supplies found: this does not look like a GSTR-1 JSON (it has no b2b, b2cs or exp section)."), period, ownGstin };
  return { ...base, period, ownGstin, b2c, exportsAndNil: other, notes: [`GSTR-1: ${base.invoices.length} invoices and notes to registered buyers, and ${b2c.taxable ? "B2C sales of ₹" + b2c.taxable.toLocaleString("en-IN") : "no B2C sales"}.`] };
}

/* ── GSTR-3B ────────────────────────────────────────────── */

export interface Gstr3bRead {
  period: string | null;
  ownGstin: string | null;
  /** Table 3.1(a): outward taxable supplies other than zero rated, nil rated and exempt. */
  outward: TaxSplit;
  /** Table 3.1(d): inward supplies liable to reverse charge. */
  rcm: TaxSplit;
  /** Table 4(A): ITC available, by type, and the part taken on reverse charge supplies (ISRC). */
  itcAvailable: TaxSplit;
  itcOnRcm: TaxSplit;
  /** Table 4(B): ITC reversed, and 4(C) net ITC available. */
  itcReversed: TaxSplit;
  itcNet: TaxSplit;
  notes: string[];
}

export function readGstr3bJson(input: unknown): Gstr3bRead {
  const doc = parse(input);
  const none = (note: string): Gstr3bRead => ({ period: null, ownGstin: null, outward: zero(), rcm: zero(), itcAvailable: zero(), itcOnRcm: zero(), itcReversed: zero(), itcNet: zero(), notes: [note] });
  if (!doc) return none("The file is not valid JSON. Download GSTR-3B again from the GST portal (Returns → GSTR-3B → Download).");
  const sup = doc["sup_details"] as Record<string, Record<string, unknown>> | undefined;
  const itc = doc["itc_elg"] as Record<string, unknown> | undefined;
  if (!sup && !itc) return none("This does not look like a GSTR-3B JSON (it has no sup_details or itc_elg section).");
  const list = (k: string) => (Array.isArray(itc?.[k]) ? (itc![k] as Record<string, unknown>[]) : []);
  let avail = zero();
  let onRcm = zero();
  for (const r of list("itc_avl")) {
    avail = add(avail, det(r));
    if (/^isrc$/i.test(String(r["ty"] ?? ""))) onRcm = add(onRcm, det(r));
  }
  let rev = zero();
  for (const r of list("itc_rev")) rev = add(rev, det(r));
  const netRow = itc?.["itc_net"] as Record<string, unknown> | undefined;
  const net = netRow ? add(zero(), det(netRow)) : add(avail, { igst: -rev.igst, cgst: -rev.cgst, sgst: -rev.sgst, cess: -rev.cess });
  const period = periodOf(doc["ret_period"]) ?? periodOf(doc["fp"]);
  return { period, ownGstin: String(doc["gstin"] ?? "").toUpperCase() || null, outward: add(zero(), det(sup?.["osup_det"])), rcm: add(zero(), det(sup?.["isup_rev"])), itcAvailable: avail, itcOnRcm: onRcm, itcReversed: rev, itcNet: net, notes: [] };
}

/* ── the checks ─────────────────────────────────────────── */

export type CheckStatus = "agree" | "differs" | "needs";

export interface CheckLine {
  label: string;
  /** Where each figure came from, e.g. "Sales register" and "GSTR-1". */
  aName: string;
  a: number;
  bName: string;
  b: number;
  /** a minus b. */
  diff: number;
  status: Exclude<CheckStatus, "needs">;
}

export interface Check {
  id: "sales" | "outward" | "itc" | "rcm";
  title: string;
  status: CheckStatus;
  /** One plain sentence: what was found, or what file is needed. */
  summary: string;
  lines: CheckLine[];
  /** Invoice-level detail for the sales check. */
  invoiceRecon?: Gstr2bRecon;
}

export interface ReturnsInput {
  salesBooks?: ReadInvoices | null;
  gstr1?: Gstr1Read | null;
  gstr3b?: Gstr3bRead | null;
  gstr2b?: ReadInvoices | null;
  purchaseBooks?: ReadInvoices | null;
}

const line = (label: string, aName: string, a: number, bName: string, b: number): CheckLine => {
  const diff = r2(a - b);
  return { label, aName, a: r2(a), bName, b: r2(b), diff, status: Math.abs(diff) <= TOLERANCE ? "agree" : "differs" };
};
const fmt = (n: number) => `₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const overall = (lines: CheckLine[]): CheckStatus => (lines.every((l) => l.status === "agree") ? "agree" : "differs");
const need = (id: Check["id"], title: string, what: string): Check => ({ id, title, status: "needs", summary: `Add ${what} to run this check.`, lines: [] });

export function checkReturns(input: ReturnsInput): Check[] {
  const { salesBooks, gstr1, gstr3b, gstr2b, purchaseBooks } = input;
  const out: Check[] = [];

  // 1. Sales register against GSTR-1. The register holds every sale, GSTR-1 holds registered buyers (invoices) and B2C totals, so the
  // register total is compared with both together, and the invoices to registered buyers are matched one by one.
  if (!salesBooks?.invoices.length || !gstr1) out.push(need("sales", "Sales register against GSTR-1", !salesBooks?.invoices.length && !gstr1 ? "the sales register and the GSTR-1 JSON" : !gstr1 ? "the GSTR-1 JSON" : "the sales register"));
  else {
    const reg = sumInvoices(salesBooks.invoices);
    const filed = add(sumInvoices(gstr1.invoices), gstr1.b2c);
    const withGstin = salesBooks.invoices.filter((i) => i.gstin);
    const recon = reconcileGstr2b(withGstin, gstr1.invoices, { period: gstr1.period });
    const lines = [line("Taxable value", "Sales register", reg.taxable, "GSTR-1", filed.taxable), line("Tax", "Sales register", taxOf(reg), "GSTR-1", taxOf(filed))];
    const bad = recon.missingInPortal.length + recon.missingInBooks.length + recon.mismatched.length;
    out.push({
      id: "sales", title: "Sales register against GSTR-1", status: overall(lines) === "agree" && !bad ? "agree" : "differs", lines, invoiceRecon: recon,
      summary: bad
        ? `${recon.missingInPortal.length} sales invoice${recon.missingInPortal.length === 1 ? " is" : "s are"} in the books but not in GSTR-1, ${recon.missingInBooks.length} in GSTR-1 but not in the books, ${recon.mismatched.length} with different amounts.`
        : lines[0]!.status === "agree" && lines[1]!.status === "agree" ? "Every sale in the register is in GSTR-1 and the totals agree." : `Totals differ: tax in the register is ${fmt(lines[1]!.diff)} ${lines[1]!.diff > 0 ? "more" : "less"} than GSTR-1.`,
    });
  }

  // 2. GSTR-1 against GSTR-3B 3.1(a).
  if (!gstr1 || !gstr3b) out.push(need("outward", "GSTR-1 against GSTR-3B outward supplies", !gstr1 && !gstr3b ? "GSTR-1 and GSTR-3B" : !gstr1 ? "the GSTR-1 JSON" : "the GSTR-3B JSON"));
  else {
    const filed = add(sumInvoices(gstr1.invoices), gstr1.b2c);
    const lines = [line("Taxable value", "GSTR-1", filed.taxable, "GSTR-3B 3.1(a)", gstr3b.outward.taxable), line("Tax", "GSTR-1", taxOf(filed), "GSTR-3B 3.1(a)", taxOf(gstr3b.outward))];
    out.push({ id: "outward", title: "GSTR-1 against GSTR-3B outward supplies", lines, status: overall(lines), summary: overall(lines) === "agree" ? "Tax reported in GSTR-1 is the tax paid in GSTR-3B." : `Tax in GSTR-1 is ${fmt(lines[1]!.diff)} ${lines[1]!.diff > 0 ? "more" : "less"} than GSTR-3B 3.1(a). Exports and nil-rated supplies are not in this comparison.` });
  }

  // 3. ITC available (2B) against claimed (3B).
  if (!gstr2b?.invoices.length || !gstr3b) out.push(need("itc", "Input tax credit: GSTR-2B against GSTR-3B", !gstr2b?.invoices.length && !gstr3b ? "GSTR-2B and GSTR-3B" : !gstr3b ? "the GSTR-3B JSON" : "GSTR-2B"));
  else {
    const eligible = sumInvoices(gstr2b.invoices.filter((i) => i.itc !== "N" && !i.reverseCharge));
    const lines = [line("ITC (IGST + CGST + SGST + cess)", "GSTR-2B available", taxOf(eligible), "GSTR-3B net ITC", taxOf(gstr3b.itcNet) - taxOf(gstr3b.itcOnRcm))];
    const over = lines[0]!.diff < -TOLERANCE;
    out.push({ id: "itc", title: "Input tax credit: GSTR-2B against GSTR-3B", lines, status: overall(lines), summary: overall(lines) === "agree" ? "ITC claimed in GSTR-3B equals what GSTR-2B makes available." : over ? `GSTR-3B claims ${fmt(lines[0]!.diff)} more ITC than GSTR-2B makes available. That part is at risk.` : `GSTR-3B claims ${fmt(lines[0]!.diff)} less than GSTR-2B makes available. Credit not yet taken.` });
  }

  // 4. Reverse charge.
  if (!purchaseBooks?.invoices.length || !gstr3b) out.push(need("rcm", "Reverse charge: books against GSTR-3B", !purchaseBooks?.invoices.length && !gstr3b ? "the purchase register and GSTR-3B" : !gstr3b ? "the GSTR-3B JSON" : "the purchase register"));
  else {
    const rcmBooks = sumInvoices(purchaseBooks.invoices.filter((i) => i.reverseCharge));
    const lines = [line("RCM tax liability", "Purchase register (reverse charge)", taxOf(rcmBooks), "GSTR-3B 3.1(d)", taxOf(gstr3b.rcm)), line("ITC taken on RCM", "GSTR-3B 4(A) reverse charge", taxOf(gstr3b.itcOnRcm), "RCM tax paid, GSTR-3B 3.1(d)", taxOf(gstr3b.rcm))];
    const flagged = purchaseBooks.invoices.some((i) => i.reverseCharge);
    out.push({ id: "rcm", title: "Reverse charge: books against GSTR-3B", lines, status: overall(lines), summary: !flagged && !taxOf(gstr3b.rcm) ? "No reverse charge purchases in the register and none in GSTR-3B." : overall(lines) === "agree" ? "RCM liability in GSTR-3B agrees to the books, and the credit taken equals the tax paid." : `RCM liability differs by ${fmt(lines[0]!.diff)} from the register${!flagged ? " (the register has no purchase marked reverse charge, so check the column is present)" : ""}${Math.abs(lines[1]!.diff) > TOLERANCE ? `; credit taken differs from the tax paid by ${fmt(lines[1]!.diff)}` : ""}.` });
  }
  return out;
}

export { isoDate };
