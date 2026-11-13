/**
 * Excel files with several sheets. Tally adds every export as a NEW sheet of the same file when the file is not renamed, so
 * the first sheet is often an older month, or another client's. Choose the sheet that belongs to this client (the latest one if
 * several do), and say which sheet was read and which were not.
 */

export interface Sheet {
  name: string;
  rows: string[][];
}
export interface SheetChoice {
  sheet: Sheet;
  /** Said to the person in the activity log; null when there was nothing to choose. */
  note: string | null;
}

const LEGAL = /\b(pvt|private|ltd|limited|llp|llc|inc|co|company|the|and|m\/s|ms)\b/g;
const tokens = (s: string) =>
  s
    .toLowerCase()
    .replace(LEGAL, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t.length > 2);

/** The first rows of a sheet as text: the company and period titles sit there. */
const head = (rows: string[][]) => rows.slice(0, 8).map((r) => r.join(" ")).join(" ");

/** True when every meaningful word of the client's name appears in the sheet's title rows. */
export const mentionsClient = (rows: string[][], client: string | null | undefined): boolean => {
  const want = tokens(client ?? "");
  if (!want.length) return false;
  const have = new Set(tokens(head(rows)));
  return want.every((t) => have.has(t));
};

export function selectSheet(sheets: Sheet[], client: string | null | undefined): SheetChoice | null {
  if (!sheets.length) return null;
  if (sheets.length === 1) return { sheet: sheets[0], note: null };
  const mine = sheets.filter((s) => mentionsClient(s.rows, client));
  const chosen = mine.length ? mine[mine.length - 1] : sheets[sheets.length - 1];
  const others = sheets.length - 1;
  const note = mine.length
    ? `This file has ${sheets.length} sheets. FynHelp read "${chosen.name}", the latest sheet for ${client}. The other ${others} sheet${others === 1 ? " was" : "s were"} not read. To avoid this, rename the file with the month before each Tally export.`
    : `This file has ${sheets.length} sheets and none of them names ${client ?? "this client"}. FynHelp read the last sheet, "${chosen.name}". Check that it belongs to this client. The other ${others} sheet${others === 1 ? " was" : "s were"} not read.`;
  return { sheet: chosen, note };
}

/* ── choosing by content ───────────────────────────────────────────────────── */

import { mapColumns, rowsFromTable } from "./table";
import { detectRegister } from "./registers";
import { parseDate } from "../core";

