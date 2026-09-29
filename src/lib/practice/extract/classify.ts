/**
 * Classification + confidence scoring for extracted rows.
 *
 * Deterministic rules run first and always. The AI is only asked to refine
 * category / counterparty and to voice doubt; it is never allowed to change an
 * amount, a date or a direction that the parser read from the file. Rows the
 * AI read on its own (scanned PDFs, photos) are checked against the source
 * text before they are trusted.
 */
import {
  TXN_CATEGORIES,
  normaliseText,
  parseDate,
  round2,
  type Direction,
  type ExtractedRow,
  type Side,
  type TxnCategory,
} from "../core";

export const CONFIDENCE_THRESHOLD = 0.75;

/* ── heuristics ─────────────────────────────────────────── */

const RULES: { re: RegExp; category: TxnCategory }[] = [
  {
    re: /\b(chrgs?|chgs?|charges?|sms ?chgs?|amc|min(imum)? bal|annual fee|service fee|gst on|cgst on|sgst on|igst on)\b/i,
    category: "bank_charge",
  },
  {
    re: /\b(int(erest)?\.? ?(pd|paid|cr|credit)|interest|int\.coll|sb int|fd int)\b/i,
    category: "interest",
  },
  {
    re: /\b(gst ?(pmt|payment|challan)|gstn|tds|cbdt|advance tax|income tax|itns|oltas|pf ?contribution|epfo|esic|professional tax)\b/i,
    category: "tax",
  },
  { re: /\b(salary|salaries|sal ?cr|payroll|wages)\b/i, category: "salary" },
  {
    re: /\b(self|own a\/?c|own account|sweep|fd booking|fd closure|inter ?account|contra)\b/i,
    category: "transfer",
  },
];

export function categorise(
  description: string,
  direction: Direction | null,
  side: Side,
): TxnCategory {
  for (const r of RULES) if (r.re.test(description)) return r.category;
  if (
    side === "books" &&
    /\b(invoice|inv no|bill no|tax invoice)\b/i.test(description)
  ) {
    return direction === "in" ? "sales_invoice" : "purchase_invoice";
  }
  return direction === "in" ? "receipt" : "payment";
}

const PROTOCOL =
  /^(upi|neft|rtgs|imps|ach|nach|ecs|pos|atm|cms|mmt|trf|transfer|by|to|from|dr|cr|p2a|p2m|inb|ib|mob|net|clg|chq|cheque|inw|otw|ft|nfs|bil|billpay|payment|pmt|ref|utr|txn|a\/c|ac|acct)$/i;
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/i;

/** Pulls the counterparty name out of typical Indian bank narrations. */
export function counterpartyFromNarration(narration: string): string | null {
  const tokens = narration
    .split(/[/\-|:*]+|\s{2,}/)
    .map((t) => t.trim())
    .filter(Boolean);
  for (const t of tokens) {
    if (t.includes("@")) continue; // UPI VPA
    if (IFSC.test(t)) continue;
    const words = t.split(/\s+/).filter((w) => !PROTOCOL.test(w));
    const cleaned = words.join(" ").trim();
    if (cleaned.length < 3) continue;
    const letters = cleaned.replace(/[^a-z]/gi, "").length;
    const digits = cleaned.replace(/[^0-9]/g, "").length;
    if (letters < 3 || digits > letters) continue;
    if (
      /^(chq|cheque|clearing|cash|charges?|interest|salary|self)$/i.test(
        cleaned,
      )
    )
      continue;
    return cleaned.replace(/\s+/g, " ").slice(0, 80);
  }
  return null;
}

/** UTR / cheque / RRN style references inside a narration. */
export function referenceFromNarration(narration: string): string | null {
  const m =
    narration.match(/\b([A-Z]{4}[RHN]\d{10,18})\b/) || // NEFT/RTGS UTRs e.g. HDFCN52026091512345
    narration.match(/\b([A-Z]{4}\d{12,18})\b/) ||
    narration.match(/\b(\d{12})\b/) || // UPI RRN / IMPS
    narration.match(/\b(?:chq|cheque)\s*(?:no\.?)?\s*(\d{6})\b/i);
  return m ? m[1] : null;
}

