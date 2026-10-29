/**
 * Recon agent — deterministic bank vs books matching.
 *
 *   Stage 1  exact  amount = amount, date = date, reference equal (or both empty)
 *   Stage 1b pair   same amount within 2 days and the only such pair either
 *                   way (a bank UTR never equals a Tally voucher number)
 *   Stage 2  fuzzy  weighted score (amount 40%, date 25%, counterparty 25%,
 *                   reference 10%) inside a tolerance and a date window
 *   Stage 3  rules  counterparty alias table + narration rules (bank charges,
 *                   interest …) with their own windows
 *   Stage 4  split  one book entry paid in 2–3 bank lines, or one bank line
 *                   covering 2–3 book entries: exact sum, same party
 *
 * No AI is involved: the same input always produces the same matches, and
 * every match and exception carries the numbers that explain it.
 */
import { returnedChequePairs } from "../narrate/flows";
import {
  daysBetween,
  formatRupees,
  normaliseRef,
  normaliseText,
  toPaise,
  type Direction,
  type Side,
} from "../core";

export interface ReconTxn {
  id: string;
  side: Side;
  direction: Direction;
  amount: number;
  txn_date: string;
  counterparty: string | null;
  reference: string | null;
  description: string | null;
  category: string | null;
}

export interface ReconConfig {
  amountToleranceAbs: number; // rupees
  amountTolerancePct: number; // fraction of amount
  dateWindowDays: number;
  fuzzyThreshold: number;
  /** A best candidate must beat the runner-up by this much to auto-match. */
  ambiguityMargin: number;
  aliasDateWindowDays: number;
}

export const DEFAULT_RECON_CONFIG: ReconConfig = {
  amountToleranceAbs: 1,
  amountTolerancePct: 0.001,
  dateWindowDays: 3,
  fuzzyThreshold: 0.82,
  ambiguityMargin: 0.03,
  aliasDateWindowDays: 7,
};

export interface ReconRule {
  id: string;
  name: string;
  /** Any of these (case-insensitive) in the bank narration triggers the rule. */
  narration_any: string[];
  direction?: Direction | null;
  /** Tag written on the transaction, e.g. "bank_charge". */
  tag: string;
  /** Book entries count as the counterpart if their narration/category contains any of these. */
  book_narration_any?: string[];
  date_window_days?: number;
}

export interface CounterpartyAlias {
  alias: string;
  canonical: string;
}

export const DEFAULT_RULES: ReconRule[] = [
  {
    id: "default:bank_charges",
    name: "Bank charges",
    narration_any: [
      "bank charges",
      "chrg",
      "chgs",
      "sms charges",
      "sms chg",
      "sms chgs",
      "chq ret chgs",
      "chq return charges",
      "cheque return charges",
      "amc",
      "service charge",
      "min bal",
      "non-maint",
      "non maint",
      "debit card fee",
      "card fee",
      "imps chg",
      "neft chg",
      "rtgs chg",
      "gst on chg",
      "gst on charges",
    ],
    direction: "out",
    tag: "bank_charge",
    book_narration_any: ["bank charge", "bank charges", "charges"],
    date_window_days: 31,
  },
  {
    id: "default:interest",
    name: "Bank interest",
    narration_any: [
      "int pd",
      "int.pd",
      "interest",
      "int cr",
      "int.coll",
      "sb int",
    ],
    direction: "in",
    tag: "interest",
    book_narration_any: ["interest"],
    date_window_days: 31,
  },
  {
    id: "default:tax",
    name: "Tax payments",
    narration_any: [
      "gst pmt",
      "gst challan",
      "cbdt",
      "tds",
      "advance tax",
      "itns",
    ],
    direction: "out",
    tag: "tax",
    book_narration_any: ["gst", "tds", "tax"],
    date_window_days: 10,
  },
];

export type ReasonCode =
  | "amount_mismatch"
  | "date_gap"
  | "missing_counterparty"
  | "duplicate_suspect"
  | "no_candidate"
  | "partial_payment_suspect"
  | "reference_mismatch";

export type MatchStage = "exact" | "fuzzy" | "rules";

export interface MatchExplanation {
  amount_diff: number;
  date_gap_days: number;
  counterparty_score: number;
  reference_score: number;
  rule?: string;
  alias?: string;
  /** Lines matched together as one part payment share a group id. */
  group?: string;
  note?: string;
}

export interface MatchDecision {
  bank_txn_id: string;
  book_txn_ids: string[];
  stage: MatchStage;
  score: number;
  explanation: MatchExplanation;
}

export interface Candidate {
  txn_id: string;
  score: number;
  reason: string;
  amount: number;
  txn_date: string;
  description: string | null;
}

export interface ExceptionDecision {
  txn_id: string;
  side: Side;
  reason_code: ReasonCode;
  stage_reached: MatchStage;
  candidates: Candidate[];
  tag: string | null;
  detail: string;
}

