/**
 * Sales and purchase registers from a Tally Day Book (XML), so a firm that already sends its Day Book does not have to export a
 * separate GST register. Read from the vouchers themselves: the party and its GSTIN, the voucher number, the date, and the tax from the
 * GST ledgers inside each voucher. Nothing is guessed: a voucher with no party leg is skipped and counted, and the tax split comes only
 * from ledgers whose name says CGST, SGST, UTGST, IGST or cess.
 *
 * Taxable value is the party total minus the tax and any round-off, so it holds whether the voucher is in accounting or item invoice mode.
 * A purchase is marked reverse charge when a tax ledger in it is named RCM or reverse charge. That is a naming convention, so the
 * result says so, and the register upload remains the exact route.
 */
import { parseMoneyCell } from "@/lib/bankAmount";
import { parseDate } from "../core";
import { childText, children, findAll, parseXml } from "../extract/xml";
import type { GstInvoice, ReadInvoices } from "./invoices";

const r2 = (n: number) => Math.round(n * 100) / 100;
const TAX = /\b(cgst|sgst|utgst|igst|cess)\b|\b(c|s|i)gst\b/i;
const ROUND = /round(ing)?[\s-]*off/i;
const RCM = /\brcm\b|reverse\s*charge/i;

export interface TallyGst {
  sales: ReadInvoices;
  purchases: ReadInvoices;
  /** Vouchers seen, and how many sales or purchase vouchers could not be read as an invoice. */
  vouchers: number;
  skipped: number;
}


interface Leg { ledger: string; amount: number }

/** One voucher as an invoice. Legs are signed as Tally writes them: a debit is negative. Null when there is no party leg to read it from. */
function buildInvoice(i: { type: string; date: string | null; no: string; partyName: string; gstin: string; pos: string; irn: string; entries: Leg[]; row: number }): GstInvoice | null {
  const { type, entries, partyName } = i;
  const party = entries.find((e) => e.ledger === partyName);
  if (!partyName || !party || !party.amount) return null;
  const total = Math.abs(party.amount);
  const tax = { igst: 0, cgst: 0, sgst: 0, cess: 0 };
  let round = 0;
  let rcm = false;
  for (const e of entries) {
    if (e === party) continue;
    if (ROUND.test(e.ledger)) { round += e.amount; continue; }
    if (!TAX.test(e.ledger)) continue;
    const a = Math.abs(e.amount);
    if (RCM.test(e.ledger)) rcm = true;
    if (/igst/i.test(e.ledger)) tax.igst += a;
    else if (/cgst/i.test(e.ledger)) tax.cgst += a;
    else if (/sgst|utgst/i.test(e.ledger)) tax.sgst += a;
    else tax.cess += a;
  }
  const taxSum = tax.igst + tax.cgst + tax.sgst + tax.cess;
  // Round-off sits on the same side as the income legs: a credit round-off in a sale adds to the party total and is not taxable value.
  const roundOnIncomeSide = round * (party.amount < 0 ? 1 : -1);
  // On a reverse-charge purchase the tax is not added to the party's bill, so the party total is already the taxable value.
  const taxable = r2(rcm ? total : total - taxSum - roundOnIncomeSide);
  const sign = type === "credit note" || type === "debit note" ? -1 : 1;
  return {
    gstin: i.gstin, party: partyName, no: i.no, date: i.date, pos: i.pos,
    taxable: r2(sign * taxable), igst: r2(sign * tax.igst), cgst: r2(sign * tax.cgst), sgst: r2(sign * tax.sgst), cess: r2(sign * tax.cess),
    total: r2(sign * total), rate: null, hsn: "", irn: i.irn, reverseCharge: rcm, itc: null,
    docType: type === "credit note" ? "credit_note" : type === "debit note" ? "debit_note" : "invoice",
    filedIn: null, row: i.row, lines: 1, repeats: 0,
  };
}

const wrapInvoices = (invoices: GstInvoice[], what: string, month: string | null | undefined, noGstin: boolean): ReadInvoices => ({
  invoices,
  period: month ?? (invoices.find((x) => x.date)?.date?.slice(0, 7) ?? null),
  ownGstin: null,
  notes: [
    invoices.length ? `${invoices.length} ${what} read from the Tally Day Book vouchers.` : `No ${what} vouchers in this Day Book${month ? " for that month" : ""}.`,
    ...(invoices.length && noGstin ? ["A Tally Day Book does not carry the buyer or supplier GSTIN, so invoices are matched on their number."] : []),
  ],
});

/**
 * The Day Book as Tally's Excel export: a voucher is a row with a date, the party, the voucher type and number and the party's amount,
 * followed by one row per ledger leg (name in "Particulars", amount under Debit or Credit, optionally ending Dr or Cr).
 */
