/**
 * The Excel files a CA actually has for a month's GST work, read without asking the person to reformat anything:
 *
 *  - Tally registers (Sales, Purchase, Debit Note): one row per voucher, one column per ledger (the sales or purchase heads, the tax
 *    ledgers, round-off). Taxable value is the sum of the non-tax columns; the tax split comes from the tax ledger names.
 *  - Journals posting to GST ledgers: purchases and RCM booked as journals, one block of ledger lines per voucher.
 *  - GSTR-1 and GSTR-2B reports for a financial year from the portal: one row per document with its period.
 *  - GSTR-3B annual report: one column block per month.
 *
 * Pure code. Every reader says what it found and what it skipped; a total that does not add up is reported, never smoothed over.
 */
import { money, normInvoiceNo, type GstInvoice, type ReadInvoices } from "./invoices";
import { taxOf, type Gstr3bRead, type TaxSplit } from "./returns";

const r2 = (n: number) => Math.round(n * 100) / 100;
const cell = (v: unknown) => String(v ?? "").trim();
const norm = (v: unknown) => cell(v).toLowerCase().replace(/\s+/g, " ");
const num = (v: unknown) => money(cell(v).replace(/^-\s*$/, "")) ?? 0;
const zero = (): TaxSplit => ({ taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 });

const MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** "Dec-25", "Dec/2025", "122025" and "2025-12" are all December 2025. */
export function periodKey(raw: unknown): string | null {
  const s = cell(raw);
  let m = /^([A-Za-z]{3})[a-z]*[-/ ](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const i = MON.indexOf(m[1]!.toLowerCase());
    if (i >= 0) return `${m[2]!.length === 2 ? 2000 + Number(m[2]) : m[2]}-${String(i + 1).padStart(2, "0")}`;
  }
  m = /^(0[1-9]|1[0-2])(20\d{2})$/.exec(s);
  if (m) return `${m[2]}-${m[1]}`;
  m = /^(20\d{2})-(0[1-9]|1[0-2])/.exec(s);
  return m ? `${m[1]}-${m[2]}` : null;
}

/** dd-mm-yyyy (Tally) or m/d/yy (the portal reports). The two are told apart by who wrote the file, never guessed per cell. */
function ymd(raw: unknown, style: "dmy" | "mdy"): string | null {
  const s = cell(raw);
  const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(s);
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[2]);
  const y = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const [d, mo] = style === "dmy" ? [a, b] : [b, a];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Books-side extras the portal files do not have. */
export interface BooksInvoice extends GstInvoice {
  /** Tax actually taken as credit in the books (Input CGST/SGST/IGST ledgers). Tax parked in a "carry forward" ledger is not in it. */
  claimedTax?: number;
}

export type WorkbookKind = "tally_register" | "tally_journals" | "gstr1_report" | "gstr2b_report" | "gstr3b_annual" | "unknown";

export function detectWorkbook(sheets: { name: string; rows: string[][] }[]): { kind: WorkbookKind; sheet: string } {
  for (const s of sheets) {
    const top = s.rows.slice(0, 8).map((r) => r.map(norm));
    const flat = top.flat();
    if (flat.some((c) => /gstr-3b annual report/.test(c))) return { kind: "gstr3b_annual", sheet: s.name };
    if (top.some((r) => r.includes("original period") && r.includes("document type") && r.includes("invoice no."))) {
      const is2b = top.some((r) => r.some((c) => /itc avalibility|itc availability/.test(c))) || flat.some((c) => /gstr\s*-\s*2b/.test(c));
      return { kind: is2b ? "gstr2b_report" : "gstr1_report", sheet: s.name };
    }
    if (top.some((r) => r.includes("voucher type") && r.includes("gross total"))) return { kind: "tally_register", sheet: s.name };
    if (top.some((r) => r.includes("ledger") && r.includes("debit") && r.includes("credit") && r.includes("voucher no."))) return { kind: "tally_journals", sheet: s.name };
  }
  return { kind: "unknown", sheet: sheets[0]?.name ?? "" };
}

