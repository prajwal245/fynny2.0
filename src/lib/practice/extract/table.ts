/**
 * Deterministic reader for tabular statements: bank CSV/TSV exports, Excel
 * sheets converted to rows, and ledger/day-book exports.
 *
 * Handles the things real Indian bank files do: preamble lines above the
 * header, different column names per bank, separate debit/credit columns,
 * DR/CR suffixes, multi-line narrations and totals rows at the bottom.
 */
import {
  detectAmountPattern,
  findHeaderIndex,
  isAmountHeader,
  isCreditHeader,
  isDebitHeader,
  normaliseAmount,
  parseMoneyCell,
} from "@/lib/bankAmount";
import { parseDate, round2, type ExtractedRow } from "../core";

/* ── delimited text ─────────────────────────────────────── */

function detectDelimiter(sample: string): string {
  const lines = sample
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .slice(0, 30);
  let best = ",";
  let bestScore = -1;
  for (const d of [",", "\t", ";", "|"]) {
    const counts = lines.map((l) => splitDelimited(l, d).length);
    const common = counts.filter((c) => c > 1);
    // Prefer the delimiter that gives many columns consistently.
    const score = common.length ? common.length * Math.min(...common) : 0;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

function splitDelimited(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** Splits CSV/TSV text into rows of cells, honouring quoted newlines. */
export function parseDelimited(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "");
  const delim = detectDelimiter(clean);
  const rows: string[][] = [];
  let buf = "";
  let quotes = 0;
  for (const line of clean.split(/\r?\n/)) {
    buf = buf ? `${buf}\n${line}` : line;
    quotes += (line.match(/"/g) ?? []).length;
    if (quotes % 2 === 0) {
      rows.push(splitDelimited(buf, delim));
      buf = "";
      quotes = 0;
    }
  }
  if (buf) rows.push(splitDelimited(buf, delim));
  return rows.filter((r) => r.some((c) => c !== ""));
}

/* ── column mapping ─────────────────────────────────────── */

const norm = (h: string) =>
  h
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const has = (h: string, words: string[]) =>
  words.some((w) => norm(h) === w || norm(h).includes(w));

const DATE_WORDS = [
  "txn date",
  "transaction date",
  "tran date",
  "posting date",
  "date",
];
const VALUE_DATE_WORDS = ["value date", "value dt"];
const DESC_WORDS = [
  "narration",
  "description",
  "particulars",
  "transaction remarks",
  "remarks",
  "details",
  "transaction details",
];
const REF_WORDS = [
  "chq ref no",
  "ref no cheque no",
  "cheque no",
  "chq no",
  "ref no",
  "reference",
  "utr",
  "instrument no",
  "transaction id",
  "voucher no",
  "vch no",
];
const PARTY_WORDS = [
  "party",
  "counterparty",
  "beneficiary",
  "payee",
  "ledger",
  "account name",
  "customer",
  "vendor",
  "supplier",
];
const BALANCE_WORDS = ["balance", "closing balance", "running balance"];
const CURRENCY_WORDS = ["currency", "ccy"];

export interface ColumnMap {
  headerRow: number;
  date: number;
  valueDate: number;
  description: number;
  reference: number;
  counterparty: number;
  balance: number;
  currency: number;
  debit: number;
  credit: number;
  amount: number;
  type: number;
}

function findBy(
  headers: string[],
  words: string[],
  exclude: number[] = [],
): number {
  // Exact matches first so "date" does not grab "value date" when both exist.
  for (const w of words) {
    const i = headers.findIndex(
      (h, idx) => !exclude.includes(idx) && norm(h) === w,
    );
    if (i !== -1) return i;
  }
  return headers.findIndex((h, idx) => !exclude.includes(idx) && has(h, words));
}

/** Finds the header row and maps its columns. Returns null if none looks like a statement. */
export function mapColumns(rows: string[][]): ColumnMap | null {
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const headers = rows[r].map((c) => String(c ?? ""));
    const lower = headers.map(norm);
    const hasDate = lower.some((h) => h.includes("date"));
    const hasMoney = headers.some(
      (h) => isDebitHeader(h) || isCreditHeader(h) || isAmountHeader(h),
    );
    if (!hasDate || !hasMoney) continue;
    const detected = detectAmountPattern(headers, rows.slice(r + 1, r + 21));
    const valueDate = findBy(headers, VALUE_DATE_WORDS);
    let date = findBy(headers, DATE_WORDS, valueDate === -1 ? [] : [valueDate]);
    if (date === -1) date = valueDate;
    const balance = findBy(headers, BALANCE_WORDS);
    return {
      headerRow: r,
      date,
      valueDate,
      description: findBy(headers, DESC_WORDS),
      reference: findBy(headers, REF_WORDS),
      counterparty: findBy(headers, PARTY_WORDS),
      balance,
      currency: findBy(headers, CURRENCY_WORDS),
      debit: detected.debitIdx,
      credit: detected.creditIdx,
      // A "balance" column must never be read as the amount.
      amount:
        detected.amountIdx === balance
          ? findHeaderIndex(
              headers.map((h, i) => (i === balance ? "" : h)),
              isAmountHeader,
            )
          : detected.amountIdx,
      type: detected.typeIdx,
    };
  }
  return null;
}

const FOREIGN_CCY = /\b(USD|EUR|GBP|AED|SGD|JPY|AUD|CAD)\b|[$€£¥]/i;
const SUMMARY_LINE =
  /\b(total|opening balance|closing balance|balance b\/?f|balance c\/?f|carried forward|brought forward|statement summary|grand total)\b/i;

/**
 * Turns a table into extracted rows. `rows` includes the preamble and header.
 * Returns `null` when no header could be recognised, so the caller can fall
 * back to the AI reader instead of guessing.
 */
export function rowsFromTable(rows: string[][]): ExtractedRow[] | null {
  const map = mapColumns(rows);
  if (!map) return null;
  const header = rows[map.headerRow];
  const cell = (r: string[], i: number) =>
    i >= 0 ? String(r[i] ?? "").trim() : "";
  const unsignedSingleColumn =
    map.debit === -1 && map.credit === -1 && map.type === -1;

  const out: ExtractedRow[] = [];
  for (let r = map.headerRow + 1; r < rows.length; r++) {
    const row = rows[r];
    const rawText = header
      .map((h, i) => `${h || `col${i + 1}`}: ${cell(row, i)}`)
      .filter((s) => !s.endsWith(": "))
      .join(" | ");
    const dateCell = cell(row, map.date) || cell(row, map.valueDate);
    const date = parseDate(dateCell);
    const description = cell(row, map.description);
    const signed = round2(
      normaliseAmount(
        cell(row, map.amount),
        cell(row, map.type),
        cell(row, map.debit),
        cell(row, map.credit),
      ),
    );

    if (!date && signed === 0) {
      // Continuation of a multi-line narration: keep the text, attach it upward.
      const text = row.filter(Boolean).join(" ").trim();
      const prev = out[out.length - 1];
      if (prev && text && !SUMMARY_LINE.test(text)) {
        prev.description = `${prev.description} ${text}`.trim();
        prev.raw_text = `${prev.raw_text} | ${text}`;
      }
      continue;
    }
    if (signed === 0) continue; // balance-only or blank amount line
    if (
      SUMMARY_LINE.test(description) ||
      (!date && SUMMARY_LINE.test(row.join(" ")))
    )
      continue;

    const issues: string[] = [];
    let confidence = 0.97;
    if (!date) {
      issues.push(`Date "${dateCell}" could not be read`);
      confidence = 0.3;
    }
    if (
      unsignedSingleColumn &&
      parseMoneyCell(cell(row, map.amount)).sign !== -1
    ) {
      issues.push(
        "Statement has one unsigned amount column; money in/out was assumed",
      );
      confidence = Math.min(confidence, 0.6);
    }
    if (!description) {
      issues.push("No narration on this line");
      confidence = Math.min(confidence, 0.7);
    }

    const ccyCell = cell(row, map.currency);
    const rawMoney = `${cell(row, map.amount)} ${cell(row, map.debit)} ${cell(row, map.credit)}`;
    const foreign =
      (ccyCell && !/^(inr|rs|₹)$/i.test(ccyCell)) || FOREIGN_CCY.test(rawMoney);
    const currency = foreign
      ? (ccyCell || rawMoney.match(FOREIGN_CCY)?.[0] || "FOREIGN").toUpperCase()
      : "INR";
    if (foreign) {
      issues.push(
        `Amount is in ${currency}; multi-currency lines are reviewed by a person`,
      );
      confidence = Math.min(confidence, 0.5);
    }

    const balanceCell = cell(row, map.balance);
    const balance = balanceCell ? normaliseAmount(balanceCell) : null;

    out.push({
      row_index: r,
      raw_text: rawText,
      date,
      amount: Math.abs(signed),
      direction: signed < 0 ? "out" : "in",
      description,
      counterparty: cell(row, map.counterparty) || null,
      reference: cell(row, map.reference) || null,
      category: null,
      currency,
      balance: balanceCell ? round2(balance ?? 0) : null,
      parse_confidence: confidence,
      parse_issues: issues,
    });
  }
  return out;
}

/** Excel files that were renamed to .csv start with the zip or OLE signature. */
export function looksLikeSpreadsheetBinary(bytes: Uint8Array): boolean {
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const ole =
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0;
  return zip || ole;
}