export interface ReconOutcome {
  matches: MatchDecision[];
  exceptions: ExceptionDecision[];
  tags: Record<string, string>;
  stats: {
    bank_count: number;
    book_count: number;
    matched: number;
    matched_by_stage: Record<MatchStage, number>;
    matched_value: number;
    exceptions: number;
    exceptions_by_reason: Partial<Record<ReasonCode, number>>;
    at_risk_value: number;
  };
}

/* ── scoring helpers ────────────────────────────────────── */

export function tolerance(amount: number, cfg: ReconConfig): number {
  return Math.max(cfg.amountToleranceAbs, amount * cfg.amountTolerancePct);
}

function bigrams(s: string): string[] {
  const t = s.replace(/\s+/g, "");
  const out: string[] = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  return out;
}

const STOP = new Set([
  "pvt",
  "ltd",
  "private",
  "limited",
  "llp",
  "india",
  "the",
  "and",
  "co",
  "company",
  "inc",
  "corp",
  "enterprises",
  "traders",
  "services",
]);

/** Similarity of two names in [0, 1]: best of token overlap and bigram Dice. */
export function nameScore(a: string, b: string): number {
  const na = normaliseText(a);
  const nb = normaliseText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = na.split(" ").filter((t) => t.length > 1 && !STOP.has(t));
  const tb = nb.split(" ").filter((t) => t.length > 1 && !STOP.has(t));
  let overlap = 0;
  if (ta.length && tb.length) {
    const hits = ta.filter((t) =>
      tb.some(
        (x) =>
          x === t ||
          (t.length > 3 && x.startsWith(t)) ||
          (x.length > 3 && t.startsWith(x)),
      ),
    ).length;
    overlap = hits / Math.min(ta.length, tb.length);
  }
  const ga = bigrams(ta.join(" ") || na);
  const gb = bigrams(tb.join(" ") || nb);
  let dice = 0;
  if (ga.length && gb.length) {
    const pool = [...gb];
    let inter = 0;
    for (const g of ga) {
      const i = pool.indexOf(g);
      if (i !== -1) {
        inter++;
        pool.splice(i, 1);
      }
    }
    dice = (2 * inter) / (ga.length + gb.length);
  }
  return Math.min(1, Math.max(overlap, dice));
}

export class AliasBook {
  private map = new Map<string, string>();
  constructor(aliases: CounterpartyAlias[]) {
    for (const a of aliases) {
      const k = normaliseText(a.alias);
      if (k) this.map.set(k, normaliseText(a.canonical));
    }
  }
  /** Canonical name for a counterparty or narration, if the alias table knows it. */
  resolve(text: string | null | undefined): string | null {
    const n = normaliseText(text);
    if (!n) return null;
    if (this.map.has(n)) return this.map.get(n)!;
    for (const [alias, canonical] of this.map) {
      if (alias.length >= 4 && ` ${n} `.includes(` ${alias} `))
        return canonical;
    }
    for (const canonical of new Set(this.map.values())) {
      if (canonical === n) return canonical;
    }
    return null;
  }
}

const partyText = (t: ReconTxn) => t.counterparty || t.description || "";

export function counterpartyScore(
  a: ReconTxn,
  b: ReconTxn,
  aliases: AliasBook,
): number {
  const ca = aliases.resolve(a.counterparty) ?? aliases.resolve(a.description);
  const cb = aliases.resolve(b.counterparty) ?? aliases.resolve(b.description);
  if (ca && cb) return ca === cb ? 1 : 0;
  const pa = partyText(a);
  const pb = partyText(b);
  if (!pa || !pb) return 0.5; // nothing to compare: neutral
  // Narrations are long: compare each counterparty against the other's full text too.
  return Math.max(
    nameScore(pa, pb),
    a.counterparty ? nameScore(a.counterparty, b.description ?? "") * 0.95 : 0,
    b.counterparty ? nameScore(b.counterparty, a.description ?? "") * 0.95 : 0,
  );
}

export function referenceScore(a: ReconTxn, b: ReconTxn): number {
  const ra = normaliseRef(a.reference);
  const rb = normaliseRef(b.reference);
  if (!ra && !rb) return 0.5;
  if (!ra || !rb) {
    // A reference often sits inside the other side's narration.
    const other = normaliseRef(ra ? b.description : a.description);
    const ref = ra || rb;
    return ref.length >= 6 && other.includes(ref) ? 0.9 : 0.3;
  }
  if (ra === rb) return 1;
  if (ra.length >= 6 && rb.length >= 6 && (ra.includes(rb) || rb.includes(ra)))
    return 0.8;
  return 0;
}

