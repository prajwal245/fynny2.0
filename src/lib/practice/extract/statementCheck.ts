/**
 * Is this bank statement correct and complete? The first thing a CA checks, done before any line is used.
 *
 * A statement prints a running balance after every line. If each line moves the balance by exactly its amount, in the
 * right direction, then nothing is missing, nothing is doubled and no line is read the wrong way round. Where the chain
 * breaks, the statement is missing a line, a page is gone, or a line was read wrongly, and the check says which line and
 * by how much. It also reports the opening and closing balance the lines imply, quiet stretches and months with no lines,
 * and lines that appear in an earlier statement of the same account (overlap), so they are counted once.
 *
 * Pure and deterministic. It reads figures; it never changes them.
 */
import { toPaise } from "../core";

export interface CheckRow {
  index: number;
  date: string;
  amount: number;
  direction: "in" | "out";
  balance: number | null;
}

export interface BalanceBreak {
  /** Position of the line in the statement, from 1, in the order a person reads it (oldest first). */
  line: number;
  date: string;
  amount: number;
  direction: "in" | "out";
  expected: number;
  printed: number;
  difference: number;
  note: string;
}

export interface Gap {
  from: string;
  to: string;
  days: number;
}

export interface StatementCheck {
  status: "pass" | "warn" | "fail" | "unknown";
  headline: string;
  lines: number;
  withBalance: number;
  first: string | null;
  last: string | null;
  /** The balance before the first line and after the last, as the printed balances imply. */
  opening: number | null;
  closing: number | null;
  totals: { in: number; out: number };
  order: "oldest_first" | "newest_first";
  breaks: BalanceBreak[];
  gaps: Gap[];
  emptyMonths: string[];
  checks: { ok: boolean | null; label: string; detail: string }[];
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const signed = (r: CheckRow) => (r.direction === "in" ? 1 : -1) * toPaise(r.amount);

/** Quiet stretches longer than this are listed so a missing page is noticed even without balances. */
export const GAP_DAYS = 10;

export function checkStatement(rowsIn: CheckRow[]): StatementCheck {
  const rows = [...rowsIn].sort((a, b) => a.index - b.index);
  const base: StatementCheck = {
    status: "unknown",
    headline: "No lines to check.",
    lines: rows.length,
    withBalance: 0,
    first: null,
    last: null,
    opening: null,
    closing: null,
    totals: { in: 0, out: 0 },
    order: "oldest_first",
    breaks: [],
    gaps: [],
    emptyMonths: [],
    checks: [],
  };
  if (!rows.length) return base;

  // Banks print oldest first or newest first. Read it the way the balances run.
  const newestFirst = rows.length > 1 && rows[0]!.date > rows[rows.length - 1]!.date;
  const ordered = newestFirst ? [...rows].reverse() : rows;
  const dates = ordered.map((r) => r.date).sort();
  const withBalance = ordered.filter((r) => r.balance !== null).length;
  const totals = {
    in: ordered.filter((r) => r.direction === "in").reduce((n, r) => n + toPaise(r.amount), 0) / 100,
    out: ordered.filter((r) => r.direction === "out").reduce((n, r) => n + toPaise(r.amount), 0) / 100,
  };

  // The balance chain: each printed balance must equal the one before it plus the line. After a break the chain
  // carries on from the printed balance, so one missing line is one break, not a cascade.
  const breaks: BalanceBreak[] = [];
  let prev: number | null = null;
  let opening: number | null = null;
  ordered.forEach((r, i) => {
    const bal = r.balance === null ? null : toPaise(r.balance);
    if (i === 0 && bal !== null) opening = bal - signed(r);
    if (bal !== null && prev !== null) {
      const expected = prev + signed(r);
      if (expected !== bal) {
        const diff = bal - expected;
        breaks.push({
          line: i + 1,
          date: r.date,
          amount: r.amount,
          direction: r.direction,
          expected: expected / 100,
          printed: bal / 100,
          difference: diff / 100,
          note:
            Math.abs(diff) === 2 * toPaise(r.amount)
              ? `The balance moved the other way. This line was probably read as ${r.direction === "in" ? "money in" : "money out"} but is ${r.direction === "in" ? "money out" : "money in"}.`
              : diff > 0
                ? `The balance is ${inr(diff / 100)} higher than these lines explain: a line of money in is missing, or a line of money out was read with too large an amount.`
                : `The balance is ${inr(-diff / 100)} lower than these lines explain: a line of money out is missing, or a line of money in was read with too large an amount.`,
        });
      }
    }
    if (bal !== null) prev = bal;
  });
  const closing = [...ordered].reverse().find((r) => r.balance !== null)?.balance ?? null;

  // Quiet stretches, and months with no line at all, between the first and last date.
  const gaps: Gap[] = [];
  const sortedDates = [...new Set(dates)];
  for (let i = 1; i < sortedDates.length; i++) {
    const d = days(sortedDates[i - 1]!, sortedDates[i]!);
    if (d > GAP_DAYS) gaps.push({ from: sortedDates[i - 1]!, to: sortedDates[i]!, days: d });
  }
  const have = new Set(dates.map((d) => d.slice(0, 7)));
  const emptyMonths: string[] = [];
  if (dates.length) {
    let [y, m] = dates[0]!.slice(0, 7).split("-").map(Number) as [number, number];
    const [ly, lm] = dates[dates.length - 1]!.slice(0, 7).split("-").map(Number) as [number, number];
    while (y < ly || (y === ly && m <= lm)) {
      const key = `${y}-${String(m).padStart(2, "0")}`;
      if (!have.has(key)) emptyMonths.push(key);
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }
  }

  const enough = withBalance >= 2 && withBalance >= Math.ceil(ordered.length * 0.9);
  const checks: StatementCheck["checks"] = [];
  checks.push(
    enough
      ? { ok: breaks.length === 0, label: "Running balance", detail: breaks.length ? `${breaks.length} place${breaks.length === 1 ? "" : "s"} where the printed balance does not follow from the lines. First: line ${breaks[0]!.line} on ${breaks[0]!.date}.` : `All ${ordered.length} lines move the balance by exactly their amount.` }
      : { ok: null, label: "Running balance", detail: withBalance < 2 ? "The statement has no balance column, so the lines could not be checked against it. Check the closing balance by hand." : `Only ${withBalance} of ${ordered.length} lines carry a balance, so the check is partial.` },
  );
  if (opening !== null && closing !== null && enough) {
    const implied = Math.round((opening / 100 + totals.in - totals.out) * 100) / 100;
    const ties = toPaise(implied) === toPaise(closing);
    checks.push({ ok: ties, label: "Opening and closing balance", detail: ties ? `Opening ${inr(opening / 100)} plus money in ${inr(totals.in)} less money out ${inr(totals.out)} gives the closing balance ${inr(closing)}.` : `Opening ${inr(opening / 100)} plus money in less money out is ${inr(implied)}, but the statement closes at ${inr(closing)}: ${inr(Math.abs(closing - implied))} is unaccounted for.` });
  }
  checks.push({ ok: gaps.length === 0 && emptyMonths.length === 0, label: "Dates", detail: emptyMonths.length ? `No lines at all in ${emptyMonths.join(", ")}. A month or a page may be missing.` : gaps.length ? `${gaps.length} stretch${gaps.length === 1 ? "" : "es"} of more than ${GAP_DAYS} days with no line, the longest ${Math.max(...gaps.map((g) => g.days))} days (${[...gaps].sort((a, b) => b.days - a.days)[0]!.from} to ${[...gaps].sort((a, b) => b.days - a.days)[0]!.to}). Quiet accounts have these; a missing page looks the same.` : `Lines on every stretch of ${GAP_DAYS} days between ${dates[0]} and ${dates[dates.length - 1]}.` });

  let status: StatementCheck["status"];
  let headline: string;
  if (breaks.length) {
    status = "fail";
    headline = `The balance does not follow at ${breaks.length} place${breaks.length === 1 ? "" : "s"}. Line ${breaks[0]!.line} (${breaks[0]!.date}): expected ${inr(breaks[0]!.expected)}, the statement shows ${inr(breaks[0]!.printed)}.`;
  } else if (!enough) {
    status = "unknown";
    headline = withBalance < 2 ? "No balance column, so the lines could not be checked." : `Only ${withBalance} of ${ordered.length} lines carry a balance.`;
  } else if (emptyMonths.length || gaps.length) {
    status = "warn";
    headline = `The balance follows on every line, but ${emptyMonths.length ? `there are no lines in ${emptyMonths.join(", ")}` : `there is a stretch of ${Math.max(...gaps.map((g) => g.days))} days with no line`}.`;
  } else {
    status = "pass";
    headline = `Correct and complete: ${ordered.length} lines from ${dates[0]} to ${dates[dates.length - 1]}, opening ${inr((opening ?? 0) / 100)}, closing ${inr(closing ?? 0)}.`;
  }

  return {
    status,
    headline,
    lines: ordered.length,
    withBalance,
    first: dates[0] ?? null,
    last: dates[dates.length - 1] ?? null,
    opening: opening === null ? null : opening / 100,
    closing,
    totals,
    order: newestFirst ? "newest_first" : "oldest_first",
    breaks: breaks.slice(0, 20),
    gaps: gaps.slice(0, 10),
    emptyMonths,
    checks,
  };
}

/* ── lines that are in two statements of the same account ───── */

export interface OverlapRow {
  date: string;
  amount: number;
  direction: "in" | "out";
  balance: number | null;
}

export interface Overlap {
  /** Lines of the new statement that are already in an earlier one. */
  count: number;
  from: string | null;
  to: string | null;
  /** Same date, amount and direction but a different balance: probably a genuine second transaction, not a repeat. */
  differentBalance: number;
}

const keyOf = (r: OverlapRow) => `${r.date}|${r.direction}|${toPaise(r.amount)}`;

/**
 * Which lines of a new statement are already in earlier statements of the same account. Matching is one to one, so two
 * real payments of the same amount on the same day are not mistaken for one line shown twice, and a printed balance that
 * differs says it is a different transaction.
 */
export function findOverlap(fresh: OverlapRow[], existing: OverlapRow[]): Overlap {
  const pool = new Map<string, OverlapRow[]>();
  for (const e of existing) (pool.get(keyOf(e)) ?? pool.set(keyOf(e), []).get(keyOf(e))!).push(e);
  let count = 0;
  let differentBalance = 0;
  const dates: string[] = [];
  for (const f of fresh) {
    const list = pool.get(keyOf(f));
    if (!list?.length) continue;
    const same = list.findIndex((e) => e.balance === null || f.balance === null || toPaise(e.balance) === toPaise(f.balance));
    if (same >= 0) {
      list.splice(same, 1);
      count++;
      dates.push(f.date);
    } else differentBalance++;
  }
  dates.sort();
  return { count, from: dates[0] ?? null, to: dates[dates.length - 1] ?? null, differentBalance };
}

export const overlapSentence = (o: Overlap, total: number): string | null =>
  o.count || o.differentBalance
    ? `${o.count ? `${o.count} of ${total} lines (${o.from} to ${o.to}) are already in an earlier statement of this account and are counted once.` : ""}${o.differentBalance ? ` ${o.differentBalance} line${o.differentBalance === 1 ? " has" : "s have"} the same date and amount as an earlier line but a different balance, so ${o.differentBalance === 1 ? "it is" : "they are"} a separate transaction. Check ${o.differentBalance === 1 ? "it was" : "they were"} kept.` : ""}`.trim()
    : null;
