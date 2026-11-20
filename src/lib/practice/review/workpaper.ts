/**
 * Excel working papers. A CA files these as they are, so every sheet follows one layout: a header block (client, period, sources,
 * prepared by, status), a table with one row per item, difference columns that are LIVE FORMULAS and not pasted values, a control-total
 * row that must equal the source, and a remarks column. Nothing here changes the books: the file is a copy of what FynHelp found.
 */
import * as XLSX from "xlsx";

export type Cell = string | number | null | { f: string; v?: number };

export interface SheetSpec {
  name: string;
  /** Label and value pairs shown at the top: client, GSTIN, PAN, period, source files, prepared by, status. */
  header: [string, string | number][];
  columns: string[];
  rows: Cell[][];
  /** Columns (0-based) to add up in a control-total row, with its label. */
  total?: { label: string; columns: number[] };
  /** A note placed under the table (the assumptions, in plain words). */
  notes?: string[];
}

const colName = (i: number) => { let s = ""; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s; };

export function workbookBytes(sheets: SheetSpec[]): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const sp of sheets) {
    const aoa: (Cell | undefined)[][] = [];
    for (const [k, v] of sp.header) aoa.push([k, v]);
    aoa.push([]);
    const headRow = aoa.length + 1; // 1-based row of the table heading
    aoa.push(sp.columns);
    const first = aoa.length + 1;
    for (const r of sp.rows) aoa.push(r);
    const last = aoa.length;
    if (sp.total && sp.rows.length) {
      const t: (Cell | undefined)[] = new Array(sp.columns.length).fill(null);
      t[0] = sp.total.label;
      for (const c of sp.total.columns) t[c] = { f: `SUM(${colName(c)}${first}:${colName(c)}${last})` };
      aoa.push(t);
    }
    if (sp.notes?.length) { aoa.push([]); for (const n of sp.notes) aoa.push([n]); }
    const ws = XLSX.utils.aoa_to_sheet(aoa.map((r) => r.map((c) => (c && typeof c === "object" ? { t: "n", f: c.f, v: c.v ?? 0 } : c))) as never);
    ws["!cols"] = sp.columns.map((c, i) => ({ wch: i === 0 ? 30 : Math.max(14, Math.min(40, c.length + 4)) }));
    void headRow;
    XLSX.utils.book_append_sheet(wb, ws, sp.name.slice(0, 31));
  }
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

/** The row number (1-based) of the first table row on a sheet built from `header`, for formulas that point at other columns. */
export const firstRow = (headerLines: number) => headerLines + 3;
