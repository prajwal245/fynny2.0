/**
 * Practice backend — shared types and small pure helpers.
 *
 * Everything under `src/lib/practice` that does not end in `.server.ts` or
 * `.functions.ts` is pure: no network, no database, no clock unless passed in.
 * That keeps the Extract, Recon, Narrate and Chaser rules unit-testable and
 * replayable (same input → same output).
 */

export type Side = "bank" | "books";
export type Direction = "in" | "out";
export type MatchStatus = "unmatched" | "matched" | "exception" | "ignored";

export type TxnCategory =
  | "receipt"
  | "payment"
  | "bank_charge"
  | "interest"
  | "tax"
  | "salary"
  | "transfer"
  | "sales_invoice"
  | "purchase_invoice"
  | "journal"
  | "other";

export const TXN_CATEGORIES: TxnCategory[] = [
  "receipt",
  "payment",
  "bank_charge",
  "interest",
  "tax",
  "salary",
  "transfer",
  "sales_invoice",
  "purchase_invoice",
  "journal",
  "other",
];

/** One row as read from a source file, before it becomes a transaction. */
export interface ExtractedRow {
  row_index: number;
  raw_text: string;
  date: string | null; // YYYY-MM-DD
  amount: number | null; // positive rupees
  direction: Direction | null;
  description: string;
  counterparty: string | null;
  reference: string | null;
  category: TxnCategory | null;
  currency: string;
  balance: number | null;
  /** How sure the deterministic parser is about the fields it read (0–1). */
  parse_confidence: number;
  /** Why the parser is unsure, if it is. */
  parse_issues: string[];
}

/** A canonical transaction as stored in `ca_txns`. */
export interface Txn {
  id: string;
  side: Side;
  direction: Direction;
  amount: number;
  txn_date: string;
  counterparty: string | null;
  reference: string | null;
  description: string | null;
  category: string | null;
  match_status: MatchStatus;
  balance?: number | null;
  extraction_id?: string | null;
  row_index?: number | null;
}

/* ── money ──────────────────────────────────────────────── */

export const toPaise = (rupees: number) => Math.round(rupees * 100);
export const fromPaise = (paise: number) => paise / 100;
export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Sum rupee amounts without floating point drift. */
export function sumRupees(values: number[]): number {
  return fromPaise(values.reduce((s, v) => s + toPaise(v), 0));
}

/* ── dates ──────────────────────────────────────────────── */

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");

function validYmd(y: number, m: number, d: number): string | null {
  if (!(y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31))
    return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

const fullYear = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));

/**
 * Parses the date formats Indian banks and Tally actually emit. Day-first is
 * assumed for ambiguous numeric dates (01/02/2026 is 1 February).
 */
export function parseDate(raw: unknown): string | null {
  if (raw == null) return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return validYmd(
      raw.getUTCFullYear(),
      raw.getUTCMonth() + 1,
      raw.getUTCDate(),
    );
  }
  const s = String(raw).trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (m) return validYmd(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/); // Tally: 20260915
  if (m) return validYmd(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:\s.*)?$/);
  if (m) return validYmd(fullYear(m[3]), Number(m[2]), Number(m[1]));
  m = s.match(
    /^(\d{1,2})[-/.\s]([A-Za-z]{3,9})[-/.,\s]+(\d{2}|\d{4})(?:\s.*)?$/,
  );
  if (m && MONTHS[m[2].toLowerCase()])
    return validYmd(fullYear(m[3]), MONTHS[m[2].toLowerCase()], Number(m[1]));
  m = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m && MONTHS[m[1].toLowerCase()])
    return validYmd(Number(m[3]), MONTHS[m[1].toLowerCase()], Number(m[2]));
  // Excel serial day numbers (1900 system).
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const serial = Math.floor(Number(s));
    if (serial > 20000 && serial < 80000) {
      const dt = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
      return validYmd(
        dt.getUTCFullYear(),
        dt.getUTCMonth() + 1,
        dt.getUTCDate(),
      );
    }
  }
  return null;
}

export function daysBetween(a: string, b: string): number {
  return Math.round(
    Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) /
      86_400_000,
  );
}

export function addDays(ymd: string, days: number): string {
  const dt = new Date(Date.parse(`${ymd}T00:00:00Z`) + days * 86_400_000);
  return dt.toISOString().slice(0, 10);
}

/* ── periods ────────────────────────────────────────────── */

export interface Period {
  label: string; // "September 2026"
  key: string; // "2026-09"
  start: string; // 2026-09-01
  end: string; // 2026-09-30 (inclusive)
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function monthPeriod(year: number, month: number): Period {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    label: `${MONTH_NAMES[month - 1]} ${year}`,
    key: `${year}-${pad(month)}`,
    start: `${year}-${pad(month)}-01`,
    end: `${year}-${pad(month)}-${pad(last)}`,
  };
}

/**
 * Accepts the labels the v2 screens use ("September 2026"), month keys
 * ("2026-09") or an explicit range.
 */
export function parsePeriod(
  input: string | { start: string; end: string },
): Period {
  if (typeof input !== "string") {
    const start = parseDate(input.start);
    const end = parseDate(input.end);
    if (!start || !end || end < start) throw new Error("Invalid period range");
    return { label: `${start} to ${end}`, key: `${start}..${end}`, start, end };
  }
  const s = input.trim();
  let m = s.match(/^(\d{4})-(\d{2})$/);
  if (m) return monthPeriod(Number(m[1]), Number(m[2]));
  m = s.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (m && MONTHS[m[1].toLowerCase()])
    return monthPeriod(Number(m[2]), MONTHS[m[1].toLowerCase()]);
  throw new Error(
    `Unrecognised period "${input}". Use "September 2026" or "2026-09".`,
  );
}

export function previousPeriod(p: Period): Period | null {
  const m = p.key.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  return mo === 1 ? monthPeriod(y - 1, 12) : monthPeriod(y, mo - 1);
}

/* ── text ───────────────────────────────────────────────── */

export function normaliseText(s: string | null | undefined): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normaliseRef(s: string | null | undefined): string {
  return String(s ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/^0+/, "");
}

/**
 * Deterministic key used to stop the same transaction being stored twice,
 * whether it arrives twice in one file or in two different files.
 */
export function dedupeKey(t: {
  business_id: string | null;
  side: Side;
  date: string;
  direction: Direction;
  amount: number;
  reference: string | null;
  description: string | null;
}): string {
  const ref = normaliseRef(t.reference);
  const desc = ref ? "" : normaliseText(t.description).slice(0, 80);
  return [
    t.business_id ?? "unassigned",
    t.side,
    t.date,
    t.direction,
    toPaise(t.amount),
    ref,
    desc,
  ].join("|");
}

/** Signed amount the v2 screens show: money in positive, money out negative. */
export const signedAmount = (t: { amount: number; direction: Direction }) =>
  t.direction === "out" ? -Math.abs(t.amount) : Math.abs(t.amount);

export async function sha256Hex(
  bytes: ArrayBuffer | Uint8Array,
): Promise<string> {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const buf = await crypto.subtle.digest(
    "SHA-256",
    view as unknown as ArrayBuffer,
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export class PracticeError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "PracticeError";
  }
}
