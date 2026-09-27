/**
 * Deterministic reader for the text layer of PDF bank statements.
 *
 * A statement line starts with a date and ends with the running balance. When
 * consecutive balances move by exactly the line amount we know both the amount
 * and its direction for certain; otherwise the line is kept with low
 * confidence so a person checks it.
 */
import { parseMoneyCell } from "@/lib/bankAmount";
import { parseDate, round2, toPaise, type ExtractedRow } from "../core";

const DATE_AT_START = /^\s*(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}[-\s][A-Za-z]{3}[-\s]\d{2,4}|\d{4}-\d{2}-\d{2})\b/;
const MONEY = /(?:\(?-?[\d,]+\.\d{2}\)?(?:\s?(?:Cr|Dr|CR|DR))?)/g;
const SKIP = /\b(opening balance|closing balance|balance b\/?f|brought forward|carried forward|total)\b/i;

export interface TextStatementResult {
  rows: ExtractedRow[];
  /** Share of rows whose amount was confirmed by the running balance. */
  verifiedShare: number;
}

export function rowsFromStatementText(text: string): TextStatementResult {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const rows: ExtractedRow[] = [];
  let prevBalance: number | null = null;
  let verified = 0;

  // Opening balance line, when printed, seeds the balance chain.
  const opening = lines.find((l) => /opening balance/i.test(l));
  if (opening) {
    const m = opening.match(MONEY);
    if (m?.length) {
      const p = parseMoneyCell(m[m.length - 1]);
      prevBalance = p.sign === -1 ? -p.value : p.value;
    }
  }

  lines.forEach((line, idx) => {
    const dm = line.match(DATE_AT_START);
    if (!dm) {
      // Narration spilling onto the next line.
      const prev = rows[rows.length - 1];
      if (prev && !SKIP.test(line) && !(line.match(MONEY)?.length)) {
        prev.description = `${prev.description} ${line}`.trim().slice(0, 500);
        prev.raw_text = `${prev.raw_text} ${line}`;
      }
      return;
    }
    if (SKIP.test(line)) return;
    const date = parseDate(dm[1]);
    const monies = line.match(MONEY) ?? [];
    if (!date || monies.length === 0) return;

    const values = monies.map((m) => {
      const p = parseMoneyCell(m);
      return p.sign === -1 ? -p.value : p.value;
    });
    const balance = monies.length >= 2 ? values[values.length - 1] : null;
    const amount = Math.abs(monies.length >= 2 ? values[values.length - 2] : values[0]);
    if (!amount) return;

    let description = line.slice(dm[0].length);
    for (const m of monies) description = description.replace(m, " ");
    description = description.replace(/\s+/g, " ").trim();
    // A second date right after the first is the value date.
    description = description.replace(DATE_AT_START, "").trim();

    const issues: string[] = [];
    let direction: "in" | "out" | null = null;
    let confidence = 0.55;
    if (balance !== null && prevBalance !== null) {
      const delta = toPaise(balance) - toPaise(prevBalance);
      if (Math.abs(delta) === toPaise(amount)) {
        direction = delta > 0 ? "in" : "out";
        confidence = 0.95;
        verified++;
      } else {
        issues.push("Running balance does not move by this amount");
      }
    } else {
      issues.push("No running balance to confirm money in/out");
    }
    if (!direction) {
      const hint = /\b(cr|credit|deposit|by)\b/i.test(line) ? "in" : /\b(dr|debit|withdrawal|to)\b/i.test(line) ? "out" : null;
      direction = hint;
      if (!hint) issues.push("Money in/out unclear");
    }
    if (balance !== null) prevBalance = balance;

    rows.push({
      row_index: idx,
      raw_text: line,
      date,
      amount: round2(amount),
      direction,
      description,
      counterparty: null,
      reference: null,
      category: null,
      currency: "INR",
      balance: balance === null ? null : round2(balance),
      parse_confidence: confidence,
      parse_issues: issues,
    });
  });

  return { rows, verifiedShare: rows.length ? verified / rows.length : 0 };
}