/* ── Tally registers ────────────────────────────────────── */

const TAX_COL = /\b(c|s|u|i)gst\b/i;
const CARRY = /\b(cf|carry\s*forward|c\/f)\b/i;
const ROUND = /round/i;
const RCM_COL = /\brcm\b|reverse\s*charge/i;

export function readTallyRegister(rows: string[][], opts: { month?: string | null; side?: "sales" | "purchase" } = {}): ReadInvoices {
  const notes: string[] = [];
  const hi = rows.findIndex((r) => r.map(norm).includes("voucher type") && r.map(norm).includes("gross total"));
  if (hi < 0) return { invoices: [], period: null, ownGstin: null, notes: ["No voucher table found: the sheet needs a Date, Voucher Type and Gross Total heading row."] };
  const head = rows[hi]!.map(cell);
  const h = head.map(norm);
  const at = (name: string) => h.indexOf(name);
  const cDate = at("date"), cParty = at("particulars"), cType = at("voucher type"), cNo = at("voucher no."), cSup = at("supplier invoice no."), cSupDt = at("supplier invoice date");
  const cGstin = h.findIndex((x) => /^gstin/.test(x)), cGross = at("gross total");
  const fixed = new Set([cDate, cParty, cType, cNo, cSup, cSupDt, cGstin, cGross, at("narration")].filter((i) => i >= 0));
  const ledgers = head.map((name, i) => ({ name, i })).filter((c) => c.name && !fixed.has(c.i));
  const side = opts.side ?? (cSup >= 0 ? "purchase" : "sales");
  const out: BooksInvoice[] = [];
  let seq = 0, off = 0;
  for (const r of rows.slice(hi + 1)) {
    const date = cell(r[cDate]);
    if (!date || /^total/i.test(date)) continue;
    const vdate = ymd(date, "dmy");
    if (opts.month && vdate && !vdate.startsWith(opts.month)) continue;
    const tax = { igst: 0, cgst: 0, sgst: 0, cess: 0 };
    let claimed = 0, taxable = 0, round = 0, rcm = false;
    for (const c of ledgers) {
      const v = num(r[c.i]);
      if (!v) continue;
      if (ROUND.test(c.name)) { round += v; continue; }
      if (TAX_COL.test(c.name)) {
        if (RCM_COL.test(c.name)) rcm = true;
        if (/igst/i.test(c.name)) tax.igst += v; else if (/cgst/i.test(c.name)) tax.cgst += v; else tax.sgst += v;
        if (!CARRY.test(c.name) && !RCM_COL.test(c.name)) claimed += v;
      } else taxable += v;
    }
    const gross = num(r[cGross]);
    const type = norm(r[cType]);
    const credit = type === "credit note" || type === "debit note";
    const sign = credit ? -1 : 1;
    // The register's own arithmetic must close: heads + tax + round-off = gross. A voucher that does not is reported.
    const sum = taxable + tax.igst + tax.cgst + tax.sgst + tax.cess + round;
    if (Math.abs(sum - gross) > 1) off++;
    const no = (side === "purchase" ? cell(r[cSup]) : "") || cell(r[cNo]);
    out.push({
      gstin: cell(r[cGstin]).toUpperCase().replace(/\s+/g, ""), party: cell(r[cParty]), no,
      date: (side === "purchase" ? ymd(r[cSupDt], "dmy") : null) ?? vdate,
      // The day it was booked, when that is not the supplier's invoice date: what the "booked late" rule looks at.
      bookedOn: side === "purchase" && ymd(r[cSupDt], "dmy") && ymd(r[cSupDt], "dmy") !== vdate ? vdate : null, pos: "",
      taxable: r2(sign * taxable), igst: r2(sign * tax.igst), cgst: r2(sign * tax.cgst), sgst: r2(sign * tax.sgst), cess: r2(sign * tax.cess),
      total: r2(sign * gross), rate: null, hsn: "", irn: "", reverseCharge: rcm, itc: null,
      docType: type === "credit note" ? "credit_note" : type === "debit note" ? "credit_note" : "invoice", filedIn: null,
      row: ++seq, lines: 1, repeats: 0, claimedTax: r2(sign * claimed),
    });
  }
  const noGstin = out.filter((i) => !i.gstin).length;
  notes.push(`${out.length} ${side === "purchase" ? "purchase" : "sales"} vouchers read from the register.`);
  if (noGstin && side === "purchase") notes.push(`${noGstin} have no supplier GSTIN in the register (unregistered or not entered); they are matched on the invoice number.`);
  if (off) notes.push(`${off} voucher${off === 1 ? "" : "s"} where the heads, tax and round-off do not add to the gross total.`);
  return { invoices: out, period: opts.month ?? out.find((i) => i.date)?.date?.slice(0, 7) ?? null, ownGstin: null, notes };
}

