// ─── src/lib/bankAmount.ts ──────────────────────────────────────────────────
// Universal bank-statement amount normalisation.
//
// Every bank CSV/XLSX/XML parser in the app funnels its amount cells through
// `normaliseAmount` so that the stored value is ALWAYS a signed number:
//   negative = debit / withdrawal / money out
//   positive = credit / deposit / money in
//
// Supported source shapes (see `detectAmountPattern`):
//   Pattern 1 — single amount column + a type column (debit/credit/DR/CR/…)
//   Pattern 2 — separate debit and credit columns
//   Pattern 3 — single already-signed amount column
//   Pattern 4 — withdrawal / deposit columns (a flavour of pattern 2)
//   Pattern 5 — amount cell carrying a DR/CR suffix ("5,000.00 DR")

export type AmountPattern = 1 | 2 | 3 | 4 | 5;

// ── Header dictionaries ──────────────────────────────────────────────────────

export const DEBIT_HEADERS = [
  "debit", "debit amount", "debit amt", "debit amt.",
  "withdrawal", "withdrawal amt", "withdrawal amt.", "withdrawal amount",
  "dr", "dr amount", "dr amt", "paid out", "money out", "outflow", "out",
];

export const CREDIT_HEADERS = [
  "credit", "credit amount", "credit amt", "credit amt.",
  "deposit", "deposit amt", "deposit amt.", "deposit amount",
  "cr", "cr amount", "cr amt", "paid in", "money in", "inflow", "in",
];

export const TYPE_HEADERS = [
  "type", "transaction type", "txn type", "dr/cr", "cr/dr", "drcr", "crdr",
  "mode", "direction", "voucher type", "vouchertype", "vch type",
];

export const AMOUNT_HEADERS = [
  "amount", "transaction amount", "txn amount", "net amount",
  "amount (inr)", "value", "voucher amount",
];

const WITHDRAWAL_HEADERS = ["withdrawal", "withdrawal amt", "withdrawal amt.", "withdrawal amount", "paid out", "money out"];
const DEPOSIT_HEADERS = ["deposit", "deposit amt", "deposit amt.", "deposit amount", "paid in", "money in"];

const normHeader = (h: string) => (h || "").toLowerCase().trim().replace(/[^a-z0-9/]+/g, " ").trim();

function headerMatches(header: string, dictionary: string[]): boolean {
  const h = normHeader(header);
  if (!h) return false;
  const dict = dictionary.map((d) => normHeader(d));
  if (dict.includes(h)) return true;
  // token-aware partial match: "Withdrawal Amt." vs "withdrawal"
  return dict.some((d) => d.length > 2 && (h === d || h.startsWith(d + " ") || h.endsWith(" " + d) || h.includes(" " + d + " ")));
}

export const isDebitHeader = (h: string) => headerMatches(h, DEBIT_HEADERS);
export const isCreditHeader = (h: string) => headerMatches(h, CREDIT_HEADERS);
export const isTypeHeader = (h: string) => headerMatches(h, TYPE_HEADERS);
export const isAmountHeader = (h: string) =>
  headerMatches(h, AMOUNT_HEADERS) && !isDebitHeader(h) && !isCreditHeader(h) && !/balance/i.test(h);

/** Index of the first header in `headers` matching `test`, or -1. */
export function findHeaderIndex(headers: string[], test: (h: string) => boolean): number {
  return headers.findIndex((h) => test(h));
}

// ── Type / direction words ───────────────────────────────────────────────────

const DEBIT_WORDS = [
  "debit", "dr", "d", "withdrawal", "withdraw", "withdrawn", "out", "outflow",
  "paid out", "money out", "payment", "expense", "purchase", "spent",
];
const CREDIT_WORDS = [
  "credit", "cr", "c", "deposit", "deposited", "in", "inflow",
  "paid in", "money in", "receipt", "received", "refund", "income",
];

/**
 * Returns -1 for a debit-ish value, +1 for a credit-ish value, 0 if unknown.
 */
