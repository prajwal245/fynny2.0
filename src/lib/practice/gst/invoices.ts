/**
 * Invoice-level GST data, read from the three places a CA meets it: the firm's own register (a GST sales or purchase register
 * exported as Excel or CSV), the GSTR-2B the portal lets you download (JSON or Excel), and any other invoice list.
 *
 * Pure and isomorphic: it runs in the browser (so a large file never has to travel to the server) and on the server. It reads what
 * the file says and nothing more: a column it cannot find is left empty, never guessed. Several rows for one invoice (one per tax
 * rate) are added up into one invoice, the way the portal itself presents it.
 */

export interface GstInvoice {
  /** The other party's GSTIN (the supplier on a purchase register or GSTR-2B, the customer on a sales register). Empty when unregistered. */
  gstin: string;
  party: string;
  /** The invoice or note number as written. */
  no: string;
  /** ISO date, or null when the file had none we could read. */
  date: string | null;
  /** Place of supply: the two-digit state code when the file says it. */
  pos: string;
  taxable: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
  /** Invoice value as the file states it, or null when it does not. */
  total: number | null;
  /** The rate the file states, when it does. */
  rate: number | null;
  hsn: string;
  irn: string;
  reverseCharge: boolean;
  /** GSTR-2B: whether the portal says the ITC is available. */
  itc: "Y" | "N" | null;
  /** invoice, credit note or debit note. Credit notes carry negative amounts. */
  docType: "invoice" | "credit_note" | "debit_note";
  /** The filing period the supplier reported it in ("2026-09"), when known. */
  filedIn: string | null;
  /** First source row (1-based in the file), for messages. */
  row: number;
  /** How many source rows were added up into this invoice. */
  lines: number;
}