export function readTallyGstSheet(rows: string[][], opts: { month?: string | null } = {}): TallyGst {
  const sales: GstInvoice[] = [];
  const purchases: GstInvoice[] = [];
  const head = rows.findIndex((r) => r.some((c) => /^particulars$/i.test(String(c).trim())) && r.some((c) => /vch\s*type/i.test(String(c))));
  if (head < 0) return { sales: wrapInvoices([], "sales", opts.month, true), purchases: wrapInvoices([], "purchase", opts.month, true), vouchers: 0, skipped: 0 };
  const h = rows[head]!.map((c) => String(c).trim().toLowerCase());
  const col = (re: RegExp, fallback: number) => { const i = h.findIndex((c) => re.test(c)); return i >= 0 ? i : fallback; };
  const cDate = col(/^date$/, 0), cPart = col(/^particulars$/, 1), cType = col(/vch\s*type/, 4), cNo = col(/vch\s*no/, 5);
  const cDr = col(/^debit$/, 6), cCr = col(/^credit$/, 7);
  const amt = (r: string[], idx: number) => { const v = String(r[idx] ?? "").trim(); if (!v) return 0; const m = parseMoneyCell(v); return m.sign === -1 ? -m.value : m.value; };
  const signed = (r: string[]) => { const d = amt(r, cDr), c = amt(r, cCr); return d ? -Math.abs(d) : Math.abs(c); };
  let vouchers = 0, skipped = 0, seq = 0;
  let cur: { type: string; date: string | null; no: string; party: string; legs: Leg[] } | null = null;
  const finish = (v: NonNullable<typeof cur>) => {
    vouchers++;
    const kind = v.type === "sales" || v.type === "credit note" ? "sales" : v.type === "purchase" || v.type === "debit note" ? "purchase" : null;
    if (!kind) return;
    if (opts.month && v.date && !v.date.startsWith(opts.month)) return;
    const inv = buildInvoice({ type: v.type, date: v.date, no: v.no, partyName: v.party, gstin: "", pos: "", irn: "", entries: v.legs, row: ++seq });
    if (!inv) { skipped++; return; }
    (kind === "sales" ? sales : purchases).push(inv);
  };
  for (const r of rows.slice(head + 1)) {
    const date = String(r[cDate] ?? "").trim();
    const type = String(r[cType] ?? "").trim().toLowerCase();
    const name = String(r[cPart] ?? "").trim();
    if (date && type) {
      if (cur) finish(cur);
      cur = { type, date: parseDate(date), no: String(r[cNo] ?? "").trim(), party: name, legs: [{ ledger: name, amount: signed(r) }] };
    } else if (cur && name && !date && !type) {
      cur.legs.push({ ledger: name, amount: signed(r) });
    }
  }
  if (cur) finish(cur);
  return { sales: wrapInvoices(sales, "sales", opts.month, true), purchases: wrapInvoices(purchases, "purchase", opts.month, true), vouchers, skipped };
}

export function readTallyGst(xml: string, opts: { month?: string | null } = {}): TallyGst {
  const doc = parseXml(xml);
  const sales: GstInvoice[] = [];
  const purchases: GstInvoice[] = [];
  let skipped = 0;
  const vouchers = findAll(doc, "VOUCHER");
  let seq = 0;
  for (const v of vouchers) {
    const type = (childText(v, "VOUCHERTYPENAME") || v.attrs.VCHTYPE || "").trim().toLowerCase();
    const kind = type === "sales" || type === "credit note" ? "sales" : type === "purchase" || type === "debit note" ? "purchase" : null;
    if (!kind) continue;
    if (/^yes$/i.test(childText(v, "ISCANCELLED")) || /^yes$/i.test(childText(v, "ISOPTIONAL"))) continue;
    const date = parseDate(childText(v, "DATE") || childText(v, "EFFECTIVEDATE")) ?? null;
    if (opts.month && date && !date.startsWith(opts.month)) continue;
    const partyName = childText(v, "PARTYLEDGERNAME") || childText(v, "PARTYNAME");
    const entries: Leg[] = [...children(v, "ALLLEDGERENTRIES.LIST"), ...children(v, "LEDGERENTRIES.LIST")].map((l) => {
      const m = parseMoneyCell(childText(l, "AMOUNT"));
      return { ledger: childText(l, "LEDGERNAME"), amount: m.sign === -1 ? -m.value : m.value };
    });
    const inv = buildInvoice({ type, date, no: childText(v, "VOUCHERNUMBER") || childText(v, "REFERENCE") || "", partyName, gstin: (childText(v, "PARTYGSTIN") || childText(v, "CONSIGNEEGSTIN") || "").toUpperCase().replace(/\s+/g, ""), pos: (childText(v, "PLACEOFSUPPLY") || "").trim().slice(0, 2), irn: childText(v, "IRN") || "", entries, row: ++seq });
    if (!inv) { skipped++; continue; }
    (kind === "sales" ? sales : purchases).push(inv);
  }
  return { sales: wrapInvoices(sales, "sales", opts.month, false), purchases: wrapInvoices(purchases, "purchase", opts.month, false), vouchers: vouchers.length, skipped };
}