export function signFromType(rawType: unknown): -1 | 0 | 1 {
  const t = String(rawType ?? "").toLowerCase().trim().replace(/[.]/g, "");
  if (!t) return 0;
  if (t === "dr/cr" || t === "cr/dr") return 0;
  // exact word hit first (avoids "credit" matching the "d" debit token)
  if (CREDIT_WORDS.includes(t)) return 1;
  if (DEBIT_WORDS.includes(t)) return -1;
  if (/\bcredit\b|\bdeposit\b|\bcr\b|money in|paid in|inflow|receipt/.test(t)) return 1;
  if (/\bdebit\b|\bwithdraw|\bdr\b|money out|paid out|outflow|payment/.test(t)) return -1;
  return 0;
}

// ── Raw cell parsing ─────────────────────────────────────────────────────────

/**
 * Parses a raw money cell into { value, sign }.
 *   value — absolute magnitude (number, 0 if unparseable)
 *   sign  — -1 / +1 when the cell itself declares direction (leading "-",
 *           parentheses, or a DR/CR suffix), otherwise 0
 * Handles: "1,00,000.00", "Rs. 5000", "INR 5,000", "$1,200.50", "(5000)",
 *          "5000.00 DR", "2500 Cr", "₹ 1,234.56-"
 */
export function parseMoneyCell(raw: unknown): { value: number; sign: -1 | 0 | 1 } {
  if (raw == null) return { value: 0, sign: 0 };
  if (typeof raw === "number") {
    if (!isFinite(raw) || raw === 0) return { value: 0, sign: 0 };
    return { value: Math.abs(raw), sign: raw < 0 ? -1 : 1 };
  }

  let s = String(raw).trim();
  if (!s) return { value: 0, sign: 0 };

  let sign: -1 | 0 | 1 = 0;

  // Trailing / leading DR-CR markers
  const suffix = s.match(/(^|[\s(])(dr|cr|debit|credit)\.?\s*$/i);
  if (suffix) {
    sign = /^c/i.test(suffix[2]) ? 1 : -1;
    s = s.slice(0, suffix.index).trim();
  } else {
    const prefix = s.match(/^(dr|cr|debit|credit)\.?[\s:]+/i);
    if (prefix) {
      sign = /^c/i.test(prefix[1]) ? 1 : -1;
      s = s.slice(prefix[0].length).trim();
    }
  }

  // Parentheses = negative
  const parens = /^\(.*\)$/.test(s);
  if (parens) { sign = -1; s = s.slice(1, -1).trim(); }

  // Trailing minus (some exports use "1,234.56-")
  if (/-\s*$/.test(s)) { sign = -1; s = s.replace(/-\s*$/, "").trim(); }

  // Currency symbols / codes / thousand separators (incl. Indian lakh grouping)
  s = s
    .replace(/(?:^|\s)(rs\.?|inr|usd|eur|gbp)(?=[\s\d.]|$)/gi, " ")
    .replace(/[₹$€£¥]/g, "")
    .replace(/[,\s'_]/g, "");

  if (!s || s === "-" || s === ".") return { value: 0, sign: 0 };

  const leadingMinus = s.startsWith("-");
  if (leadingMinus) sign = -1;
  if (s.startsWith("+")) s = s.slice(1);

  const n = parseFloat(s);
  if (!isFinite(n) || isNaN(n)) return { value: 0, sign: 0 };
  if (n === 0) return { value: 0, sign: 0 };

  return { value: Math.abs(n), sign: sign === 0 ? (n < 0 ? -1 : 1) : sign };
}

/**
 * THE universal entry point.
 *
 * Accepts any combination of raw inputs and returns a single signed number:
 *   negative = debit (money out), positive = credit (money in).
 * Always a JavaScript number. Returns 0 when nothing can be parsed.
 */
export function normaliseAmount(
  rawAmount?: unknown,
  rawType?: unknown,
  rawDebit?: unknown,
  rawCredit?: unknown
): number {
  // Pattern 2 / 4 — separate debit & credit columns win when present
  const debit = parseMoneyCell(rawDebit);
  const credit = parseMoneyCell(rawCredit);
  if (debit.value > 0 && credit.value > 0) {
    // Both populated (rare, usually one is a running total) — larger magnitude wins.
    return debit.value >= credit.value ? -debit.value : credit.value;
  }
  if (debit.value > 0) return -debit.value;
  if (credit.value > 0) return credit.value;

  // Pattern 1 / 3 / 5 — single amount cell
  const amt = parseMoneyCell(rawAmount);
  if (amt.value === 0) return 0;

  // Pattern 5: the cell itself carried DR/CR or parentheses/minus -> trust it
  // only after the explicit type column, which is more authoritative.
  const typeSign = signFromType(rawType);
  if (typeSign !== 0) return typeSign * amt.value;

  return (amt.sign === -1 ? -1 : 1) * amt.value;
}

/** Convenience: direction label derived from a signed amount. */
export const directionFromSigned = (signed: number): "in" | "out" => (signed < 0 ? "out" : "in");

// ── Pattern detection (for logging + mapper UI) ──────────────────────────────

export interface DetectedColumns {
  pattern: AmountPattern | null;
  debitIdx: number;
  creditIdx: number;
  amountIdx: number;
  typeIdx: number;
  label: string;
}

/**
 * Detects which of the 5 known formats a table of rows uses.
 * `sampleRows` are data rows (excluding the header row).
 */
export function detectAmountPattern(headers: string[], sampleRows: unknown[][] = []): DetectedColumns {
  const debitIdx = findHeaderIndex(headers, isDebitHeader);
  const creditIdx = findHeaderIndex(headers, isCreditHeader);
  const amountIdx = findHeaderIndex(headers, isAmountHeader);
  const typeIdx = findHeaderIndex(headers, isTypeHeader);

  let pattern: AmountPattern | null = null;
  let label = "unknown";

  if (debitIdx !== -1 && creditIdx !== -1) {
    const isWithdrawDeposit =
      headerMatches(headers[debitIdx], WITHDRAWAL_HEADERS) ||
      headerMatches(headers[creditIdx], DEPOSIT_HEADERS);
    pattern = isWithdrawDeposit ? 4 : 2;
    label = isWithdrawDeposit
      ? "Pattern 4 — withdrawal / deposit columns"
      : "Pattern 2 — separate debit / credit columns";
  } else if (amountIdx !== -1) {
    const cells = sampleRows.map((r) => r?.[amountIdx]).filter((c) => c != null && String(c).trim() !== "");
    const hasSuffix = cells.some((c) => /\b(dr|cr)\.?\s*$/i.test(String(c)));
    const parsed = cells.map((c) => parseMoneyCell(c));
    const hasNegative = parsed.some((p) => p.sign === -1 && p.value > 0);

    if (hasSuffix) {
      pattern = 5; label = "Pattern 5 — DR/CR suffix inside the amount cell";
    } else if (typeIdx !== -1 && !hasNegative) {
      pattern = 1; label = "Pattern 1 — single amount column + type column";
    } else if (hasNegative) {
      pattern = 3; label = "Pattern 3 — single signed amount column";
    } else if (typeIdx !== -1) {
      pattern = 1; label = "Pattern 1 — single amount column + type column";
    } else {
      pattern = 3; label = "Pattern 3 — single amount column (unsigned, treated as credit)";
    }
  } else if (debitIdx !== -1 || creditIdx !== -1) {
    pattern = 2; label = "Pattern 2 — single-sided debit or credit column";
  }

  return { pattern, debitIdx, creditIdx, amountIdx, typeIdx, label };
}

/** Dev-tools logging required for import verification. */
export function logParsePattern(
  source: string,
  detected: DetectedColumns,
  parsedRows: Array<{ date?: string; description?: string; amount: number }>
) {
  const cols = {
    debit: detected.debitIdx, credit: detected.creditIdx,
    amount: detected.amountIdx, type: detected.typeIdx,
  };
  console.log(`[import:${source}] detected ${detected.label}`, cols);
  console.log(
    `[import:${source}] first ${Math.min(5, parsedRows.length)} parsed rows (signed amounts):`,
    parsedRows.slice(0, 5).map((r) => ({ date: r.date, description: r.description, amount: r.amount }))
  );
}