/* ── Journals with GST ──────────────────────────────────── */

export interface JournalGst {
  /** Purchases booked as journals: taxable heads and input tax debited, a party credited. */
  purchases: BooksInvoice[];
  /** Reverse charge liability booked in the month: the credit side of the RCM payable ledgers. */
  rcm: TaxSplit;
  /** Vouchers that touch GST ledgers but are neither (monthly set-off, expense journals): counted, not guessed at. */
  skipped: number;
  notes: string[];
}

const PAYABLE = /\bpayable\b/i;

export function readJournalsGst(rows: string[][], opts: { month?: string | null } = {}): JournalGst {
  const hi = rows.findIndex((r) => r.map(norm).includes("ledger") && r.map(norm).includes("debit"));
  const empty: JournalGst = { purchases: [], rcm: zero(), skipped: 0, notes: ["No journal table found."] };
  if (hi < 0) return empty;
  const h = rows[hi]!.map(norm);
  const cDate = h.indexOf("date"), cNo = h.indexOf("voucher no."), cNar = h.indexOf("narration"), cLed = h.indexOf("ledger"), cDr = h.indexOf("debit"), cCr = h.indexOf("credit");
  type V = { date: string | null; no: string; narration: string; legs: { ledger: string; dr: number; cr: number }[] };
  const vs: V[] = [];
  for (const r of rows.slice(hi + 1)) {
    if (/^total/i.test(cell(r[cDate]))) break;
    if (cell(r[cDate])) vs.push({ date: ymd(r[cDate], "dmy"), no: cell(r[cNo]), narration: cell(r[cNar]), legs: [] });
    const v = vs[vs.length - 1];
    if (v && cell(r[cLed])) v.legs.push({ ledger: cell(r[cLed]), dr: num(r[cDr]), cr: num(r[cCr]) });
  }
  const purchases: BooksInvoice[] = [];
  let rcm = zero(), skipped = 0, seq = 0;
  const split = (name: string, a: number, t: TaxSplit) => { if (/igst/i.test(name)) t.igst += a; else if (/cgst/i.test(name)) t.cgst += a; else if (/sgst|utgst/i.test(name)) t.sgst += a; else t.cess += a; };
  for (const v of vs) {
    if (opts.month && v.date && !v.date.startsWith(opts.month)) continue;
    const rcmCredit = v.legs.filter((l) => RCM_COL.test(l.ledger) && PAYABLE.test(l.ledger) && l.cr > 0);
    if (rcmCredit.length) { for (const l of rcmCredit) split(l.ledger, l.cr, rcm); continue; }
    if (v.legs.some((l) => RCM_COL.test(l.ledger))) { skipped++; continue; }
    const inputDebit = v.legs.filter((l) => /\binput\b/i.test(l.ledger) && TAX_COL.test(l.ledger) && l.dr > 0);
    const partyCredit = v.legs.filter((l) => l.cr > 0 && !TAX_COL.test(l.ledger) && !ROUND.test(l.ledger) && !/^gst\b/i.test(l.ledger)).sort((a, b) => b.cr - a.cr)[0];
    if (!inputDebit.length || !partyCredit) { skipped++; continue; }
    const t = zero();
    for (const l of inputDebit) split(l.ledger, l.dr, t);
    const heads = v.legs.filter((l) => l.dr > 0 && !TAX_COL.test(l.ledger) && !ROUND.test(l.ledger)).reduce((n, l) => n + l.dr, 0);
    purchases.push({
      gstin: "", party: partyCredit.ledger, no: v.no, date: v.date, pos: "",
      taxable: r2(heads), igst: r2(t.igst), cgst: r2(t.cgst), sgst: r2(t.sgst), cess: r2(t.cess), total: r2(partyCredit.cr), rate: null, hsn: "", irn: "",
      reverseCharge: false, itc: null, docType: "invoice", filedIn: null, row: ++seq, lines: v.legs.length, repeats: 0,
      claimedTax: r2(t.igst + t.cgst + t.sgst + t.cess),
    });
  }
  const notes = [`${purchases.length} purchase journal${purchases.length === 1 ? "" : "s"} and ${taxOf(rcm) ? `reverse charge of ₹${taxOf(rcm).toLocaleString("en-IN")}` : "no reverse charge"} read from the journals.`];
  if (skipped) notes.push(`${skipped} journal${skipped === 1 ? "" : "s"} touch GST ledgers but are not purchases or reverse charge (set-off or expense entries) and were left out.`);
  return { purchases, rcm: { ...rcm, taxable: 0 }, skipped, notes };
}