export interface ReadInvoices {
  invoices: GstInvoice[];
  /** The period the file is for ("2026-09"), when the file names it. */
  period: string | null;
  /** The GSTIN of the taxpayer the file is for, when the file names it (GSTR-2B does). */
  ownGstin: string | null;
  /** What was found and what was not, in plain words, for the person who uploaded it. */
  notes: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/* ── small helpers ──────────────────────────────────────── */

const normHead = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[_\s]+/g, " ")
    .replace(/[^a-z0-9%/ ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export function money(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const s = String(raw ?? "")
    .replace(/[₹,\s]/g, "")
    .replace(/^\((.*)\)$/, "-$1")
    .replace(/(cr|dr)$/i, "");
  if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

/** dd-mm-yyyy, dd/mm/yyyy, yyyy-mm-dd, dd-Mon-yyyy, or an Excel serial number. */
export function isoDate(raw: unknown): string | null {
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw.toISOString().slice(0, 10);
  if (typeof raw === "number" && raw > 20000 && raw < 80000) return new Date(Math.round((raw - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return validYmd(s.slice(0, 10));
  let m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(s);
  if (m) {
    const y = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return validYmd(`${y}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`);
  }
  m = /^(\d{1,2})[-\s]([A-Za-z]{3})[a-z]*[-\s,]*(\d{2,4})$/.exec(s);
  if (m) {
    const mon = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(m[2]!.toLowerCase());
    if (mon >= 0) {
      const y = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
      return validYmd(`${y}-${String(mon + 1).padStart(2, "0")}-${m[1]!.padStart(2, "0")}`);
    }
  }
  return null;
}

function validYmd(s: string): string | null {
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  if (!(y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 ? s : null;
}

/** The invoice number as it is compared: upper case, no spaces or punctuation. "inv/0042-25" and "INV 0042 25" are one number. */
export const normInvoiceNo = (s: string) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** The same number with leading zeros inside every digit run removed: "INV0042" and "INV42" are then equal. */
export const looseInvoiceNo = (s: string) => normInvoiceNo(s).replace(/\d+/g, (d) => d.replace(/^0+(?=\d)/, ""));

export const gstinKey = (s: string) => String(s ?? "").toUpperCase().replace(/\s+/g, "");

/** "2026-09" from a GSTR-2B period such as "092026". */
const periodFromFp = (fp: unknown): string | null => {
  const m = /^(0[1-9]|1[0-2])(20\d{2})$/.exec(String(fp ?? "").trim());
  return m ? `${m[2]}-${m[1]}` : null;
};

/* ── the column names each source uses ──────────────────── */

type Field = "gstin" | "party" | "no" | "date" | "pos" | "taxable" | "igst" | "cgst" | "sgst" | "cess" | "total" | "rate" | "hsn" | "irn" | "rcm" | "itc" | "type" | "filed";

const SYNONYMS: Record<Field, (string | RegExp)[]> = {
  gstin: ["gstin of supplier", "supplier gstin", "gstin of customer", "customer gstin", "party gstin", "gstin/uin", "gstin uin", "gstin", "ctin", "vendor gstin", "buyer gstin", "recipient gstin"],
  party: ["trade/legal name", "trade legal name", "trade name", "legal name", "supplier name", "customer name", "party name", "name of supplier", "name of customer", "vendor name", "vendor", "supplier", "customer", "party", "particulars", "receiver name", "buyer name"],
  no: ["invoice number", "invoice no", "inv no", "invoice no/date", "bill number", "bill no", "document number", "document no", "voucher no", "voucher number", "note number", "note no", "supplier invoice no", "invoice"],
  date: ["invoice date", "bill date", "document date", "note date", "voucher date", "date of invoice", "date"],
  pos: ["place of supply", "pos"],
  taxable: ["taxable value", "taxable amount", "taxable val", "taxable"],
  igst: ["integrated tax", "igst amount", "igst"],
  cgst: ["central tax", "cgst amount", "cgst"],
  sgst: ["state/ut tax", "state ut tax", "state tax", "sgst amount", "sgst/utgst", "sgst", "utgst"],
  cess: ["cess amount", "cess"],
  total: ["invoice value", "invoice amount", "invoice total", "document value", "note value", "total value", "total amount", "gross total", "bill amount", "grand total", "total"],
  rate: ["rate", "gst rate", "tax rate", "rate%", "gst %", "tax %"],
  hsn: ["hsn/sac", "hsn sac", "hsn code", "sac code", "hsn", "sac"],
  irn: ["irn"],
  rcm: ["supply attract reverse charge", "reverse charge", "rcm"],
  itc: ["itc availability", "itc available", "eligible for itc", "itc"],
  type: ["invoice type", "document type", "note type", "supply type", "type"],
  filed: ["gstr-1/iff/gstr-5 period", "gstr1 period", "gstr-1 period", "filing period", "return period"],
};

function mapHeader(cells: string[]): Partial<Record<Field, number>> {
  const norm = cells.map(normHead);
  const out: Partial<Record<Field, number>> = {};
  const taken = new Set<number>();
  // Longer, more specific names first, so "invoice value" is the total and "invoice number" is the number.
  (Object.keys(SYNONYMS) as Field[]).forEach((f) => {
    for (const w of SYNONYMS[f]) {
      const i = norm.findIndex((c, k) => !taken.has(k) && c !== "" && (typeof w === "string" ? c === w || (w.length >= 4 && c.startsWith(w)) : w.test(c)));
      if (i >= 0) {
        out[f] = i;
        taken.add(i);
        return;
      }
    }
  });
  return out;
}

/** The header row of an invoice table: the row in the first 40 that names the most of the fields we read. */
function findInvoiceHeader(rows: string[][]): { at: number; map: Partial<Record<Field, number>> } | null {
  let best: { at: number; map: Partial<Record<Field, number>>; score: number } | null = null;
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const row = rows[i]!;
    if (row.filter((c) => String(c ?? "").trim()).length < 3) continue;
    const map = mapHeader(row.map((c) => String(c ?? "")));
    const score = (["no", "taxable", "igst", "cgst", "sgst", "gstin", "date", "total"] as Field[]).filter((f) => map[f] !== undefined).length + (map.no !== undefined && map.taxable !== undefined ? 3 : 0);
    if (map.no !== undefined && score >= 3 && (!best || score > best.score)) best = { at: i, map, score };
  }
  return best;
}

/* ── tables (Excel and CSV rows) ────────────────────────── */

function docTypeOf(raw: string, noRaw: string, headerHint: string): GstInvoice["docType"] {
  const s = `${raw} ${headerHint}`.toLowerCase();
  if (/credit|\bcdn?\b.*\bc\b|^c$/.test(s) || /^c$/i.test(raw.trim())) return "credit_note";
  if (/debit|^d$/.test(s) || /^d$/i.test(raw.trim())) return "debit_note";
  if (/credit note|\bcn\b/i.test(noRaw)) return "credit_note";
  return "invoice";
}

/** Reads an invoice table. `hint` says which way a note column such as "C" / "D" is to be read; leave it empty for a plain register. */
export function readInvoiceRows(rowsIn: string[][], opts: { sheet?: string } = {}): ReadInvoices {
  const notes: string[] = [];
  const rows = rowsIn.map((r) => r.map((c) => ((c as unknown) instanceof Date ? (c as unknown as Date).toISOString().slice(0, 10) : c)));
  const head = findInvoiceHeader(rows);
  if (!head) return { invoices: [], period: null, ownGstin: null, notes: ["No invoice table found: the file needs a heading row with at least an invoice number and the taxable value or tax columns."] };
  const m = head.map;
  const cell = (r: string[], f: Field) => (m[f] === undefined ? "" : r[m[f]!]);
  const missing = (["gstin", "date", "taxable"] as Field[]).filter((f) => m[f] === undefined);
  if (missing.length) notes.push(`No column found for: ${missing.map((f) => ({ gstin: "GSTIN", date: "invoice date", taxable: "taxable value" })[f as "gstin" | "date" | "taxable"]).join(", ")}. Those checks are skipped.`);
  if (opts.sheet) notes.push(`Read from the sheet "${opts.sheet}".`);

  const byKey = new Map<string, GstInvoice>();
  const totalsSeen = new Map<string, number[]>();
  const order: string[] = [];
  let sourceRows = 0;
  for (let k = head.at + 1; k < rows.length; k++) {
    const r = rows[k]!;
    if (!r.some((x) => String(x ?? "").trim())) continue;
    const first = String(r[0] ?? "");
    if (/^\s*(grand\s*)?total\b/i.test(first) || r.some((x) => /^\s*(grand\s*)?total\s*$/i.test(String(x ?? "")))) continue;
    const no = String(cell(r, "no") ?? "").trim();
    const taxable = money(cell(r, "taxable"));
    const igst = money(cell(r, "igst")) ?? 0;
    const cgst = money(cell(r, "cgst")) ?? 0;
    const sgst = money(cell(r, "sgst")) ?? 0;
    // A row with no invoice number and no amounts is a section line or a note, not an invoice.
    if (!no && taxable === null && !igst && !cgst && !sgst) continue;
    sourceRows++;
    const docType = docTypeOf(String(cell(r, "type") ?? "").trim(), no, "");
    const gstin = gstinKey(String(cell(r, "gstin") ?? ""));
    const key = `${gstin}|${normInvoiceNo(no) || `row${k}`}|${docType}`;
    // A credit note reduces the amount whichever way the file signs it.
    const sg = (n: number) => (docType === "credit_note" ? -Math.abs(n) : n);
    const amounts = { taxable: sg(taxable ?? 0), igst: sg(igst), cgst: sg(cgst), sgst: sg(sgst), cess: sg(money(cell(r, "cess")) ?? 0) };
    const total = money(cell(r, "total"));
    if (total !== null) totalsSeen.set(key, [...(totalsSeen.get(key) ?? []), sg(total)]);
    const existing = byKey.get(key);
    if (existing) {
      existing.taxable = round2(existing.taxable + amounts.taxable);
      existing.igst = round2(existing.igst + amounts.igst);
      existing.cgst = round2(existing.cgst + amounts.cgst);
      existing.sgst = round2(existing.sgst + amounts.sgst);
      existing.cess = round2(existing.cess + amounts.cess);
      existing.lines++;
      continue;
    }
    const rateRaw = money(cell(r, "rate"));
    const posRaw = String(cell(r, "pos") ?? "").trim();
    byKey.set(key, {
      gstin,
      party: String(cell(r, "party") ?? "").trim(),
      no,
      date: isoDate(cell(r, "date")),
      pos: /^\d{2}/.test(posRaw) ? posRaw.slice(0, 2) : posRaw,
      ...amounts,
      total: null,
      rate: rateRaw === null ? null : rateRaw > 0 && rateRaw < 1 ? round2(rateRaw * 100) : rateRaw,
      hsn: String(cell(r, "hsn") ?? "").trim(),
      irn: String(cell(r, "irn") ?? "").trim(),
      reverseCharge: /^(y|yes|true|1)$/i.test(String(cell(r, "rcm") ?? "").trim()),
      itc: /^(y|yes)$/i.test(String(cell(r, "itc") ?? "").trim()) ? "Y" : /^(n|no)$/i.test(String(cell(r, "itc") ?? "").trim()) ? "N" : null,
      docType,
      filedIn: periodFromFp(String(cell(r, "filed") ?? "").replace(/\D/g, "")) ?? null,
      row: k + 1,
      lines: 1,
    });
    order.push(key);
  }
  // The invoice value is usually printed on every line of an invoice: take it once. Different values on each line are line values: add them.
  for (const [key, vals] of totalsSeen) {
    const inv = byKey.get(key);
    if (inv) inv.total = round2(vals.every((v) => v === vals[0]) ? vals[0]! : vals.reduce((a, b) => a + b, 0));
  }
  const invoices = order.map((k) => byKey.get(k)!);
  if (sourceRows > invoices.length) notes.push(`${sourceRows} rows added up into ${invoices.length} invoices (one row per tax rate is normal).`);
  return { invoices, period: dominantPeriod(invoices), ownGstin: null, notes };
}

/** The month most invoices fall in ("2026-09"), when one month clearly holds most of them. */
export function dominantPeriod(invoices: { date: string | null }[]): string | null {
  const n = new Map<string, number>();
  for (const i of invoices) if (i.date) n.set(i.date.slice(0, 7), (n.get(i.date.slice(0, 7)) ?? 0) + 1);
  const best = [...n.entries()].sort((a, b) => b[1] - a[1])[0];
  return best && best[1] >= invoices.length * 0.5 ? best[0] : null;
}

/* ── the portal's JSON ──────────────────────────────────── */

const numJ = (v: unknown) => {
  const n = money(v);
  return n === null ? 0 : n;
};

/** GSTR-2B as downloaded from the GST portal: `data.docdata.b2b` (invoices) and `cdnr` (credit and debit notes), each by supplier. */
export function readGstr2bJson(input: unknown): ReadInvoices {
  const notes: string[] = [];
  let doc: Record<string, unknown>;
  try {
    doc = (typeof input === "string" ? JSON.parse(input) : input) as Record<string, unknown>;
  } catch {
    return { invoices: [], period: null, ownGstin: null, notes: ["The file is not valid JSON. Download GSTR-2B again from the GST portal (Returns → GSTR-2B → Download → JSON)."] };
  }
  const root = (doc?.["data"] as Record<string, unknown> | undefined) ?? doc;
  const docdata = ((root?.["docdata"] ?? root?.["data"]) as Record<string, unknown> | undefined) ?? root;
  const b2b = (docdata?.["b2b"] ?? (doc as Record<string, unknown>)["b2b"]) as unknown;
  const cdnr = (docdata?.["cdnr"] ?? (doc as Record<string, unknown>)["cdnr"]) as unknown;
  const period = periodFromFp((root?.["rtnprd"] ?? doc?.["rtnprd"] ?? root?.["fp"] ?? doc?.["fp"]) as string);
  const ownGstin = String((root?.["gstin"] ?? doc?.["gstin"] ?? "") as string).toUpperCase() || null;
  if (!Array.isArray(b2b) && !Array.isArray(cdnr)) return { invoices: [], period, ownGstin, notes: ["No invoices found: this does not look like a GSTR-2B JSON (it has no b2b section)."] };

  const out: GstInvoice[] = [];
  let seq = 0;
  const push = (supplier: Record<string, unknown>, d: Record<string, unknown>, docType: GstInvoice["docType"]) => {
    let taxable = 0, igst = 0, cgst = 0, sgst = 0, cess = 0, rate: number | null = null;
    const items = Array.isArray(d["itms"]) ? (d["itms"] as Record<string, unknown>[]) : [];
    for (const it of items) {
      const det = ((it["itm_det"] as Record<string, unknown> | undefined) ?? it) as Record<string, unknown>;
      taxable += numJ(det["txval"]);
      igst += numJ(det["iamt"]);
      cgst += numJ(det["camt"]);
      sgst += numJ(det["samt"]);
      cess += numJ(det["csamt"]);
      const rt = money(det["rt"]);
      if (rt !== null) rate = rate === null || rate === rt ? rt : null;
    }
    if (!items.length) {
      taxable = numJ(d["txval"]);
      igst = numJ(d["iamt"]);
      cgst = numJ(d["camt"]);
      sgst = numJ(d["samt"]);
      cess = numJ(d["csamt"]);
    }
    const sign = docType === "credit_note" ? -1 : 1;
    const no = String((d["inum"] ?? d["ntnum"] ?? d["nt_num"] ?? "") as string).trim();
    const val = money(d["val"]);
    out.push({
      gstin: gstinKey(String(supplier["ctin"] ?? "")),
      party: String((supplier["trdnm"] ?? supplier["trade_name"] ?? "") as string).trim(),
      no,
      date: isoDate(d["dt"] ?? d["idt"] ?? d["ntdt"] ?? d["nt_dt"]),
      pos: String((d["pos"] ?? "") as string).trim().slice(0, 2),
      taxable: round2(sign * taxable),
      igst: round2(sign * igst),
      cgst: round2(sign * cgst),
      sgst: round2(sign * sgst),
      cess: round2(sign * cess),
      total: val === null ? null : round2(sign * Math.abs(val)),
      rate,
      hsn: "",
      irn: String((d["irn"] ?? "") as string).trim(),
      reverseCharge: /^(y|yes)$/i.test(String((d["rev"] ?? "") as string)),
      itc: /^y$/i.test(String((d["itcavl"] ?? "") as string)) ? "Y" : /^n$/i.test(String((d["itcavl"] ?? "") as string)) ? "N" : null,
      docType,
      filedIn: periodFromFp(String((d["supprd"] ?? supplier["supprd"] ?? "") as string)) ?? null,
      row: ++seq,
      lines: items.length || 1,
    });
  };
  for (const s of (Array.isArray(b2b) ? b2b : []) as Record<string, unknown>[]) for (const inv of (Array.isArray(s["inv"]) ? s["inv"] : []) as Record<string, unknown>[]) push(s, inv, "invoice");
  for (const s of (Array.isArray(cdnr) ? cdnr : []) as Record<string, unknown>[])
    for (const nt of (Array.isArray(s["nt"]) ? s["nt"] : []) as Record<string, unknown>[]) push(s, nt, /^c/i.test(String(nt["typ"] ?? nt["ntty"] ?? nt["nttyp"] ?? "C")) ? "credit_note" : "debit_note");
  if (!out.length) notes.push("The file has no invoices for this period.");
  else notes.push(`${out.length} documents from ${new Set(out.map((i) => i.gstin)).size} suppliers.`);
  return { invoices: out, period, ownGstin, notes };
}
