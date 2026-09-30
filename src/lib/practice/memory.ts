/**
 * Agent memory: what a person taught the Extract agent by correcting a line
 * in the Review Queue, remembered per client and applied to next month's
 * documents so nobody fixes the same line twice.
 *
 * Lines are recognised by their narration pattern: the words that stay the
 * same every month, with dates, amounts and reference numbers stripped.
 * Memory fills in who and which way; it never invents a date or an amount.
 */
import { normaliseText, type Direction } from "./core";

export interface Lesson {
  direction?: Direction;
  counterparty?: string;
  description?: string;
}

export interface Memory {
  id: string;
  pattern: string;
  lesson: Lesson;
  times_taught: number;
}

/** Rows the agent is sure enough about, once memory confirms them. */
export const REMEMBERED_CONFIDENCE = 0.8;

const NOISE = new Set([
  "to", "by", "from", "for", "the", "and", "of", "a", "an", "in", "on", "at",
  "cr", "dr", "txn", "ref", "no", "rs", "inr", "via",
]);

/**
 * "NEFT CR-ICIC0004321-VIREO FOODS LLP-09/09" -> "neft vireo foods llp".
 * Returns "" when too little is left to recognise the line safely.
 */
export function narrationPattern(text: string | null | undefined): string {
  if (!text) return "";
  const words = text
    .toLowerCase()
    // "_" joins parts of one reference (PO_1NX93K), so it does not split words here.
    .replace(/[^a-z0-9_]+/g, " ")
    .split(" ")
    // Anything with a digit is a date, amount, account or reference: it changes every month.
    .filter((w) => w && !/\d/.test(w))
    .flatMap((w) => w.split("_"))
    .filter((w) => w.length > 1 && !NOISE.has(w));
  const pattern = words.slice(0, 8).join(" ");
  return words.length >= 2 && pattern.length >= 6 ? pattern : "";
}

type ProposedLike = {
  direction: Direction | null;
  counterparty: string | null;
  description: string;
};

/** What the person's confirmation says about this line: the values they settled on. */
export function lessonFrom(
  proposed: ProposedLike,
  final: { direction: Direction; counterparty: string | null; description: string },
): Lesson {
  const lesson: Lesson = { direction: final.direction };
  const cp = final.counterparty?.trim();
  if (cp) lesson.counterparty = cp;
  const desc = final.description?.trim();
  if (desc && desc !== proposed.description?.trim()) lesson.description = desc;
  return lesson;
}

export interface MemoryRow {
  route: "transaction" | "review";
  confidence: number;
  reason: string | null;
  date: string | null;
  amount: number | null;
  direction: Direction | null;
  description: string;
  counterparty: string | null;
  raw_text: string;
  currency?: string;
}

/**
 * Doubts memory may never settle: the amount itself, foreign currency (the
 * spec keeps multi-currency with a person in v1), and suspected duplicates.
 * Memory only answers "which way" and "who", the questions a person answered.
 */
const NEEDS_A_PERSON =
  /Identical to row|does not appear in the document|could not be tied|could not be read|Amount is in [A-Z]{3}|multi-currency/i;

/**
 * Applies remembered lessons to freshly extracted rows. A row sent to review
 * only for doubt the person already resolved goes straight through; a row with
 * a missing date or amount, a doubtful amount, a foreign currency or a
 * suspected duplicate still goes to review.
 */
export function applyMemory<R extends MemoryRow>(
  rows: R[],
  memories: Memory[],
): { rows: R[]; applied: { memoryId: string; rowIndex: number; released: boolean }[] } {
  if (!memories.length) return { rows, applied: [] };
  const byPattern = new Map(memories.map((m) => [m.pattern, m]));
  const applied: { memoryId: string; rowIndex: number; released: boolean }[] = [];
  const out = rows.map((row, i) => {
    const m =
      byPattern.get(narrationPattern(row.description)) ??
      byPattern.get(narrationPattern(row.raw_text));
    if (!m) return row;
    const next = { ...row };
    if (m.lesson.direction) next.direction = m.lesson.direction;
    if (m.lesson.counterparty) next.counterparty = m.lesson.counterparty;
    if (m.lesson.description) next.description = m.lesson.description;
    const blocked =
      NEEDS_A_PERSON.test(row.reason ?? "") ||
      Boolean(row.currency && row.currency.toUpperCase() !== "INR");
    const complete = Boolean(next.date && next.amount && next.amount > 0 && next.direction);
    let released = false;
    if (row.route === "review" && complete && !blocked) {
      next.route = "transaction";
      next.confidence = Math.max(row.confidence, REMEMBERED_CONFIDENCE);
      next.reason = null;
      released = true;
    }
    applied.push({ memoryId: m.id, rowIndex: i, released });
    return next;
  });
  return { rows: out, applied };
}

const RAIL_WORDS = new Set(["neft", "rtgs", "imps", "upi", "ach", "nach", "ecs", "cms", "chq", "cheque", "inb", "mb", "ib", "pos", "atm", "cr", "dr", "trf", "transfer", "to", "by", "from"]);

/**
 * The party's name inside a bank narration: the longest run of plain words
 * (no digits, no payment-rail codes). "NEFT CR-ICIC0004321-VIREO FOODS LLP-09/09"
 * gives "vireo foods llp". It is a contiguous piece of the normalised
 * narration, so the Recon alias table can find it again next month.
 */
export function partyFromNarration(text: string | null | undefined): string {
  const words = normaliseText(text).split(" ");
  let best: string[] = [];
  let run: string[] = [];
  const flush = () => {
    // Trim rail words from the edges of the run; keep them inside a name.
    while (run.length && RAIL_WORDS.has(run[0])) run.shift();
    while (run.length && RAIL_WORDS.has(run[run.length - 1])) run.pop();
    if (run.join(" ").length > best.join(" ").length) best = run;
    run = [];
  };
  for (const w of words) {
    if (!w || /\d/.test(w)) flush();
    else run.push(w);
  }
  flush();
  const name = best.join(" ");
  return name.length >= 4 ? name : "";
}
