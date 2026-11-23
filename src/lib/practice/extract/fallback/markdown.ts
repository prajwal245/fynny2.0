/**
 * Turns the fallback reader's tables back into rows by the SAME deterministic table reader the product uses for spreadsheets, so
 * nothing the vendor says about amounts is trusted without passing through our own rules and the running-balance check.
 */
import type { ExtractedRow } from "../../core";
import { mapColumns, rowsFromTable } from "../table";

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
const isRule = (line: string) =>
  /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);

/** Pipe tables and simple HTML tables, in page order. */
export function markdownTables(md: string): string[][][] {
  const tables: string[][][] = [];
  const lines = md.split(/\r?\n/);
  let cur: string[][] = [];
  const flush = () => {
    if (cur.length) tables.push(cur);
    cur = [];
  };
  for (const line of lines) {
    if (/^\s*\|.*\|\s*$/.test(line)) {
      if (!isRule(line)) cur.push(cells(line));
    } else flush();
  }
  flush();
  for (const t of md.match(/<table[\s\S]*?<\/table>/gi) ?? []) {
    const rows = (t.match(/<tr[\s\S]*?<\/tr>/gi) ?? []).map((tr) =>
      (tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) ?? []).map((c) =>
        c
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/g, " ")
          .replace(/\s+/g, " ")
          .trim(),
      ),
    );
    if (rows.length) tables.push(rows);
  }
  return tables;
}

/**
 * One statement across pages: the first table with recognisable headers sets the columns; later tables with no header of their own
 * (a page that lost it) continue under the same one, and a repeated header row is dropped.
 */
export function rowsFromMarkdown(
  md: string,
  side: "bank" | "books" = "bank",
): ExtractedRow[] | null {
  const tables = markdownTables(md);
  let header: string[] | null = null;
  const merged: string[][] = [];
  for (const t of tables) {
    const map = mapColumns(t);
    if (!header) {
      if (!map) continue;
      header = t[map.headerRow] ?? t[0] ?? null;
      merged.push(...t.slice(map.headerRow));
      continue;
    }
    if (map) merged.push(...t.slice(map.headerRow + 1));
    else merged.push(...t);
  }
  if (!header || merged.length < 2) return null;
  const rows = rowsFromTable(merged, side);
  return rows && rows.length ? rows : null;
}