/** Fills category, counterparty and reference with rules; never touches amounts or dates. */
export function applyHeuristics(row: ExtractedRow, side: Side): ExtractedRow {
  const description = row.description ?? "";
  return {
    ...row,
    category: row.category ?? categorise(description, row.direction, side),
    counterparty:
      row.counterparty ??
      (side === "bank" ? counterpartyFromNarration(description) : null),
    reference: row.reference ?? referenceFromNarration(description),
  };
}

/* ── AI refinement ──────────────────────────────────────── */

export interface AiRowVerdict {
  index: number;
  category?: string;
  counterparty?: string | null;
  confidence?: number;
  reason?: string;
  direction_doubt?: boolean;
}

export const CLASSIFY_SYSTEM_PROMPT = `You classify transactions for an Indian chartered accountancy firm.
You receive rows that were already read from a bank statement or accounting export.
Return STRICT JSON: {"rows":[{"index":<number>,"category":<one of ${TXN_CATEGORIES.join("|")}>,"counterparty":<string or null>,"confidence":<0..1>,"reason":<string>,"direction_doubt":<boolean>}]}
Rules:
- Never invent amounts, dates or references. You cannot change them.
- counterparty is the other party's name as written in the row, or null if the row does not name one.
- confidence is how sure you are that the category and counterparty are right AND that the row is a genuine transaction (not a total, balance or header line).
- Set direction_doubt true only if the narration clearly contradicts the given direction (e.g. "reversal", "refund" marked the other way).
- reason is mandatory when confidence is below 0.75. Keep it short and factual.`;

export function classifyUserPrompt(rows: ExtractedRow[], side: Side): string {
  return JSON.stringify({
    side,
    rows: rows.map((r) => ({
      index: r.row_index,
      date: r.date,
      amount: r.amount,
      direction: r.direction,
      description: r.description,
      reference: r.reference,
      counterparty_guess: r.counterparty,
      category_guess: r.category,
      raw_text: r.raw_text.slice(0, 400),
    })),
  });
}

/* ── AI reading of unstructured text (PDF / OCR / image) ── */

export const READ_SYSTEM_PROMPT = `You read Indian financial documents (bank statements, tax invoices, bills, receipts) and list every transaction or invoice in them.
Return STRICT JSON: {"document_kind":"bank_statement"|"invoice"|"bill"|"receipt"|"other","rows":[{"date":"YYYY-MM-DD","amount":<positive number>,"direction":"in"|"out","description":<string>,"counterparty":<string or null>,"reference":<string or null>,"category":<one of ${TXN_CATEGORIES.join("|")}>,"currency":"INR" or ISO code,"source_text":<the exact line(s) you read this from>,"confidence":<0..1>,"reason":<string>}]}
Rules:
- Only list values that are printed in the document. Never invent or compute amounts or dates.
- For invoices use the invoice total (including tax) as amount; direction "in" for a sales invoice issued by the client, "out" for a purchase bill.
- Skip opening/closing balance lines and totals.
- Parse Indian dates (DD/MM/YYYY) into YYYY-MM-DD.
- If a value is unclear (blurry, handwritten), lower confidence below 0.75 and say why in reason.
- If there is nothing to extract return {"document_kind":"other","rows":[]}.`;

export interface AiReadRow {
  date?: string;
  amount?: number | string;
  direction?: string;
  description?: string;
  counterparty?: string | null;
  reference?: string | null;
  category?: string;
  currency?: string;
  source_text?: string;
  confidence?: number;
  reason?: string;
}

const digitsOnly = (s: string) => s.replace(/[^0-9]/g, "");

/** True if the amount (in any common Indian formatting) appears in the source text. */
export function amountAppearsIn(amount: number, text: string): boolean {
  if (!text) return false;
  const plain = digitsOnly(text);
  const whole = Math.floor(amount);
  const paise = Math.round((amount - whole) * 100);
  const candidates = [
    `${whole}${String(paise).padStart(2, "0")}`,
    paise === 0 ? `${whole}` : "",
  ].filter(Boolean);
  return candidates.some((c) => plain.includes(c));
}

/**
 * Converts rows the AI read from unstructured text into extracted rows,
 * applying the anti-hallucination checks. `sourceText` is the document text
 * layer when there is one (empty for images, which lowers trust further).
 */
