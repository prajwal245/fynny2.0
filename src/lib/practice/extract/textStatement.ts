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

/**
 * A line starts with a date. Some banks (Kotak) number every line first ("12  30 Jun 2025 ..."): a serial number is allowed in front
 * of a date, and only in front of one, so it is never mistaken for part of the date.
 */
const DATE_AT_START =
  /^\s*(?:\d{1,5}\s+(?=\d{1,2}[-\s][A-Za-z]{3}[-\s]\d{2,4}\b|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b))?(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}[-\s][A-Za-z]{3}[-\s]\d{2,4}|\d{4}-\d{2}-\d{2})\b/;
const MONEY = /(?:\(?-?[\d,]+\.\d{2}\)?(?:\s?(?:Cr|Dr|CR|DR))?)/g;
/** Marks of a pen note beside a printed line ("paid? check w/ Ramesh !!", "personal ->") rather than a wrapped narration. */
const ANNOTATION = /[?!]|->|=>|<-|~|\bw\/|\bpls\b|\bcheck\b/i;
/** Printed at the foot of a statement (or a page): never part of a transaction's narration. */
const FOOTER =
  /computer[- ]generated|system[- ]generated|(does|do) not (require|need)(?: a)? signature|needs? no signature|no signature (is )?(required|needed)|end of statement|statement ends|registered office|\bpage \d+ of \d+\b|toll[- ]free|customer care|www\.[a-z0-9-]+\.[a-z]{2,}|if you notice any discrepanc|kindly (inform|notify)|unless the constituent|this is an? [a-z ]{0,30}statement/i;
const FOOTER_TAIL = /\s*[\/|-]?\s*(this is an? [a-z ]{0,30}statement|computer[- ]generated|system[- ]generated)[^]*$/i;
const SKIP =
  /\b(opening balance|closing balance|balance b\/?f|brought forward|carried forward|total)\b/i;

export interface TextStatementResult {
  rows: ExtractedRow[];
  /** Share of rows whose amount was confirmed by the running balance. */
  verifiedShare: number;
}