/* ── GSTR-1 and GSTR-2B reports ─────────────────────────── */

export function readPortalReport(rows: string[][], opts: { month?: string | null; kind: "gstr1" | "gstr2b" }): ReadInvoices {
  const hi = rows.findIndex((r) => r.map(norm).includes("original period") && r.map(norm).includes("invoice no."));
  if (hi < 0) return { invoices: [], period: null, ownGstin: null, notes: ["No document table found in this report."] };
  const h = rows[hi]!.map(norm);
  const ix = (re: RegExp) => h.findIndex((x) => re.test(x));
  const c = { per: ix(/^original period$/), amd: ix(/^amendment period$/), gstin: ix(/^gstin$/), type: ix(/^document type$/), party: ix(/^party name$/), no: ix(/^invoice no\.?$/), date: ix(/^invoice date$/), rcm: ix(/^rcm$/), tv: ix(/taxable value/), igst: ix(/^igst$/), cgst: ix(/^cgst$/), sgst: ix(/^sgst$/), cess: ix(/^cess$/), tot: ix(/total invoice value/), pos: ix(/place of supply/), itc: ix(/itc avalibility|itc availability/) };
  const own = rows.slice(0, 4).map((r) => cell(r[4] || r[2] || r[6])).find((x) => /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z0-9][A-Z0-9]$/.test(x)) ?? null;
  const out: GstInvoice[] = [];
  let seq = 0, amended = 0;
  for (const r of rows.slice(hi + 1)) {
    const per = periodKey(r[c.per]);
    if (!per || !cell(r[c.no])) continue;
    if (opts.month && per !== opts.month) continue;
    if (cell(r[c.amd])) amended++;
    const dt = norm(r[c.type]);
    const sign = /credit/.test(dt) ? -1 : 1;
    out.push({
      gstin: cell(r[c.gstin]).toUpperCase(), party: cell(r[c.party]), no: cell(r[c.no]), date: ymd(r[c.date], "mdy"), pos: "",
      taxable: r2(num(r[c.tv]) * sign), igst: r2(num(r[c.igst]) * sign), cgst: r2(num(r[c.cgst]) * sign), sgst: r2(num(r[c.sgst]) * sign), cess: r2(num(r[c.cess]) * sign),
      total: c.tot >= 0 ? r2(num(r[c.tot]) * sign) : null, rate: null, hsn: "", irn: "", reverseCharge: /^y/i.test(cell(r[c.rcm])),
      itc: c.itc >= 0 ? (/^y/i.test(cell(r[c.itc])) ? "Y" : /^n/i.test(cell(r[c.itc])) ? "N" : null) : null,
      docType: /credit/.test(dt) ? "credit_note" : /debit/.test(dt) ? "debit_note" : "invoice", filedIn: per, row: ++seq, lines: 1, repeats: 0,
    });
  }
  const notes = [`${out.length} documents${opts.month ? ` for ${opts.month}` : ""} read from the ${opts.kind === "gstr1" ? "GSTR-1" : "GSTR-2B"} report.`];
  if (amended) notes.push(`${amended} are amendments.`);
  if (!out.length && opts.month) notes.push(`This report has no documents for ${opts.month}. Choose another month.`);
  return { invoices: out, period: opts.month ?? null, ownGstin: own, notes };
}

