/**
 * Tally's register exports (Sales Register, Purchase Register, Debit and Credit Note Registers, Journals with GST) as Excel rows.
 *
 * A Tally register has no "taxable value" column. Each voucher is one row; the party's gross total is followed by one column per
 * ledger the voucher posted to (a sales ledger, Output CGST, Output SGST, Round Off, and so on). So the taxable value is the sum of
 * the ledger columns that are not tax and not round-off, and the tax is read from the columns named CGST, SGST, IGST or cess.
 * Every voucher is tied out: its ledger columns must add up to its gross total, and a voucher that does not is named, not hidden.
 *
 * Pure and isomorphic. It reads what the file says and never guesses a column it cannot find.
 */
import { detectDateOrder, dominantPeriod, gstinKey, isoDate, money, type GstInvoice, type ReadInvoices } from "./invoices";

export type RegisterKind = "sales" | "purchase";

const r2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9% ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const TAX = /(^| )(cgst|sgst|igst|utgst|cess)( |$)/;
const ROUND = /round ?off|rounding/;
const fmt = (n: number) => `₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

interface Cols {
  date: number;
  party: number;
  vtype: number;
  vno: number;
  sinv: number;
  sdate: number;
  gstin: number;
  gross: number;
  taxable: number[];
  igst: number[];
  cgst: number[];
  sgst: number[];
  cess: number[];
  round: number[];
}

/** The header row of a Tally register: a row naming Date, Particulars, a voucher number and a gross total. */
function findHeader(rows: string[][]): { at: number; cols: Cols } | null {
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const n = (rows[i] ?? []).map(norm);
    const date = n.indexOf("date");
    const party = n.indexOf("particulars");
    const vno = n.findIndex((c) => /^voucher no/.test(c));
    const gross = n.findIndex((c) => c === "gross total");
    if (date < 0 || party < 0 || vno < 0 || gross < 0) continue;
    const cols: Cols = {
      date,
      party,
      vtype: n.findIndex((c) => c === "voucher type"),
      vno,
      sinv: n.findIndex((c) => /^supplier invoice no/.test(c)),
      sdate: n.findIndex((c) => /^supplier invoice date/.test(c)),
      gstin: n.findIndex((c) => /^gstin/.test(c)),
      gross,
      taxable: [],
      igst: [],
      cgst: [],
      sgst: [],
      cess: [],
      round: [],
    };
    const fixed = new Set([date, party, cols.vtype, vno, cols.sinv, cols.sdate, cols.gstin, gross, n.findIndex((c) => c === "narration")]);
    n.forEach((c, k) => {
      if (k <= gross && fixed.has(k)) return;
      if (k <= gross || !c) return;
      if (ROUND.test(c)) cols.round.push(k);
      else if (TAX.test(c)) {
        const t = /(cgst|sgst|igst|utgst|cess)/.exec(c)![1]!;
        (t === "cgst" ? cols.cgst : t === "igst" ? cols.igst : t === "cess" ? cols.cess : cols.sgst).push(k);
      } else cols.taxable.push(k);
    });
    return { at: i, cols };
  }
  return null;
}

const sum = (r: string[], idx: number[]) => r2(idx.reduce((t, k) => t + (money(r[k]) ?? 0), 0));

/**
 * One Tally register sheet. `note: true` reads a Debit Note Register (purchase returns) or a Credit Note Register (sales returns):
 * those reduce the register, so they are read as credit notes with negative amounts, the way GSTR-2B and GSTR-1 show them.
 */
export function readTallyRegisterRows(rowsIn: string[][], opts: { kind: RegisterKind; note?: boolean }): ReadInvoices {
  const rows = rowsIn.map((r) => r.map((c) => ((c as unknown) instanceof Date ? (c as unknown as Date).toISOString().slice(0, 10) : c)));
  const head = findHeader(rows);
  if (!head) return { invoices: [], period: null, ownGstin: null, notes: ["This sheet is not a Tally register: no heading row with Date, Particulars, Voucher No. and Gross Total."] };
  const { cols } = head;
  const body = rows.slice(head.at + 1);
  const order = detectDateOrder(body.map((r) => r[cols.date]));
  const sign = opts.note ? -1 : 1;
  const invoices: GstInvoice[] = [];
  const untied: string[] = [];
  let noSupplierNo = 0;
  const label = opts.kind === "sales" ? "sales" : "purchase";

  body.forEach((r, k) => {
    const first = String(r[0] ?? "");
    if (/^\s*(grand\s*)?total\b/i.test(first) || !r.some((x) => String(x ?? "").trim())) return;
    const voucherDate = isoDate(r[cols.date], order);
    const vno = String(r[cols.vno] ?? "").trim();
    if (!voucherDate || !vno) return; // a section line, not a voucher
    const gross = money(r[cols.gross]);
    const taxable = sum(r, cols.taxable);
    const igst = sum(r, cols.igst);
    const cgst = sum(r, cols.cgst);
    const sgst = sum(r, cols.sgst);
    const cess = sum(r, cols.cess);
    const round = sum(r, cols.round);
    const supplierNo = cols.sinv >= 0 ? String(r[cols.sinv] ?? "").trim() : "";
    if (opts.kind === "purchase" && !supplierNo) noSupplierNo++;
    const no = opts.kind === "purchase" ? supplierNo || vno : vno;
    const invDate = opts.kind === "purchase" && cols.sdate >= 0 ? isoDate(r[cols.sdate], "dmy") : null;
    // The ledger columns must explain the party's gross total. A difference is a ledger column this reader did not recognise or a
    // voucher edited by hand; say so rather than let the taxable value quietly be wrong.
    if (gross !== null) {
      const gap = r2(Math.abs(gross) - (taxable + igst + cgst + sgst + cess + round));
      if (Math.abs(gap) > 1) untied.push(`${no} (${fmt(gap)})`);
    }
    const g = gstinKey(String(cols.gstin >= 0 ? r[cols.gstin] ?? "" : "")).replace(/^-+$/, "");
    invoices.push({
      gstin: g,
      party: String(r[cols.party] ?? "").trim(),
      no,
      date: invDate ?? voucherDate,
      bookedOn: invDate && invDate !== voucherDate ? voucherDate : null,
      pos: "",
      taxable: r2(sign * taxable),
      igst: r2(sign * igst),
      cgst: r2(sign * cgst),
      sgst: r2(sign * sgst),
      cess: r2(sign * cess),
      total: gross === null ? null : r2(sign * Math.abs(gross)),
      rate: null,
      hsn: "",
      irn: "",
      reverseCharge: false,
      itc: null,
      docType: opts.note ? "credit_note" : "invoice",
      filedIn: null,
      row: head.at + 2 + k,
      lines: 1,
      repeats: 0,
    });
  });

  const notes: string[] = [];
  if (!invoices.length) return { invoices, period: null, ownGstin: null, notes: [`No ${label} vouchers found under the heading row of this register.`] };
  const t = invoices.reduce((a, i) => a + i.taxable, 0);
  const tax = invoices.reduce((a, i) => a + i.igst + i.cgst + i.sgst + i.cess, 0);
  notes.push(`Tally ${opts.note ? (opts.kind === "purchase" ? "debit note" : "credit note") + " register" : label + " register"}: ${invoices.length} vouchers, taxable value ${fmt(t)}, tax ${fmt(tax)}. Taxable value is the sum of the ledger columns that are not tax or round-off.`);
  if (untied.length) notes.push(`${untied.length} voucher${untied.length === 1 ? "'s" : "s'"} ledger columns do not add up to the gross total (${untied.slice(0, 4).join(", ")}${untied.length > 4 ? ", ..." : ""}); check those vouchers in Tally.`);
  if (noSupplierNo) notes.push(`${noSupplierNo} purchase voucher${noSupplierNo === 1 ? " has" : "s have"} no supplier invoice number, so the voucher number was used and cannot match GSTR-2B.`);
  return { invoices, period: dominantPeriod(invoices), ownGstin: null, notes };
}

/* ── Journals with GST ─────────────────────────────────── */

export interface JournalGst {
  vouchers: number;
  /** Journals that debit an Input CGST, SGST or IGST ledger (not reverse charge): tax credit taken outside the purchase register. */
  inputCreditJournals: { no: string; date: string | null; amount: number }[];
  inputCredit: number;
  note: string;
}

function journalHeaderAt(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const n = (rows[i] ?? []).map(norm);
    if (n.includes("date") && n.includes("ledger") && n.includes("debit") && n.includes("credit")) return i;
  }
  return -1;
}
const isJournalSheet = (rows: string[][]) => journalHeaderAt(rows) >= 0;

/** The "Journals with GST" sheet: one voucher over several rows, the date and voucher number on the first. */
export function readTallyJournalsGst(rows: string[][]): JournalGst | null {
  const at = journalHeaderAt(rows);
  if (at < 0) return null;
  const n = rows[at]!.map(norm);
  const c = { date: n.indexOf("date"), no: n.findIndex((x) => /^voucher no/.test(x)), ledger: n.indexOf("ledger"), debit: n.indexOf("debit") };
  const body = rows.slice(at + 1);
  const order = detectDateOrder(body.map((r) => r[c.date]));
  const list: JournalGst["inputCreditJournals"] = [];
  const seen = new Set<string>();
  let current: { no: string; date: string | null } | null = null;
  for (const r of body) {
    if (/^\s*total\b/i.test(String(r[0] ?? ""))) continue;
    if (String(r[c.date] ?? "").trim()) current = { no: String(r[c.no] ?? "").trim(), date: isoDate(r[c.date], order) };
    if (!current) continue;
    seen.add(current.no);
    const ledger = norm(r[c.ledger]);
    const debit = money(r[c.debit]) ?? 0;
    if (debit > 0 && /input/.test(ledger) && TAX.test(ledger) && !/rcm|reverse/.test(ledger)) {
      const hit = list.find((x) => x.no === current!.no);
      if (hit) hit.amount = r2(hit.amount + debit);
      else list.push({ no: current.no, date: current.date, amount: r2(debit) });
    }
  }
  const inputCredit = r2(list.reduce((t, x) => t + x.amount, 0));
  const note = list.length
    ? `${list.length} journal voucher${list.length === 1 ? "" : "s"} take input tax credit of ${fmt(inputCredit)} outside the purchase register (${list
        .slice(0, 4)
        .map((x) => x.no)
        .join(", ")}${list.length > 4 ? ", ..." : ""}). GSTR-2B matching does not cover them; check each against a supplier invoice.`
    : "No journal voucher takes input tax credit outside the purchase register.";
  return { vouchers: seen.size, inputCreditJournals: list, inputCredit, note };
}

/* ── the workbook ──────────────────────────────────────── */

export interface TallySheet {
  name: string;
  rows: string[][];
}

export interface TallyRegisters {
  sales: ReadInvoices | null;
  purchases: ReadInvoices | null;
  journals: JournalGst | null;
}

/** Which register a sheet is, from its name or its title line. */
function sheetKind(s: TallySheet): "sales" | "purchase" | "debit" | "credit" | "journal" | null {
  const text = norm(`${s.name} ${(s.rows[0] ?? []).join(" ")} ${(s.rows[1] ?? []).join(" ")}`);
  if (/journals? with gst|journal vouchers/.test(text)) return "journal";
  if (/debit note register/.test(text)) return "debit";
  if (/credit note register/.test(text)) return "credit";
  if (/purchase register/.test(text)) return "purchase";
  if (/sales register/.test(text)) return "sales";
  return null;
}

/**
 * Reads whichever Tally registers a workbook holds. Returns null when no sheet is a Tally register, so the caller can fall back to
 * the general invoice reader. Debit notes are merged into purchases and credit notes into sales, as negative amounts.
 */
export function readTallyRegisterWorkbook(sheets: TallySheet[]): TallyRegisters | null {
  // A sheet counts as a Tally register only if it has Tally's heading row. A plain purchase register that merely
  // carries the words "Purchase Register" in its sheet name is left to the general invoice reader.
  const found = sheets.map((s) => ({ s, k: sheetKind(s) })).filter((x) => x.k && (x.k === "journal" ? isJournalSheet(x.s.rows) : findHeader(x.s.rows)));
  if (!found.length) return null;
  const merge = (parts: ReadInvoices[]): ReadInvoices | null => {
    const good = parts.filter((p) => p.invoices.length);
    if (!good.length) return parts.length ? parts[0]! : null;
    const invoices = good.flatMap((p) => p.invoices);
    return { invoices, period: dominantPeriod(invoices), ownGstin: null, notes: good.flatMap((p) => p.notes) };
  };
  const sales: ReadInvoices[] = [];
  const purchases: ReadInvoices[] = [];
  let journals: JournalGst | null = null;
  for (const { s, k } of found) {
    if (k === "sales") sales.push(readTallyRegisterRows(s.rows, { kind: "sales" }));
    else if (k === "credit") sales.push(readTallyRegisterRows(s.rows, { kind: "sales", note: true }));
    else if (k === "purchase") purchases.push(readTallyRegisterRows(s.rows, { kind: "purchase" }));
    else if (k === "debit") purchases.push(readTallyRegisterRows(s.rows, { kind: "purchase", note: true }));
    else if (k === "journal") journals = readTallyJournalsGst(s.rows);
  }
  const p = merge(purchases);
  if (p && journals) p.notes.push(journals.note);
  return { sales: merge(sales), purchases: p, journals };
}