export function fuzzyScore(
  bank: ReconTxn,
  book: ReconTxn,
  cfg: ReconConfig,
  aliases: AliasBook,
) {
  const diff = Math.abs(toPaise(bank.amount) - toPaise(book.amount)) / 100;
  const tol = tolerance(bank.amount, cfg);
  const gap = daysBetween(bank.txn_date, book.txn_date);
  const amountSim = diff === 0 ? 1 : Math.max(0, 1 - diff / (tol * 2));
  const dateSim = Math.max(0, 1 - gap / (cfg.dateWindowDays + 1));
  const cp = counterpartyScore(bank, book, aliases);
  const ref = referenceScore(bank, book);
  const score = 0.4 * amountSim + 0.25 * dateSim + 0.25 * cp + 0.1 * ref;
  return {
    score: Math.round(score * 1000) / 1000,
    explanation: {
      amount_diff: diff,
      date_gap_days: gap,
      counterparty_score: Math.round(cp * 100) / 100,
      reference_score: ref,
    },
  };
}

const byDateThenId = (a: ReconTxn, b: ReconTxn) =>
  a.txn_date === b.txn_date
    ? a.id < b.id
      ? -1
      : 1
    : a.txn_date < b.txn_date
      ? -1
      : 1;

const includesAny = (text: string, words: string[] | undefined) => {
  if (!words?.length) return false;
  const n = ` ${normaliseText(text)} `;
  return words.some(
    (w) => n.includes(` ${normaliseText(w)} `) || n.includes(normaliseText(w)),
  );
};

/* ── the engine ─────────────────────────────────────────── */