/** Months present in a portal report, for the month picker. */
export function monthsIn(rows: string[][]): string[] {
  const hi = rows.findIndex((r) => r.map(norm).includes("original period"));
  if (hi < 0) return [];
  const i = rows[hi]!.map(norm).indexOf("original period");
  return [...new Set(rows.slice(hi + 1).map((r) => periodKey(r[i])).filter(Boolean) as string[])].sort();
}

/* ── GSTR-3B annual report ──────────────────────────────── */

export function readGstr3bAnnual(rows: string[][], month: string): Gstr3bRead {
  const none = (note: string): Gstr3bRead => ({ period: month, ownGstin: null, outward: zero(), rcm: zero(), itcAvailable: zero(), itcOnRcm: zero(), itcReversed: zero(), itcNet: zero(), notes: [note] });
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return none("Choose a month first.");
  const idx = (Number(m[2]) + 8) % 12; // April is 0
  const start = 7 + 5 * idx; // the first block is the year total, then one block per month from April
  const monthHeader = rows.find((r) => r.map(norm).includes("april"));
  const hdrCol = monthHeader ? monthHeader.map(norm).indexOf("april") : 7;
  const base = hdrCol + 5 * idx;
  void start;
  const find = (re: RegExp, from = 0) => rows.findIndex((r, i) => i >= from && re.test(norm(r[1]) + " " + norm(r[0])));
  const take = (rowIx: number, withTaxable: boolean): TaxSplit => {
    const r = rows[rowIx] ?? [];
    return withTaxable
      ? { taxable: num(r[base]), igst: num(r[base + 1]), cgst: num(r[base + 2]), sgst: num(r[base + 3]), cess: num(r[base + 4]) }
      : { taxable: 0, igst: num(r[base]), cgst: num(r[base + 1]), sgst: num(r[base + 2]), cess: num(r[base + 3]) };
  };
  const rOut = find(/\(a\)\s*outward taxable/), rRcm = find(/\(d\)\s*inward supplies \(liable to reverse charge\)/), rItcStart = find(/^eligible itc|eligible itc/);
  if (rOut < 0 || rItcStart < 0) return none("This does not look like a GSTR-3B annual report (no outward supplies or eligible ITC table).");
  const rOnRcm = find(/inward supplies liable to reverse charge\(other than 1 & 2/, rItcStart);
  const rNet = find(/\(c\) net itc available/, rItcStart);
  const rRev = find(/\(b\) itc reversed/, rItcStart);
  const own = rows.slice(0, 4).flat().map(cell).find((x) => /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z0-9][A-Z0-9]$/.test(x)) ?? null;
  return {
    period: month, ownGstin: own, outward: take(rOut, true), rcm: rRcm >= 0 ? take(rRcm, true) : zero(),
    itcAvailable: zero(), itcOnRcm: rOnRcm >= 0 ? take(rOnRcm, false) : zero(), itcReversed: rRev >= 0 ? take(rRev, false) : zero(),
    itcNet: rNet >= 0 ? take(rNet, false) : zero(), notes: [],
  };
}

export { normInvoiceNo };