const norm = (h: unknown) => String(h ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const NOT_TRANSACTIONS_NAME = /\b(tds|challan|gst|gstr|summary|index|cover|notes?|instructions?|ledger master|payroll|salary)\b/i;
const BANKISH_NAME = /\b(bank|cash|sbi|hdfc|icici|axis|kotak|statement|day ?book)\b/i;

interface SheetInfo {
  sheet: Sheet;
  position: number;
  lines: number;
  register: boolean;
  headerKey: string | null;
}

function inspect(sheet: Sheet, position: number, side: "bank" | "books" | undefined): SheetInfo {
  const map = mapColumns(sheet.rows);
  let lines = 0;
  if (map) lines = rowsFromTable(sheet.rows, side)?.length ?? 0;
  const register = !!detectRegister(sheet.rows, sheet.name);
  const headerKey = map ? sheet.rows[map.headerRow].map(norm).join("|") : null;
  return { sheet, position, lines, register, headerKey };
}

/** True when most filled rows start with a readable date at the statement's date column. */
function looksLikeContinuation(rows: string[][], dateCol: number): boolean {
  const filled = rows.filter((r) => r.some((c) => String(c ?? "").trim()));
  if (filled.length < 1) return false;
  const dated = filled.filter((r) => parseDate(String(r[dateCol] ?? "").trim())).length;
  return dated / filled.length >= 0.6;
}

/**
 * Picks what to read from a workbook with several sheets, by looking at what is in them rather than where they sit.
 *  - A bank statement downloaded from the bank is often one table cut over several sheets (the later ones may have no header
 *    row): the pieces are joined, in sheet order, into one statement.
 *  - Sheets that are TDS challans, GST or summaries are not read as transactions when another sheet has them.
 *  - Tally adds each export as a new sheet; when several sheets hold the books, the latest one for this client is read.
 * `sheetName` is a person's own choice and wins over all of this.
 */
export function chooseSheet(
  sheets: Sheet[],
  client: string | null | undefined,
  side: "bank" | "books" | undefined,
  sheetName?: string | null,
): SheetChoice | null {
  if (!sheets.length) return null;
  const names = sheets.map((s) => `"${s.name}"`).join(", ");
  if (sheetName) {
    const pick = sheets.find((s) => s.name === sheetName);
    if (pick) return { sheet: pick, note: `Read the sheet "${pick.name}" that you chose. This file has ${sheets.length} sheets: ${names}.` };
  }
  if (sheets.length === 1) return { sheet: sheets[0], note: null };

  const info = sheets.map((s, i) => inspect(s, i, side));
  const usable = info.filter((i) => i.lines > 0 && !i.register);
  if (!usable.length) return selectSheet(sheets, client);

  const rank = (i: SheetInfo) =>
    i.lines + (BANKISH_NAME.test(i.sheet.name) ? 0.5 : 0) - (NOT_TRANSACTIONS_NAME.test(i.sheet.name) ? 0.4 : 0);

  if (side === "bank") {
    const base = [...usable].sort((a, b) => rank(b) - rank(a) || a.position - b.position)[0]!;
    const baseMap = mapColumns(base.sheet.rows)!;
    const parts: string[][][] = [];
    const used: string[] = [];
    for (const i of info) {
      if (i === base) {
        parts.push(i.sheet.rows);
        used.push(i.sheet.name);
        continue;
      }
      if (i.register && !i.headerKey) continue;
      const m = mapColumns(i.sheet.rows);
      if (m && i.headerKey === base.headerKey) {
        parts.push(i.sheet.rows.slice(m.headerRow + 1));
        used.push(i.sheet.name);
      } else if (!m && looksLikeContinuation(i.sheet.rows, baseMap.date)) {
        parts.push(i.sheet.rows);
        used.push(i.sheet.name);
      }
    }
    // Keep the header and preamble of the first piece; later pieces are plain rows.
    const first = parts.findIndex((p) => p === base.sheet.rows);
    const ordered = first > 0 ? [parts[first]!, ...parts.filter((_, k) => k !== first)] : parts;
    const rows = ordered.flat();
    const skipped = sheets.filter((s) => !used.includes(s.name));
    const note =
      used.length > 1
        ? `This statement was in ${used.length} sheets (${used.map((n) => `"${n}"`).join(", ")}). FynHelp joined them into one.${skipped.length ? ` Not read: ${skipped.map((s) => `"${s.name}"`).join(", ")}.` : ""}`
        : `This file has ${sheets.length} sheets. FynHelp read "${base.sheet.name}", the one with the transactions (${base.lines} lines). Not read: ${skipped.map((s) => `"${s.name}"`).join(", ")}. If that is the wrong sheet, choose another one.`;
    return { sheet: { name: used.join(" + "), rows }, note };
  }

  // Books: one sheet. Several with transactions: the latest one for this client, else the fullest.
  let chosen: SheetInfo;
  if (usable.length === 1) chosen = usable[0]!;
  else {
    const mine = usable.filter((i) => mentionsClient(i.sheet.rows, client));
    chosen = mine.length ? mine[mine.length - 1]! : [...usable].sort((a, b) => rank(b) - rank(a) || b.position - a.position)[0]!;
  }
  const others = sheets.filter((s) => s !== chosen.sheet).map((s) => `"${s.name}"`);
  return {
    sheet: chosen.sheet,
    note: `This file has ${sheets.length} sheets (${names}). FynHelp read "${chosen.sheet.name}", the one with the bank entries (${chosen.lines} lines). Not read: ${others.join(", ")}. If that is the wrong sheet, choose another one.`,
  };
}