export function rowsFromAiRead(
  aiRows: AiReadRow[],
  sourceText: string,
): ExtractedRow[] {
  const out: ExtractedRow[] = [];
  aiRows.forEach((r, i) => {
    const issues: string[] = [];
    const amountNum =
      typeof r.amount === "number"
        ? r.amount
        : Number(String(r.amount ?? "").replace(/[^0-9.]/g, ""));
    const amount =
      Number.isFinite(amountNum) && amountNum > 0 ? round2(amountNum) : null;
    const date = parseDate(r.date ?? "");
    const direction: Direction | null =
      r.direction === "in" || r.direction === "out" ? r.direction : null;
    let confidence = Math.min(0.9, Math.max(0, Number(r.confidence ?? 0.5)));

    if (!amount) {
      issues.push("Amount could not be read");
      confidence = Math.min(confidence, 0.3);
    }
    if (!date) {
      issues.push("Date could not be read");
      confidence = Math.min(confidence, 0.4);
    }
    if (!direction) {
      issues.push("Money in/out unclear");
      confidence = Math.min(confidence, 0.5);
    }
    if (amount) {
      const evidence = `${r.source_text ?? ""}\n${sourceText}`;
      if (sourceText && !amountAppearsIn(amount, sourceText)) {
        issues.push("Amount does not appear in the document text");
        confidence = Math.min(confidence, 0.4);
      } else if (!sourceText && !amountAppearsIn(amount, evidence)) {
        issues.push("Amount could not be tied to a printed line");
        confidence = Math.min(confidence, 0.5);
      }
    }
    if (!sourceText) {
      // Read from an image only: always a human look unless the AI is very sure.
      confidence = Math.min(confidence, 0.8);
    }
    const currency = (r.currency || "INR").toUpperCase();
    if (currency !== "INR") {
      issues.push(`Amount is in ${currency}`);
      confidence = Math.min(confidence, 0.5);
    }
    if (r.reason && confidence < CONFIDENCE_THRESHOLD) issues.push(r.reason);

    const category = TXN_CATEGORIES.includes(r.category as TxnCategory)
      ? (r.category as TxnCategory)
      : null;
    out.push({
      row_index: i,
      raw_text: (r.source_text || r.description || "").slice(0, 2000),
      date,
      amount,
      direction,
      description: (r.description ?? "").slice(0, 500),
      counterparty: r.counterparty ?? null,
      reference: r.reference ?? null,
      category,
      currency,
      balance: null,
      parse_confidence: confidence,
      parse_issues: issues,
    });
  });
  return out;
}

/* ── scoring and routing ────────────────────────────────── */

export interface ScoredRow extends ExtractedRow {
  confidence: number;
  reason: string | null;
  route: "transaction" | "review";
}

/** Merges the parser's confidence with the AI verdict (if any) and routes the row. */
export function scoreRow(
  row: ExtractedRow,
  verdict: AiRowVerdict | undefined,
  threshold = CONFIDENCE_THRESHOLD,
): ScoredRow {
  const issues = [...row.parse_issues];
  let confidence = row.parse_confidence;
  let category = row.category;
  let counterparty = row.counterparty;

  if (verdict) {
    if (
      verdict.category &&
      TXN_CATEGORIES.includes(verdict.category as TxnCategory)
    )
      category = verdict.category as TxnCategory;
    if (verdict.counterparty && normaliseText(verdict.counterparty)) {
      // Accept the AI's counterparty only if it is visible in the row text.
      const hay = normaliseText(`${row.raw_text} ${row.description}`);
      if (hay.includes(normaliseText(verdict.counterparty)))
        counterparty = verdict.counterparty.slice(0, 120);
    }
    if (
      typeof verdict.confidence === "number" &&
      Number.isFinite(verdict.confidence)
    ) {
      confidence = Math.min(
        confidence,
        Math.max(0, Math.min(1, verdict.confidence)),
      );
      if (verdict.confidence < threshold && verdict.reason)
        issues.push(verdict.reason);
    }
    if (verdict.direction_doubt) {
      issues.push(
        "Narration suggests the money in/out direction may be reversed",
      );
      confidence = Math.min(confidence, 0.6);
    }
  }

  if (!row.amount || !row.date || !row.direction)
    confidence = Math.min(confidence, 0.4);
  confidence = round2(confidence);
  const route = confidence >= threshold ? "transaction" : "review";
  return {
    ...row,
    category,
    counterparty,
    confidence,
    reason: route === "review" ? issues.join("; ") || "Low confidence" : null,
    route,
  };
}