export function reconcile(
  bankIn: ReconTxn[],
  booksIn: ReconTxn[],
  opts: {
    config?: Partial<ReconConfig>;
    rules?: ReconRule[];
    aliases?: CounterpartyAlias[];
    /** Bank lines outside the run (already matched, or the prior weeks), so a
     *  returned cheque can still be paired with its deposit. */
    pairContext?: ReconTxn[];
  } = {},
): ReconOutcome {
  const cfg: ReconConfig = { ...DEFAULT_RECON_CONFIG, ...(opts.config ?? {}) };
  const rules = opts.rules ?? DEFAULT_RULES;
  const aliases = new AliasBook(opts.aliases ?? []);
  const bank = [...bankIn].sort(byDateThenId);
  const books = [...booksIn].sort(byDateThenId);

  const usedBank = new Set<string>();
  const usedBook = new Set<string>();
  const matches: MatchDecision[] = [];
  const tags: Record<string, string> = {};
  const ambiguous = new Set<string>();

  // Stage 1 — exact.
  const bucket = new Map<string, ReconTxn[]>();
  for (const b of books) {
    const k = `${b.direction}|${toPaise(b.amount)}|${b.txn_date}`;
    (bucket.get(k) ?? bucket.set(k, []).get(k)!).push(b);
  }
  for (const t of bank) {
    const list = bucket.get(
      `${t.direction}|${toPaise(t.amount)}|${t.txn_date}`,
    );
    if (!list) continue;
    const ref = normaliseRef(t.reference);
    const pick =
      list.find(
        (b) =>
          !usedBook.has(b.id) &&
          ref !== "" &&
          normaliseRef(b.reference) === ref,
      ) ??
      list.find(
        (b) =>
          !usedBook.has(b.id) && ref === "" && normaliseRef(b.reference) === "",
      );
    if (!pick) continue;
    usedBank.add(t.id);
    usedBook.add(pick.id);
    matches.push({
      bank_txn_id: t.id,
      book_txn_ids: [pick.id],
      stage: "exact",
      score: 1,
      explanation: {
        amount_diff: 0,
        date_gap_days: 0,
        counterparty_score:
          Math.round(counterpartyScore(t, pick, aliases) * 100) / 100,
        reference_score: ref ? 1 : 0.5,
      },
    });
  }

  // Stage 1b — same amount within 2 days, and the only such pair either way.
  // References are ignored: a bank UTR or cheque number never equals a Tally
  // voucher number. Uniqueness is what makes this safe.
  const PAIR_WINDOW = 2;
  const samePair = (a: ReconTxn, b: ReconTxn) =>
    a.direction === b.direction &&
    toPaise(a.amount) === toPaise(b.amount) &&
    daysBetween(a.txn_date, b.txn_date) <= PAIR_WINDOW;
  for (const t of bank) {
    if (usedBank.has(t.id)) continue;
    const cands = books.filter((b) => !usedBook.has(b.id) && samePair(t, b));
    if (cands.length !== 1) continue;
    const b = cands[0];
    if (bank.some((o) => o.id !== t.id && !usedBank.has(o.id) && samePair(o, b))) continue;
    usedBank.add(t.id);
    usedBook.add(b.id);
    const gap = daysBetween(t.txn_date, b.txn_date);
    const s = fuzzyScore(t, b, cfg, aliases);
    matches.push({
      bank_txn_id: t.id,
      book_txn_ids: [b.id],
      stage: gap === 0 ? "exact" : "fuzzy",
      score: gap === 0 ? 1 : Math.max(0.9, s.score),
      explanation: { ...s.explanation, note: "Only entry with this amount within 2 days" },
    });
  }

  // Stage 1c — booked a few days late. Books are often written up days after the bank
  // moved, so the same exact amount is accepted up to LATE_BOOKING_DAYS apart, but only
  // when the party or a reference agrees and the pair is unique either way.
  const LATE_BOOKING_DAYS = 5;
  // A tax payment is booked to an account ("Tax Payable"), not a party, so two tax lines agree on kind.
  const TAX_WORDS = /\b(gst|cpin|challan|tds|tax|cbdt|epf|esi)\b/i;
  const taxText = (x: ReconTxn) => `${x.counterparty ?? ""} ${x.description ?? ""} ${x.reference ?? ""}`;
  const lateIdentity = (a: ReconTxn, b: ReconTxn) =>
    referenceScore(a, b) >= 0.8 ||
    counterpartyScore(a, b, aliases) >= 0.9 ||
    (TAX_WORDS.test(taxText(a)) && TAX_WORDS.test(taxText(b)));
  const latePair = (a: ReconTxn, b: ReconTxn) =>
    a.direction === b.direction &&
    toPaise(a.amount) === toPaise(b.amount) &&
    daysBetween(a.txn_date, b.txn_date) <= LATE_BOOKING_DAYS &&
    lateIdentity(a, b);
  for (const t of bank) {
    if (usedBank.has(t.id)) continue;
    const cands = books.filter((b) => !usedBook.has(b.id) && latePair(t, b));
    if (cands.length !== 1) continue;
    const b = cands[0]!;
    if (bank.some((o) => o.id !== t.id && !usedBank.has(o.id) && latePair(o, b))) continue;
    usedBank.add(t.id);
    usedBook.add(b.id);
    const gap = daysBetween(t.txn_date, b.txn_date);
    const s = fuzzyScore(t, b, cfg, aliases);
    matches.push({
      bank_txn_id: t.id,
      book_txn_ids: [b.id],
      stage: "fuzzy",
      score: Math.max(0.88, s.score),
      explanation: { ...s.explanation, note: `Booked ${gap} day${gap === 1 ? "" : "s"} ${new Date(b.txn_date) > new Date(t.txn_date) ? "after" : "before"} the bank date; same amount and the ${referenceScore(t, b) >= 0.8 ? "reference" : counterpartyScore(t, b, aliases) >= 0.9 ? "party" : "tax payment"} agree` },
    });
  }

  // Stage 2 — fuzzy, globally greedy on score with an ambiguity guard.
  type Pair = {
    bank: ReconTxn;
    book: ReconTxn;
    score: number;
    explanation: MatchExplanation;
  };
  const pairs: Pair[] = [];
  const openBooks = books.filter((b) => !usedBook.has(b.id));
  for (const t of bank) {
    if (usedBank.has(t.id)) continue;
    const tol = tolerance(t.amount, cfg);
    for (const b of openBooks) {
      if (b.direction !== t.direction) continue;
      if (Math.abs(b.amount - t.amount) > tol) continue;
      if (daysBetween(t.txn_date, b.txn_date) > cfg.dateWindowDays) continue;
      const s = fuzzyScore(t, b, cfg, aliases);
      pairs.push({
        bank: t,
        book: b,
        score: s.score,
        explanation: s.explanation,
      });
    }
  }
  pairs.sort(
    (a, b) =>
      b.score - a.score ||
      (a.bank.id < b.bank.id ? -1 : 1) ||
      (a.book.id < b.book.id ? -1 : 1),
  );
  const byBank = new Map<string, Pair[]>();
  const byBook = new Map<string, Pair[]>();
  for (const p of pairs) {
    (byBank.get(p.bank.id) ?? byBank.set(p.bank.id, []).get(p.bank.id)!).push(
      p,
    );
    (byBook.get(p.book.id) ?? byBook.set(p.book.id, []).get(p.book.id)!).push(
      p,
    );
  }
  const isRival = (p: Pair) => (q: Pair) =>
    q !== p &&
    q.score >= p.score - cfg.ambiguityMargin &&
    !usedBank.has(q.bank.id) &&
    !usedBook.has(q.book.id);
  for (const p of pairs) {
    if (p.score < cfg.fuzzyThreshold) break;
    if (usedBank.has(p.bank.id) || usedBook.has(p.book.id)) continue;
    const rival =
      byBank.get(p.bank.id)!.find(isRival(p)) ??
      byBook.get(p.book.id)!.find(isRival(p));
    if (rival) {
      ambiguous.add(p.bank.id);
      ambiguous.add(p.book.id);
      continue;
    }
    usedBank.add(p.bank.id);
    usedBook.add(p.book.id);
    matches.push({
      bank_txn_id: p.bank.id,
      book_txn_ids: [p.book.id],
      stage: "fuzzy",
      score: p.score,
      explanation: p.explanation,
    });
  }

  // Stage 3 — rules: alias table, then narration rules.
  for (const t of bank) {
    if (usedBank.has(t.id)) continue;
    const canonical =
      aliases.resolve(t.counterparty) ?? aliases.resolve(t.description);
    if (canonical) {
      const tol = tolerance(t.amount, cfg);
      const cands = books.filter(
        (b) =>
          !usedBook.has(b.id) &&
          b.direction === t.direction &&
          Math.abs(b.amount - t.amount) <= tol &&
          daysBetween(t.txn_date, b.txn_date) <= cfg.aliasDateWindowDays &&
          (aliases.resolve(b.counterparty) ??
            aliases.resolve(b.description)) === canonical,
      );
      if (cands.length === 1) {
        const b = cands[0];
        usedBank.add(t.id);
        usedBook.add(b.id);
        const s = fuzzyScore(t, b, cfg, aliases);
        matches.push({
          bank_txn_id: t.id,
          book_txn_ids: [b.id],
          stage: "rules",
          score: Math.max(0.8, s.score),
          explanation: { ...s.explanation, alias: canonical },
        });
        continue;
      }
    }
    const rule = rules.find(
      (r) =>
        (!r.direction || r.direction === t.direction) &&
        (includesAny(`${t.description ?? ""} ${t.counterparty ?? ""}`, r.narration_any) ||
          // Extract already read it as a bank charge (or interest, tax): trust that.
          (!!t.category && t.category === r.tag)),
    );
    if (!rule) continue;
    tags[t.id] = rule.tag;
    const window = rule.date_window_days ?? 31;
    const tol = tolerance(t.amount, cfg);
    const cands = books
      .filter(
        (b) =>
          !usedBook.has(b.id) &&
          b.direction === t.direction &&
          Math.abs(b.amount - t.amount) <= tol &&
          daysBetween(t.txn_date, b.txn_date) <= window &&
          (b.category === rule.tag ||
            includesAny(
              `${b.description ?? ""} ${b.counterparty ?? ""}`,
              rule.book_narration_any,
            )),
      )
      .sort(
        (a, b) =>
          daysBetween(t.txn_date, a.txn_date) -
            daysBetween(t.txn_date, b.txn_date) || (a.id < b.id ? -1 : 1),
      );
    if (cands.length === 0) continue;
    if (
      cands.length > 1 &&
      daysBetween(t.txn_date, cands[0].txn_date) ===
        daysBetween(t.txn_date, cands[1].txn_date)
    ) {
      ambiguous.add(t.id);
      continue;
    }
    const b = cands[0];
    usedBank.add(t.id);
    usedBook.add(b.id);
    const s = fuzzyScore(t, b, cfg, aliases);
    matches.push({
      bank_txn_id: t.id,
      book_txn_ids: [b.id],
      stage: "rules",
      score: Math.max(0.75, s.score),
      explanation: { ...s.explanation, rule: rule.name },
    });
  }

  // Stage 4 — part payments: an exact sum of 2–3 lines from the same party.
  const SPLIT_WINDOW = 31;
  const partyOk = (a: ReconTxn, b: ReconTxn) => {
    const [bk, bo] = a.side === "bank" ? [a, b] : [b, a];
    return counterpartyScore(bk, bo, aliases) >= 0.6;
  };
  const findSplit = (target: ReconTxn, pool: ReconTxn[]): ReconTxn[] | null => {
    const goal = toPaise(target.amount);
    const c = pool
      .filter(
        (o) =>
          o.direction === target.direction &&
          toPaise(o.amount) < goal &&
          daysBetween(o.txn_date, target.txn_date) <= SPLIT_WINDOW &&
          partyOk(target, o),
      )
      .sort(byDateThenId)
      .slice(0, 12);
    const found: ReconTxn[][] = [];
    for (let i = 0; i < c.length; i++)
      for (let j = i + 1; j < c.length; j++) {
        const two = toPaise(c[i].amount) + toPaise(c[j].amount);
        if (two === goal) found.push([c[i], c[j]]);
        for (let k = j + 1; k < c.length && two < goal; k++)
          if (two + toPaise(c[k].amount) === goal) found.push([c[i], c[j], c[k]]);
      }
    // Only an unambiguous split is safe to make on its own.
    return found.length === 1 ? found[0] : null;
  };
  for (const b of books) {
    if (usedBook.has(b.id)) continue;
    const parts = findSplit(b, bank.filter((t) => !usedBank.has(t.id)));
    if (!parts) continue;
    const group = `split:${b.id}`;
    parts.forEach((t, i) => {
      usedBank.add(t.id);
      const s = fuzzyScore(t, b, cfg, aliases);
      matches.push({
        bank_txn_id: t.id,
        book_txn_ids: [b.id],
        stage: "rules",
        score: 0.85,
        explanation: { ...s.explanation, amount_diff: 0, group, note: `Part ${i + 1} of ${parts.length} of one book entry` },
      });
    });
    usedBook.add(b.id);
  }
  for (const t of bank) {
    if (usedBank.has(t.id)) continue;
    const parts = findSplit(t, books.filter((b) => !usedBook.has(b.id)));
    if (!parts) continue;
    usedBank.add(t.id);
    for (const b of parts) usedBook.add(b.id);
    const s = fuzzyScore(t, parts[0], cfg, aliases);
    matches.push({
      bank_txn_id: t.id,
      book_txn_ids: parts.map((b) => b.id),
      stage: "rules",
      score: 0.85,
      explanation: { ...s.explanation, amount_diff: 0, note: `One bank line covering ${parts.length} book entries` },
    });
  }

  const bankById0 = new Map(bank.map((t) => [t.id, t]));
  // Everything left becomes an exception with a specific reason.
  const exceptions: ExceptionDecision[] = [];
  const leftBank = bank.filter((t) => !usedBank.has(t.id));
  const leftBooks = books.filter((b) => !usedBook.has(b.id));
  for (const t of leftBank)
    exceptions.push(
      explain(
        t,
        bank,
        leftBooks,
        cfg,
        aliases,
        tags[t.id] ?? null,
        ambiguous.has(t.id),
      ),
    );
  for (const b of leftBooks)
    exceptions.push(
      explain(b, books, leftBank, cfg, aliases, null, ambiguous.has(b.id)),
    );

  // A returned cheque: the bank took back a deposit whose receipt is still in
  // the books. Say so plainly instead of "no candidate".
  const pairPool = [...bank, ...(opts.pairContext ?? []).filter((t) => t.side === "bank" && !bankById0.has(t.id))];
  const poolById = new Map(pairPool.map((t) => [t.id, t]));
  for (const p of returnedChequePairs(pairPool)) {
    const e = exceptions.find((x) => x.txn_id === p.ret);
    if (!e) continue;
    const dep = poolById.get(p.deposit);
    e.reason_code = "no_candidate";
    e.candidates = [];
    e.detail = `Cheque ${p.cheque ? `${p.cheque} ` : ""}returned${dep ? ` (deposited ${dep.txn_date}${dep.counterparty ? ` from ${dep.counterparty}` : ""})` : ""}. The receipt is still in the books: reverse it there, then mark this reconciled. The deposit is left out of revenue.`;
  }

  const byStage: Record<MatchStage, number> = { exact: 0, fuzzy: 0, rules: 0 };
  let matchedPaise = 0;
  const bankById = new Map(bank.map((t) => [t.id, t]));
  for (const m of matches) {
    byStage[m.stage]++;
    matchedPaise += toPaise(bankById.get(m.bank_txn_id)?.amount ?? 0);
  }
  const byReason: Partial<Record<ReasonCode, number>> = {};
  let riskPaise = 0;
  for (const e of exceptions) {
    byReason[e.reason_code] = (byReason[e.reason_code] ?? 0) + 1;
    if (e.side === "bank")
      riskPaise += toPaise(bankById.get(e.txn_id)?.amount ?? 0);
  }

  return {
    matches,
    exceptions,
    tags,
    stats: {
      bank_count: bank.length,
      book_count: books.length,
      matched: matches.length,
      matched_by_stage: byStage,
      matched_value: matchedPaise / 100,
      exceptions: exceptions.length,
      exceptions_by_reason: byReason,
      at_risk_value: riskPaise / 100,
    },
  };
}

