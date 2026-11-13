/**
 * File readers used by the Extract agent on the server: PDF text layer and
 * Excel sheets. Both are loaded lazily so a missing optional package degrades
 * to the AI reader instead of breaking the server bundle.
 */
import { PdfPasswordError } from "./extract/pipeline";
import { columnMarks, findColumns, type PdfTextItem, type StatementColumns } from "./extract/pdfColumns";

/**
 * The text of a PDF. A locked PDF needs `password`; the reader tells "no password" (code 1) from "wrong password" (code 2).
 * The password is used once to open the file in memory and is not kept anywhere.
 */
export async function pdfText(
  bytes: Uint8Array,
  password?: string,
): Promise<{ text: string; pages: number }> {
  const { getDocumentProxy, extractText } = await import("unpdf");
  let doc;
  try {
    doc = await getDocumentProxy(new Uint8Array(bytes), password ? { password } : {});
  } catch (e) {
    const err = e as { name?: string; code?: number; message?: string };
    if (err.name === "PasswordException" || /password/i.test(String(err.message))) {
      const wrong = err.code === 2 || /incorrect/i.test(String(err.message));
      throw new PdfPasswordError(wrong ? "wrong" : "needed", "PDF");
    }
    throw e;
  }
  // Bank statements run to hundreds of pages (a quarterly current-account statement can be 180): read them all.
  const pages = Math.min(doc.numPages, 600);
  // Keep line structure: statement parsing relies on one transaction per line.
  const out: string[] = [];
  let columns: StatementColumns | null = null;
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let line = "";
    let lastY: number | null = null;
    const raw = (content.items as { str?: string; transform?: number[]; width?: number; hasEOL?: boolean }[]).filter((it) => typeof it.str === "string");
    // Amounts under a Debit or Credit header get a Dr or Cr, so direction survives a missing or cut-off balance column.
    const positioned: PdfTextItem[] = raw.map((it) => ({ str: it.str as string, x: it.transform?.[4] ?? 0, y: it.transform?.[5] ?? 0, width: it.width ?? 0 }));
    const own = findColumns(positioned);
    // A later page often does not repeat the header: it keeps the columns of the page before.
    columns = own ?? columns;
    const marks = columnMarks(positioned, columns, own !== null);
    const mark = new Map<(typeof raw)[number], string>();
    raw.forEach((it, k) => {
      const m = marks.get(positioned[k]);
      if (m) mark.set(it, m);
    });
    for (const item of raw) {
      const y = item.transform?.[5] ?? null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 2 && line) {
        out.push(line.trim());
        line = "";
      }
      line += (line && !line.endsWith(" ") ? " " : "") + item.str + (mark.has(item) ? ` ${mark.get(item)}` : "");
      if (item.hasEOL) {
        out.push(line.trim());
        line = "";
      }
      lastY = y;
    }
    if (line.trim()) out.push(line.trim());
  }
  if (!out.length) {
    const { text } = await extractText(doc, { mergePages: true });
    return { text: String(text ?? ""), pages };
  }
  return { text: out.join("\n"), pages };
}

/** Every text piece of every page with its position, for the table reader (`extract/pdfTable.ts`). */
export async function pdfItems(
  bytes: Uint8Array,
  password?: string,
): Promise<import("./extract/pdfTable").PosItem[][]> {
  const { getDocumentProxy } = await import("unpdf");
  const doc = await getDocumentProxy(new Uint8Array(bytes), password ? { password } : {});
  const out: import("./extract/pdfTable").PosItem[][] = [];
  for (let i = 1; i <= Math.min(doc.numPages, 600); i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    out.push(
      (content.items as { str?: string; transform?: number[]; width?: number }[])
        .filter((it) => typeof it.str === "string")
        .map((it) => ({ str: it.str as string, x: it.transform?.[4] ?? 0, y: it.transform?.[5] ?? 0, width: it.width ?? 0 })),
    );
  }
  return out;
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** First sheet with data, as rows of strings. Date cells become YYYY-MM-DD. */
export async function loadSheetReader(): Promise<
  (bytes: Uint8Array) => string[][]
> {
  const XLSX = await import("xlsx");
  return (bytes: Uint8Array) => {
    const wb = XLSX.read(bytes, { type: "array", cellDates: true });
    for (const name of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], {
        header: 1,
        raw: true,
        defval: "",
      });
      const clean = rows.map((r) =>
        (r as unknown[]).map((c) =>
          c instanceof Date
            ? iso(c)
            : c === null || c === undefined
              ? ""
              : String(c),
        ),
      );
      if (clean.filter((r) => r.some((c) => c !== "")).length >= 2)
        return clean;
    }
    return [];
  };
}

/**
 * A locked Excel workbook (a modern .xlsx saved with "Encrypt with password"), opened with the password and returned as an
 * ordinary workbook. The spreadsheet reader cannot decrypt, so this runs first. Anything not locked is returned as it is.
 * Throws PdfPasswordError("needed" | "wrong", "Excel file").
 */
export async function unlockWorkbook(bytes: Uint8Array, password?: string): Promise<Uint8Array> {
  const mod = (await import("officecrypto-tool")) as unknown as { default?: OfficeCrypto } & OfficeCrypto;
  const oc: OfficeCrypto = mod.default ?? mod;
  let locked = false;
  try {
    locked = Boolean(oc.isEncrypted(Buffer.from(bytes)));
  } catch {
    return bytes;
  }
  if (!locked) return bytes;
  if (!password) throw new PdfPasswordError("needed", "Excel file");
  try {
    const out = await oc.decrypt(Buffer.from(bytes), { password });
    return new Uint8Array(out);
  } catch (e) {
    if (/password/i.test(String((e as Error)?.message))) throw new PdfPasswordError("wrong", "Excel file");
    throw e;
  }
}

interface OfficeCrypto {
  isEncrypted(input: Buffer): boolean;
  decrypt(input: Buffer, options: { password: string }): Promise<Buffer>;
}

/** Every sheet that holds data (two or more filled rows), in file order. Date cells become YYYY-MM-DD. */
export async function loadSheetsReader(): Promise<(bytes: Uint8Array) => { name: string; rows: string[][] }[]> {
  const XLSX = await import("xlsx");
  return (bytes: Uint8Array) => {
    const wb = XLSX.read(bytes, { type: "array", cellDates: true });
    const out: { name: string; rows: string[][] }[] = [];
    for (const name of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: "" });
      const clean = rows.map((r) => (r as unknown[]).map((c) => (c instanceof Date ? iso(c) : c === null || c === undefined ? "" : String(c))));
      if (clean.filter((r) => r.some((c) => c !== "")).length >= 2) out.push({ name, rows: clean });
    }
    return out;
  };
}