export function rowsFromStatementText(text: string): TextStatementResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
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

  // Once a footer line is met, nothing after it (until the next dated line) belongs to a transaction.
  let inFooter = false;
  lines.forEach((line, idx) => {
    const dm = line.match(DATE_AT_START);
    if (dm) inFooter = false;
    if (!dm) {
      if (FOOTER.test(line)) inFooter = true;
      if (inFooter) return;
      // Narration spilling onto the next line.
      const prev = rows[rows.length - 1];
      if (prev && !SKIP.test(line) && !line.match(MONEY)?.length) {
        if (ANNOTATION.test(line)) {
          // Keep the note for the reviewer, but out of the bank's narration so it never skews matching.
          prev.parse_issues = [...prev.parse_issues, `Note beside this line: "${line.slice(0, 120)}"`];
          prev.raw_text = `${prev.raw_text} ${line}`;
          return;
        }
        prev.description = `${prev.description} ${line}`.replace(FOOTER_TAIL, "").trim().slice(0, 500);
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
    let balance = monies.length >= 2 ? values[values.length - 1] : null;
    const amount = Math.abs(
      monies.length >= 2 ? values[values.length - 2] : values[0],
    );
    if (!amount) return;
    // An overdrawn balance is sometimes printed without its sign (a savings account with a sweep-in FD: "4,48,711.00" after
    // 51,289.00 less 5,00,000.00). When the printed balance only follows from the last one with its sign flipped, that is what it is.
    let unsigned = false;
    if (balance !== null && prevBalance !== null && balance > 0) {
      const fits = (b: number) => Math.abs(toPaise(b) - toPaise(prevBalance as number)) === toPaise(amount);
      if (!fits(balance) && fits(-balance)) {
        balance = -balance;
        unsigned = true;
      }
    }

    let description = line.slice(dm[0].length);
    for (const m of monies) description = description.replace(m, " ");
    description = description.replace(/\s+/g, " ").trim();
    // A balance column cut off by the page edge leaves a fragment such as "24,35," at the end.
    description = description.replace(/\s+\d[\d,]*,$/, "");
    // A second date right after the first is the value date.
    description = description.replace(DATE_AT_START, "").trim();

    const issues: string[] = [];
    if (unsigned) issues.push("The printed balance has no minus sign; it follows from the last balance as an overdrawn amount");
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
      // A Dr or Cr printed against the amount itself (from the Debit/Credit column it sat in) beats guessing from words.
      const amountToken = monies.length >= 2 ? monies[monies.length - 2] : monies[0];
      const mark = /\b(Cr|Dr)\s*$/i.exec(amountToken ?? "")?.[1]?.toLowerCase();
      if (mark) {
        direction = mark === "cr" ? "in" : "out";
        const mismatch = issues.some((m) => m.startsWith("Running balance does not move"));
        confidence = mismatch ? 0.7 : 0.85;
        const rest = issues.filter((m) => !m.startsWith("No running balance"));
        issues.length = 0;
        issues.push(...rest, "Direction from the Debit or Credit column, not confirmed by a running balance");
      }
    }
    if (!direction) {
      const hint = /\b(cr|credit|deposit|by)\b/i.test(line)
        ? "in"
        : /\b(dr|debit|withdrawal|to)\b/i.test(line)
          ? "out"
          : null;
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

  // The statement's own opening and closing balances can prove every direction at once: if the lines add up to the
  // movement between them (to the paisa), no line can be the wrong way round, even with no running balance per line.
  const closing = lines.find((l) => /closing balance/i.test(l));
  const closingMoney = closing?.match(MONEY);
  if (opening && closingMoney?.length && rows.length && rows.every((r) => r.direction)) {
    const num = (raw: string | undefined) => {
      const p = parseMoneyCell(raw);
      return p.sign === -1 ? -p.value : p.value;
    };
    const open = num(opening.match(MONEY)?.slice(-1)[0]);
    const close = num(closingMoney[closingMoney.length - 1]);
    const net = rows.reduce((n, r) => n + toPaise(r.amount ?? 0) * (r.direction === "in" ? 1 : -1), 0);
    if (Math.abs(toPaise(open) + net - toPaise(close)) <= 100) {
      for (const r of rows) {
        if (r.parse_confidence >= 0.9) continue;
        r.parse_confidence = 0.95;
        r.parse_issues = [...r.parse_issues.filter((m) => !m.startsWith("Direction from the Debit")), "Direction from the Debit or Credit column; the statement adds up to its closing balance"];
        verified++;
      }
    }
  }

  return { rows, verifiedShare: rows.length ? verified / rows.length : 0 };
}

/* ── Overdraft and cash-credit layout with split cells ─────────────────────────────────────────────────────────────────────────
 * Indian Bank prints an overdraft or cash-credit account with every cell on its own line, so the text layer runs:
 *
 *   16/03  /2026  16/03  /2026        value date and post date, each split in two
 *   <branch> <description lines>
 *   7009.66 Dr  19007123.0  1DR       the amount, then the balance whose last digit wraps onto the next line
 *
 * A credit has no "Dr" beside its amount ("2500000.0" then "0"), so its direction comes from how the balance moves. An overdrawn
 * balance is marked DR and is negative. The column reader and the line reader find nothing in this layout, so this one is tried
 * only when both of them found nothing, and it never changes how any other statement is read.
 */
const HEADER_END = /description\s+cheque no\.?\s+dr\s+cr\s+balance/i;
const MONEY_START = /^[\d,]+\.\d{0,2}(?:\s|$)/;

/** Reads a date written as two pieces ("16/03" then "/2026") or one ("16/03/2026") starting at lines[i]. */
function splitDateAt(
  lines: string[],
  i: number,
): { date: string; next: number } | null {
  const a = lines[i] ?? "";
  const whole = /^(\d{2}\/\d{2}\/\d{4})$/.exec(a);
  if (whole) return { date: whole[1]!, next: i + 1 };
  const dm = /^(\d{2}\/\d{2})$/.exec(a);
  const yr = /^\/(\d{4})$/.exec(lines[i + 1] ?? "");
  if (dm && yr) return { date: `${dm[1]}/${yr[1]}`, next: i + 2 };
  return null;
}

interface SplitMoney {
  value: number;
  mark: "dr" | "cr" | null;
}

/** The numbers in a run of tail lines: an amount (maybe followed by Dr or Cr) and a balance (maybe marked DR or CR). A number whose
 *  last digit wrapped onto the next line is joined back together. */
function splitTailNumbers(tail: string[]): SplitMoney[] {
  const tokens = tail.flatMap((l) => l.split(/\s+/).filter(Boolean));
  const out: SplitMoney[] = [];
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k]!;
    if (/^(dr|cr)$/i.test(t)) {
      if (out.length)
        out[out.length - 1]!.mark = t.toLowerCase() as "dr" | "cr";
      continue;
    }
    if (/^[\d,]+\.\d{2}$/.test(t)) {
      out.push({ value: Number(t.replace(/,/g, "")), mark: null });
      continue;
    }
    // A number cut across lines: "2500000.0" then "0", "14356527." then "00", or "19007123.0" then "1DR".
    const cut = /^([\d,]+)\.(\d?)$/.exec(t);
    if (cut) {
      const next = /^(\d{1,2})(dr|cr)?$/i.exec(tokens[k + 1] ?? "");
      if (!next || (cut[2] ?? "").length + next[1]!.length !== 2) continue;
      out.push({
        value: Number(`${cut[1]!.replace(/,/g, "")}.${cut[2]}${next[1]}`),
        mark: (next[2]?.toLowerCase() as "dr" | "cr" | undefined) ?? null,
      });
      k++;
    }
  }
  return out;
}

export function rowsFromSplitCellText(text: string): TextStatementResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const rows: ExtractedRow[] = [];
  let prevSigned: number | null = null;
  let verified = 0;
  let skipping = false;

  const signed = (m: SplitMoney) => (m.mark === "dr" ? -m.value : m.value);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^page no:?\s*\d+/i.test(line)) {
      skipping = true;
      continue;
    }
    if (skipping) {
      if (HEADER_END.test(line)) skipping = false;
      continue;
    }
    if (/^balance b\/?f$/i.test(line)) {
      const nums = splitTailNumbers(lines.slice(i + 1, i + 4));
      if (nums[0])
        prevSigned = signed({ ...nums[0], mark: nums[0].mark ?? "dr" });
      continue;
    }
    const first = splitDateAt(lines, i);
    if (!first) continue;
    // The post date follows the value date.
    const second = splitDateAt(lines, first.next);
    let j = second ? second.next : first.next;
    const narration: string[] = [];
    while (
      j < lines.length &&
      !MONEY_START.test(lines[j]!) &&
      !splitDateAt(lines, j) &&
      !/^page no:?\s*\d+/i.test(lines[j]!)
    ) {
      narration.push(lines[j]!);
      j++;
    }
    const tail: string[] = [];
    while (
      j < lines.length &&
      !splitDateAt(lines, j) &&
      !/^page no:?\s*\d+/i.test(lines[j]!)
    ) {
      tail.push(lines[j]!);
      j++;
    }
    const nums = splitTailNumbers(tail);
    if (nums.length < 2) {
      i = j - 1;
      continue;
    }
    // The amount is the number just before the balance. A figure from the narration ("Txn Amt", "Charges") can sit in front of both.
    const amountNum = nums[nums.length - 2]!;
    const balanceNum = nums[nums.length - 1]!;
    const date = parseDate(first.date);
    const amount = amountNum.value;
    if (!date || !amount) {
      i = j - 1;
      continue;
    }
    const balance = signed({ ...balanceNum, mark: balanceNum.mark ?? "dr" });
    const issues: string[] = [];
    let direction: "in" | "out" | null = null;
    let confidence = 0.55;
    if (prevSigned !== null) {
      const delta = toPaise(balance) - toPaise(prevSigned);
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
    if (!direction && amountNum.mark) {
      direction = amountNum.mark === "cr" ? "in" : "out";
      confidence = 0.7;
      issues.push(
        "Direction from the Dr or Cr printed beside the amount, not confirmed by the running balance",
      );
    }
    if (!direction) issues.push("Money in/out unclear");
    prevSigned = balance;
    const description = narration
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500);
    rows.push({
      row_index: i,
      raw_text: [first.date, ...narration, ...tail].join(" ").slice(0, 900),
      date,
      amount: round2(amount),
      direction,
      description,
      counterparty: null,
      reference: null,
      category: null,
      currency: "INR",
      balance: round2(balance),
      parse_confidence: confidence,
      parse_issues: issues,
    });
    i = j - 1;
  }
  return { rows, verifiedShare: rows.length ? verified / rows.length : 0 };
}