const fmt = formatRupees;

/** Works out why a transaction could not be matched and who the nearest candidates were. */
function explain(
  t: ReconTxn,
  sameSide: ReconTxn[],
  otherSide: ReconTxn[],
  cfg: ReconConfig,
  aliases: AliasBook,
  tag: string | null,
  ambiguous: boolean,
): ExceptionDecision {
  const tol = tolerance(t.amount, cfg);
  const dup = sameSide.find(
    (o) =>
      o.id !== t.id &&
      o.direction === t.direction &&
      toPaise(o.amount) === toPaise(t.amount) &&
      o.txn_date === t.txn_date &&
      normaliseRef(o.reference) === normaliseRef(t.reference) &&
      (normaliseRef(t.reference) !== "" ||
        normaliseText(o.description) === normaliseText(t.description)),
  );

  const scored = otherSide
    .filter(
      (o) =>
        o.direction === t.direction &&
        daysBetween(o.txn_date, t.txn_date) <= 45 &&
        o.amount >= t.amount * 0.1 &&
        o.amount <= t.amount * 10,
    )
    .map((o) => {
      const [bankSide, bookSide] = t.side === "bank" ? [t, o] : [o, t];
      const s = fuzzyScore(bankSide, bookSide, cfg, aliases);
      return { o, ...s };
    })
    .sort((a, b) => b.score - a.score || (a.o.id < b.o.id ? -1 : 1));

  const candidates: Candidate[] = scored
    .slice(0, 3)
    .map(({ o, score, explanation }) => ({
      txn_id: o.id,
      score,
      amount: o.amount,
      txn_date: o.txn_date,
      description: o.description,
      reason: [
        explanation.amount_diff === 0
          ? "same amount"
          : `amount differs by ${fmt(explanation.amount_diff)}`,
        explanation.date_gap_days === 0
          ? "same date"
          : `${explanation.date_gap_days} day${explanation.date_gap_days === 1 ? "" : "s"} apart`,
        explanation.counterparty_score >= 0.7
          ? "party matches"
          : explanation.counterparty_score <= 0.3
            ? "party differs"
            : "",
      ]
        .filter(Boolean)
        .join(", "),
    }));

  const withinTol = (o: ReconTxn) => Math.abs(o.amount - t.amount) <= tol;
  const fuzzyCandidateExisted = scored.some(
    ({ o }) =>
      withinTol(o) && daysBetween(o.txn_date, t.txn_date) <= cfg.dateWindowDays,
  );
  const stage_reached: MatchStage = tag
    ? "rules"
    : fuzzyCandidateExisted
      ? "fuzzy"
      : "exact";
  const base = { txn_id: t.id, side: t.side, stage_reached, candidates, tag };

  if (dup) {
    return {
      ...base,
      reason_code: "duplicate_suspect",
      detail: `Same amount, date and reference as another ${t.side} line. It may have been imported twice.`,
    };
  }
  if (!scored.length) {
    const what = tag
      ? `${tag.replace(/_/g, " ")} with no matching entry in the ${t.side === "bank" ? "books" : "bank"}`
      : `No ${t.side === "bank" ? "book entry" : "bank line"} within 45 days has a comparable amount.`;
    return {
      ...base,
      reason_code: "no_candidate",
      detail: tag ? `Tagged as ${what}. Book it or mark it reconciled.` : what,
    };
  }
  const nearTie =
    scored.length > 1 &&
    scored[0].score - scored[1].score < cfg.ambiguityMargin &&
    [scored[0], scored[1]].every(
      ({ o }) =>
        withinTol(o) &&
        daysBetween(o.txn_date, t.txn_date) <= cfg.dateWindowDays,
    );
  if (ambiguous || nearTie) {
    return {
      ...base,
      reason_code: "duplicate_suspect",
      detail:
        "Several entries match equally well. Pick the right one manually.",
    };
  }
  const best = scored[0];
  const sameAmount = withinTol(best.o);
  const gap = best.explanation.date_gap_days;
  const refsDiffer =
    normaliseRef(t.reference) !== "" &&
    normaliseRef(best.o.reference) !== "" &&
    best.explanation.reference_score === 0;
  const partyMissing =
    !(t.counterparty || t.description) ||
    !(best.o.counterparty || best.o.description);

  // A cheque issued in the books that the bank has not paid yet is a normal month-end item,
  // not a mismatch against some other payment to the same party.
  const chequeWords = /\b(chq|cheque|check)\b/i;
  const text = (x: ReconTxn) => `${x.description ?? ""} ${x.reference ?? ""}`;
  if (t.side === "books" && !sameAmount && chequeWords.test(text(t)) && !chequeWords.test(text(best.o))) {
    return {
      ...base,
      candidates: [],
      reason_code: "no_candidate",
      detail: "Cheque issued in the books and not yet paid by the bank. Normal at month end: it matches when the bank debits it. Leave it open, or mark it reconciled if it is outstanding.",
    };
  }
  if (sameAmount && gap <= cfg.dateWindowDays && refsDiffer) {
    return {
      ...base,
      reason_code: "reference_mismatch",
      detail: `Amount and date agree with a candidate but the references differ (${t.reference} vs ${best.o.reference}).`,
    };
  }
  if (sameAmount && gap <= cfg.dateWindowDays) {
    return {
      ...base,
      reason_code: "missing_counterparty",
      detail: partyMissing
        ? "Amount and date agree but the party is missing on one side."
        : "Amount and date agree but the party names do not.",
    };
  }
  if (sameAmount) {
    return {
      ...base,
      reason_code: "date_gap",
      detail: `Same amount found ${gap} days away, outside the ${cfg.dateWindowDays}-day window.`,
    };
  }
  const ratio =
    Math.min(t.amount, best.o.amount) / Math.max(t.amount, best.o.amount);
  const sameParty = best.explanation.counterparty_score >= 0.6;
  // A bank charge, interest or tax line is not an "amount mismatch" against an
  // unrelated party's bill: it simply has no entry in the books yet.
  if (!sameParty && (tag || ratio < 0.5)) {
    return {
      ...base,
      // An entry for another party at a very different amount is not a suggestion.
      candidates: [],
      reason_code: "no_candidate",
      detail: tag
        ? `Tagged as ${tag.replace(/_/g, " ")} with no matching entry in the ${t.side === "bank" ? "books" : "bank"}. Book it or mark it reconciled.`
        : `No ${t.side === "bank" ? "book entry" : "bank line"} has a comparable amount; the nearest is ${fmt(best.o.amount)} for another party.`,
    };
  }
  const bankAmount = t.side === "bank" ? t.amount : best.o.amount;
  const bookAmount = t.side === "bank" ? best.o.amount : t.amount;
  if (sameParty && ratio < 0.97 && bankAmount < bookAmount) {
    return {
      ...base,
      reason_code: "partial_payment_suspect",
      detail: `Same party, but ${fmt(bankAmount)} in the bank against ${fmt(bookAmount)} in the books. Possibly a part payment.`,
    };
  }
  if (sameParty && bankAmount > bookAmount) {
    return {
      ...base,
      reason_code: "amount_mismatch",
      detail: `Same party, but the bank shows ${fmt(bankAmount - bookAmount)} more than the books (${fmt(bankAmount)} against ${fmt(bookAmount)}). An overpayment, or a payment covering more than one bill.`,
    };
  }
  return {
    ...base,
    reason_code: "amount_mismatch",
    detail: `Nearest candidate is ${fmt(best.o.amount)} (difference ${fmt(Math.abs(best.o.amount - t.amount))}).`,
  };
}

