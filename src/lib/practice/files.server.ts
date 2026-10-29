/**
 * File readers used by the Extract agent on the server: PDF text layer and
 * Excel sheets. Both are loaded lazily so a missing optional package degrades
 * to the AI reader instead of breaking the server bundle.
 */
import { PdfPasswordError } from "./extract/pipeline";
import { columnMarks, findColumns, type PdfTextItem, type StatementColumns } from "./extract/pdfColumns";

export async function pdfText(
  bytes: Uint8Array,
): Promise<{ text: string; pages: number }> {
  const { getDocumentProxy, extractText } = await import("unpdf");
  let doc;
  try {
    doc = await getDocumentProxy(new Uint8Array(bytes));
  } catch (e) {
    const name = (e as { name?: string })?.name ?? "";
    if (
      name === "PasswordException" ||
      /password/i.test(String((e as Error)?.message))
    )
      throw new PdfPasswordError();
    throw e;
  }
  const pages = Math.min(doc.numPages, 40);
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
