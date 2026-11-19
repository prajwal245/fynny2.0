/**
 * Reads an uploaded GST file in the browser: a GSTR-2B JSON from the portal, or an Excel/CSV register or GSTR-2B download.
 * The file never leaves the machine; the page works on what this returns.
 */
import { readGstr2bJson, readInvoiceRows, type ReadInvoices } from "./invoices";
import { isGstr1Workbook, readGstr3bAnnualRows, type Gstr3bAnnual } from "./portalExcel";
import { readTallyRegisterWorkbook } from "./tallyRegister";

function readAs<T>(file: Blob, how: "text" | "buffer"): Promise<T> {
  // Blob.text()/arrayBuffer() are missing in some older browsers; FileReader works everywhere.
  if (how === "text" && typeof file.text === "function") return file.text() as Promise<T>;
  if (how === "buffer" && typeof file.arrayBuffer === "function") return file.arrayBuffer() as Promise<T>;
  return new Promise<T>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as T);
    r.onerror = () => reject(r.error ?? new Error("read failed"));
    if (how === "text") r.readAsText(file);
    else r.readAsArrayBuffer(file);
  });
}

const empty = (note: string): ReadInvoices => ({ invoices: [], period: null, ownGstin: null, notes: [note] });

/** `kind` says which register a Tally workbook is wanted for, because one workbook can hold the sales and the purchase register. */
export interface ReadOptions {
  kind?: "sales" | "purchase";
}

export async function readGstFile(file: File, opts: ReadOptions = {}): Promise<ReadInvoices> {
  const name = file.name.toLowerCase();
  if (file.size > 25 * 1024 * 1024) return empty("This file is larger than 25 MB. Split it by month and try again.");
  try {
    if (name.endsWith(".json")) return readGstr2bJson(await readAs<string>(file, "text"));
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await readAs<ArrayBuffer>(file, "buffer"), { type: "array", cellDates: true, raw: false });
    // The portal's GSTR-2B workbook has one sheet per section: take the invoice sheets (B2B, then credit notes), else the first sheet that reads.
    // A Tally register workbook (Sales Register, Purchase Register, Debit Note Register, Journals with GST) has no taxable-value column:
    // its own reader adds up the ledger columns. It is tried first, and only a workbook that names those registers is taken.
    const sheets = wb.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json<string[]>(wb.Sheets[name]!, { header: 1, raw: false, defval: "" }) }));
    const tally = readTallyRegisterWorkbook(sheets);
    if (tally) {
      const want = opts.kind ?? (tally.purchases ? "purchase" : "sales");
      const got = want === "sales" ? tally.sales : tally.purchases;
      if (got) return got;
      return empty(`This Tally workbook has no ${want} register sheet. Export the ${want} register from Tally (Display, Account Books, ${want === "sales" ? "Sales" : "Purchase"} Register) and try again.`);
    }
    const order = [...wb.SheetNames].sort((a, b) => rank(a) - rank(b));
    const all: ReadInvoices = { invoices: [], period: null, ownGstin: null, notes: [] };
    for (const sheet of order) {
      const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[sheet]!, { header: 1, raw: false, defval: "" });
      // The GSTR-1 workbook writes dates month first (4/22/2025); everything else here is day first.
      const r = readInvoiceRows(rows, { sheet: wb.SheetNames.length > 1 ? sheet : undefined, ...(isGstr1Workbook(rows) ? { dateOrder: "mdy" as const } : {}) });
      if (!r.invoices.length) continue;
      all.invoices.push(...r.invoices);
      all.period = all.period ?? r.period;
      all.ownGstin = all.ownGstin ?? r.ownGstin;
      all.notes.push(...r.notes);
      // A plain register has one table. The portal workbook has B2B and credit notes: keep reading those two, not the summary or exempt sheets.
      if (!/b2b|cdn/i.test(sheet)) break;
    }
    if (!all.invoices.length) return empty("No invoice table found in this file. It needs a heading row with the invoice number and the taxable value or tax columns.");
    return all;
  } catch (e) {
    return empty(`This file could not be read (${(e as Error).message}). Save it as .xlsx, .csv or the GSTR-2B .json and try again.`);
  }
}

/** The GSTR-3B annual report (Excel): twelve months in one workbook. */
export async function readGstr3bFile(file: File): Promise<Gstr3bAnnual> {
  const none = (note: string): Gstr3bAnnual => ({ startYear: null, months: [], notes: [note] });
  if (file.size > 25 * 1024 * 1024) return none("This file is larger than 25 MB.");
  try {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await readAs<ArrayBuffer>(file, "buffer"), { type: "array", cellDates: true, raw: false });
    for (const name of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[name]!, { header: 1, raw: false, defval: "" });
      const r = readGstr3bAnnualRows(rows);
      if (r.months.length) return r;
    }
    return none("This does not look like the GSTR-3B annual report. Download it from the GST portal (Returns, Annual, GSTR-3B) or send the monthly JSON.");
  } catch (e) {
    return none(`This file could not be read (${(e as Error).message}). Save it as .xlsx and try again.`);
  }
}

function rank(sheet: string): number {
  const s = sheet.toLowerCase();
  if (/^b2b$|b2b\b(?!a)/.test(s) && !/b2ba/.test(s)) return 0;
  if (/cdnr?\b(?!a)/.test(s) && !/cdnra/.test(s)) return 1;
  if (/read|summary|help|itc/.test(s)) return 9;
  return 5;
}

/** CSV of a worklist, safe to open in Excel (formula characters are neutralised). */
export function toCsv(head: string[], rows: (string | number | null)[][]): string {
  const cell = (v: string | number | null) => {
    let s = v === null ? "" : String(v);
    if (/^[=+\-@]/.test(s) && typeof v === "string") s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}