export const REASON_LABELS: Record<ReasonCode, string> = {
  amount_mismatch: "Amount mismatch",
  date_gap: "Date gap",
  missing_counterparty: "Missing counterparty",
  duplicate_suspect: "Duplicate suspect",
  no_candidate: "No candidate",
  partial_payment_suspect: "Partial payment suspect",
  reference_mismatch: "Reference mismatch",
};

/**
 * How many decisions a set of exceptions needs: a bank line and its book
 * entry that point at each other are one decision. The Exception Queue, the
 * sidebar badge and the Recon log all count this way.
 */
export function decisionCount(exceptions: { txn_id: string; side: string; candidates: { txn_id: string }[] }[]): number {
  const bankFirst = new Map(exceptions.filter((e) => e.side !== "books").map((e) => [e.txn_id, e.candidates[0]?.txn_id]));
  return exceptions.filter((e) => !(e.side === "books" && e.candidates[0] && bankFirst.get(e.candidates[0].txn_id) === e.txn_id)).length;
}

/**
 * Pairs a partner unmatched stay apart: any match the engine proposes again
 * for such a pair is dropped and both sides become exceptions that say why,
 * with the other side offered as a candidate in case it was right after all.
 */
export function withoutUnmatchedPairs(
  outcome: ReconOutcome,
  blocked: Map<string, { at: string; note: string | null; by: string | null }>,
  lines: ReconTxn[],
): ReconOutcome {
  if (!blocked.size) return outcome;
  const byId = new Map(lines.map((t) => [t.id, t]));
  const keep: MatchDecision[] = [];
  const extra: ExceptionDecision[] = [];
  for (const m of outcome.matches) {
    const hit = m.book_txn_ids.map((b) => blocked.get(`${m.bank_txn_id}|${b}`)).find(Boolean);
    if (!hit) {
      keep.push(m);
      continue;
    }
    const why = `Unmatched by ${hit.by ?? "a partner"} on ${hit.at.slice(0, 10)}${hit.note ? `: ${hit.note}` : ""}. Match it by hand if the pair is right after all.`;
    const asCandidate = (id: string): Candidate | null => {
      const t = byId.get(id);
      return t ? { txn_id: t.id, score: m.score, reason: "Unmatched earlier", amount: t.amount, txn_date: t.txn_date, description: t.description } : null;
    };
    const bankCands = m.book_txn_ids.map(asCandidate).filter(Boolean) as Candidate[];
    extra.push({ txn_id: m.bank_txn_id, side: "bank", reason_code: "no_candidate", stage_reached: m.stage, candidates: bankCands, tag: null, detail: why });
    for (const b of m.book_txn_ids) {
      const c = asCandidate(m.bank_txn_id);
      extra.push({ txn_id: b, side: "books", reason_code: "no_candidate", stage_reached: m.stage, candidates: c ? [c] : [], tag: null, detail: why });
    }
  }
  const dropped = new Set(extra.map((e) => e.txn_id));
  return {
    ...outcome,
    matches: keep,
    exceptions: [...outcome.exceptions.filter((e) => !dropped.has(e.txn_id)), ...extra],
  };
}
