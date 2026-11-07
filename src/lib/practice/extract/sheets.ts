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
