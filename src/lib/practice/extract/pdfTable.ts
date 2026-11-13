/**
 * Reads a bank statement PDF from where each piece of text sits on the page, not from the order the text comes out in.
 *
 * Banks print a table: a date, a narration that wraps over several lines, a debit and a credit amount, and a running balance.
 * Read as plain text the columns run together and the wrapped lines come apart. Here every transaction starts at a date in the
 * date column, the amounts are taken from the columns they sit in, and the wrapped narration is joined to its transaction. The
 * running balance then proves the direction of every line (money in or out), whichever way round the bank lists them.
 *
 * It needs no header text, so it works on the layouts of HDFC, ICICI, SBI, Union Bank, Indian Bank and others, including pages
 * that do not repeat the header. It returns null when the page does not look like a statement table, and the other readers go on.
 */
import { parseDate, round2, toPaise, type ExtractedRow } from "../core";

export interface PosItem {
  str: string;
  /** Left edge, bottom of the text (PDF points: y grows upward). */
  x: number;
  y: number;
  width: number;
}

const DATE_START =
  /^(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}[-\s][A-Za-z]{3}[-\s]\d{2,4}|\d{1,2}-[A-Za-z]{3}-?|\d{4}-\d{2}-\d{2})/;
const AMOUNT =
  /^\(?-?\d{1,3}(?:,\d{2,3})*\.\d{1,2}\)?(?:\s?(?:CR|DR|Cr|Dr))?$|^\(?-?\d+\.\d{2}\)?(?:\s?(?:CR|DR|Cr|Dr))?$/;
const FOOTER =
  /computer[- ]generated|system[- ]generated|page\s*\d+\s*(of\s*\d+)?|generated on|toll[- ]free|customer care|registered office|www\.[a-z0-9-]+\.[a-z]{2,}|end of statement|^report\b|^rep\d+|^total\s*\(|chief man|authori[sz]ed signator|branch manager/i;

const HEADER_WORDS =
  /\b(date|narration|description|particulars|balance|debit|credit|withdrawals?|deposits?|cheque|chq|ref|value|dr|cr|amt|amount|remarks?|tran|txn|transaction)\b/gi;
/** A column-heading line: at least three heading words and no amount. */
const isHeaderLine = (items: { str: string }[]) => {
  const text = items.map((i) => i.str).join(" ");
  return (
    (text.match(HEADER_WORDS)?.length ?? 0) >= 3 &&
    !items.some((i) => AMOUNT.test(i.str))
  );
};

interface Line {
  y: number;
  items: PosItem[];
}
interface Col {
  at: number;
  count: number;
}

const edgeLeft = (i: PosItem) => i.x;
const edgeRight = (i: PosItem) => i.x + i.width;

function moneyOf(raw: string): number | null {
  const m = /^\(?(-?)([\d,]+(?:\.\d+)?)\)?\s?(CR|DR|Cr|Dr)?$/.exec(raw.trim());
  if (!m) return null;
  const n = Number(m[2]!.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  let v = m[1] ? -n : n;
  if (m[3] && m[3].toUpperCase() === "DR") v = -Math.abs(v);
  return round2(v);
}

function cluster(values: number[], tol = 5): Col[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: { sum: number; count: number }[] = [];
  for (const v of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(v - last.sum / last.count) <= tol) {
      last.sum += v;
      last.count++;
    } else out.push({ sum: v, count: 1 });
  }
  return out.map((c) => ({ at: c.sum / c.count, count: c.count }));
}

function toLines(items: PosItem[]): Line[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Line[] = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - it.y) <= 2.2) last.items.push(it);
    else lines.push({ y: it.y, items: [it] });
  }
  for (const l of lines) {
    l.items.sort((a, b) => a.x - b.x);
    // "DR" or "CR" printed as its own item right after the balance belongs to that balance.
    const merged: PosItem[] = [];
    for (const it of l.items) {
      const prev = merged[merged.length - 1];
      if (
        prev &&
        /^(CR|DR|Cr|Dr)$/.test(it.str) &&
        AMOUNT.test(prev.str) &&
        it.x - (prev.x + prev.width) < 14
      ) {
        merged[merged.length - 1] = {
          ...prev,
          str: `${prev.str}${it.str.toUpperCase()}`,
          width: it.x + it.width - prev.x,
        };
      } else merged.push(it);
    }
    l.items = merged;
  }
  return lines;
}

/** Date, then the id the bank glued to it ("17-04-2025Y90847604"): the date stays, the id is dropped. */
function splitGlued(it: PosItem): PosItem {
  const m = /^(\d{1,2}[-/.]\d{1,2}[-/.]\d{4})(?=[A-Za-z]\w*$)/.exec(it.str);
  if (!m) return it;
  return {
    ...it,
    str: m[1]!,
    width: it.width * (m[1]!.length / it.str.length),
  };
}

function joinNarration(
  parts: { str: string; w: number; line: number }[],
  wrapWidth: number,
): string {
  let out = "";
  parts.forEach((p, k) => {
    const prev = parts[k - 1];
    if (!prev) out = p.str;
    else
      out +=
        (prev.line !== p.line &&
        prev.w >= wrapWidth &&
        /[A-Za-z0-9/@.]$/.test(prev.str)
          ? ""
          : " ") + p.str;
  });
  return out.replace(/\s+/g, " ").trim();
}

interface Block {
  page: number;
  start: Line;
  lines: Line[];
}

export interface PositionedStatement {
  rows: ExtractedRow[];
  /** How the lines were listed in the PDF; rows are returned oldest first either way. */
  order: "as_listed" | "newest_first";
  /** Share of lines whose direction the running balance confirmed. */
  verifiedShare: number;
  notes: string[];
}

export function rowsFromPositioned(
  pagesIn: PosItem[][],
): PositionedStatement | null {
  const pages = pagesIn.map((p) =>
    p
      .map((i) => ({ ...i, str: i.str.trim() }))
      .filter((i) => i.str)
      .map(splitGlued),
  );
  const allLines = pages.map(toLines);

  // 1. The date column: where transaction dates start, leftmost column that most pages agree on.
  const dateItems = pages.flatMap((p) =>
    p.filter((i) => DATE_START.test(i.str)),
  );
  if (dateItems.length < 3) return null;
  const dateCols = cluster(dateItems.map(edgeLeft), 6);
  const maxCount = Math.max(...dateCols.map((c) => c.count));
  const dateCol = dateCols
    .filter((c) => c.count >= maxCount * 0.5)
    .sort((a, b) => a.at - b.at)[0]!;
  const inDateCol = (i: PosItem) => Math.abs(i.x - dateCol.at) <= 8;

  // 2. The amount columns: where amounts line up (on their right edge, or their left edge for left-aligned tables).
  const amounts = allLines.flatMap((ls) =>
    ls.flatMap((l) =>
      l.items.filter(
        (i) => AMOUNT.test(i.str) && !inDateCol(i) && i.x > dateCol.at,
      ),
    ),
  );
  if (amounts.length < 3) return null;
  const pick = (edge: (i: PosItem) => number) => {
    const cs = cluster(amounts.map(edge), 5).filter(
      (c) =>
        c.count >=
        (amounts.length < 60 ? 1 : Math.max(3, amounts.length * 0.015)),
    );
    const covered = cs.reduce((n, c) => n + c.count, 0);
    return { cs: cs.sort((a, b) => a.at - b.at), covered, edge };
  };
  const right = pick(edgeRight);
  const left = pick(edgeLeft);
  // Columns are at least a few characters apart. Two "columns" that are only a few points apart are one column seen from the
  // wrong edge (left-aligned amounts have ragged right edges), so that alignment is not used.
  const minGap = (cs: Col[]) =>
    cs.slice(1).reduce((m, c, k) => Math.min(m, c.at - cs[k]!.at), Infinity);
  const okRight = minGap(right.cs) >= 25;
  const okLeft = minGap(left.cs) >= 25;
  const chosen =
    okLeft && !okRight
      ? left
      : okRight && !okLeft
        ? right
        : left.covered > right.covered * 1.05
          ? left
          : right;
  let cols = chosen.cs;
  if (cols.length < 2) return null;
  // Three or more: the balance is the right-most; keep the two busiest others as the money columns.
  const balanceCol = cols[cols.length - 1]!;
  let money = cols.slice(0, -1);
  if (money.length > 2)
    money = [...money]
      .sort((a, b) => b.count - a.count)
      .slice(0, 2)
      .sort((a, b) => a.at - b.at);
  cols = [...money, balanceCol];
  const colOf = (i: PosItem): number => {
    const e = chosen.edge(i);
    let best = -1;
    let bestD = Infinity;
    cols.forEach((c, k) => {
      const d = Math.abs(e - c.at);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    });
    // A balance printed without its CR / DR is shorter than the others, so it sits further from the column edge.
    return bestD <= (best === cols.length - 1 ? 26 : 14) ? best : -1;
  };
  const moneyLeft = Math.min(
    ...money.map((c) => c.at - (chosen.edge === edgeRight ? 70 : 6)),
  );

  // 3. Transactions: every line with a date in the date column starts one.
  // A page heading can begin with a date too ("22-09-2026 12:04:27 ... Page 3"): a date followed by a clock time is the print time.
  const isStart = (l: Line) => {
    const k = l.items.findIndex((i) => inDateCol(i) && DATE_START.test(i.str));
    if (k < 0) return false;
    const next = l.items[k + 1];
    return !(next && /^\d{1,2}:\d{2}(:\d{2})?$/.test(next.str));
  };
  const startsPerPage = allLines.map((ls) => ls.filter(isStart));
  // Where does a transaction's narration sit? Most banks print its first line on the date line and wrap below it. SBI centres
  // the narration around the date line, so the date line itself carries none: then lines go to the nearest date line.
  let withText = 0;
  let totalStarts = 0;
  allLines.forEach((ls, p) => {
    for (const first of startsPerPage[p]!) {
      totalStarts++;
      void ls;
      if (
        first.items.some(
          (i) =>
            !inDateCol(i) &&
            i.x > dateCol.at &&
            !AMOUNT.test(i.str) &&
            !DATE_START.test(i.str) &&
            !/^[-–:]+$/.test(i.str) &&
            !/^(CR|DR)$/i.test(i.str),
        )
      )
        withText++;
    }
  });
  const centred = totalStarts > 0 && withText / totalStarts < 0.5;

  const blocks: Block[] = [];
  allLines.forEach((ls, p) => {
    const starts = new Set(startsPerPage[p]);
    const pitch = (() => {
      const gaps: number[] = [];
      for (let k = 1; k < ls.length; k++) gaps.push(ls[k - 1]!.y - ls[k]!.y);
      gaps.sort((a, b) => a - b);
      return gaps.length
        ? Math.max(gaps[Math.floor(gaps.length * 0.25)]!, 5)
        : 10;
    })();
    const mine = ls.filter((l) => starts.has(l));
    if (!mine.length) return;
    // Carried-forward lines and page headings end a transaction: what follows them is not its narration.
    const BARRIER =
      /brought forward|carried forward|\bb\/?f\b|\bc\/?f\b|opening balance|closing balance|statement of account|account statement|report for|\bpage\s*\d|printed|\d{1,2}:\d{2}:\d{2}/i;
    const barriers = ls.filter(
      (l) =>
        !starts.has(l) &&
        (isHeaderLine(l.items) ||
          BARRIER.test(l.items.map((i) => i.str).join(" "))),
    );
    const blocked = (fromY: number, toY: number) =>
      barriers.some((b) => b.y < fromY && b.y > toY);
    const made: Block[] = mine.map((s) => ({ page: p, start: s, lines: [s] }));
    for (const l of ls) {
      if (starts.has(l) || isHeaderLine(l.items) || barriers.includes(l))
        continue;
      if (
        l.items.every((i) => FOOTER.test(i.str)) ||
        FOOTER.test(l.items.map((i) => i.str).join(" "))
      )
        continue;
      let target: Block | null = null;
      if (centred) {
        let bestD = Infinity;
        for (const b of made) {
          const d = Math.abs(b.start.y - l.y);
          if (d < bestD) {
            bestD = d;
            target = b;
          }
        }
        if (
          bestD > pitch * 4 ||
          (target &&
            blocked(
              Math.max(target.start.y, l.y) + 0.1,
              Math.min(target.start.y, l.y) - 0.1,
            ))
        )
          target = null;
      } else {
        // Below the date line: it continues the transaction above it.
        for (const b of made) if (b.start.y > l.y) target = b;
        if (
          target &&
          (target.start.y - l.y > pitch * 12 || blocked(target.start.y, l.y))
        )
          target = null;
      }
      if (target) target.lines.push(l);
    }
    blocks.push(...made);
  });

  // Narrow narration columns break words and numbers in the middle of a token ("UPI/509121" / "513847/tran" / "sportTrips"). A fragment
  // that fills the column is joined to the next one with no space.
  const widths = allLines
    .flatMap((ls) =>
      ls.filter((l) => !isHeaderLine(l.items)).flatMap((l) => l.items),
    )
    .filter(
      (i) =>
        i.x > dateCol.at &&
        !AMOUNT.test(i.str) &&
        !DATE_START.test(i.str) &&
        i.x < moneyLeft,
    )
    .map((i) => i.width)
    .sort((a, b) => a - b);
  const wrapWidth = widths.length
    ? widths[Math.floor(widths.length * 0.9)]! * 0.93
    : Infinity;

  // 4. Fields of each transaction.
  interface Raw {
    date: string | null;
    desc: string;
    money: (number | null)[];
    balance: number | null;
    /** The balance was printed with a leading minus (not DR): ICICI sometimes prints one that is not a real overdraft. */
    minus: boolean;
    y: number;
    rawText: string;
  }
  const raws: Raw[] = [];
  for (const b of blocks) {
    const lines = [...b.lines].sort((a, z) => z.y - a.y || 0);
    let dateText = "";
    const parts: { str: string; w: number; line: number }[] = [];
    const moneyVals: (number | null)[] = money.map(() => null);
    let balance: number | null = null;
    let minus = false;
    let sawDateCol = false;
    let balanceSide: "CR" | "DR" | null = null;
    let lineNo = 0;
    for (const l of lines) {
      lineNo++;
      for (const it of l.items) {
        if (inDateCol(it)) {
          if (DATE_START.test(it.str) && !sawDateCol) {
            dateText = it.str;
            sawDateCol = true;
          } else if (/^\d{4}$/.test(it.str) && /[-\s]$/.test(dateText))
            dateText += it.str;
          continue;
        }
        if (it.x <= dateCol.at) continue; // serial number, transaction id: left of the date
        // "DR" or "CR" printed under or beside the balance (SBI overdraft accounts) is that balance's side.
        if (
          /^(CR|DR)$/i.test(it.str) &&
          edgeRight(it) <= balanceCol.at + 16 &&
          edgeRight(it) >= balanceCol.at - 70 &&
          chosen.edge === edgeRight
        ) {
          balanceSide = it.str.toUpperCase() as "CR" | "DR";
          continue;
        }
        if (AMOUNT.test(it.str)) {
          const k = colOf(it);
          const v = moneyOf(it.str);
          if (k >= 0 && v !== null) {
            if (k === cols.length - 1) {
              if (balance === null) minus = /^\(?-/.test(it.str);
              balance = balance ?? v;
            } else if (moneyVals[k] === null) moneyVals[k] = Math.abs(v);
            continue;
          }
        }
        if (DATE_START.test(it.str)) continue; // value date
        if (/^[-–]$/.test(it.str)) continue;
        if (chosen.edge(it) >= moneyLeft && AMOUNT.test(it.str)) continue;
        if (chosen.edge === edgeLeft && it.x >= moneyLeft) continue;
        parts.push({ str: it.str, w: it.width, line: lineNo });
      }
    }
    if (balance !== null && balanceSide === "DR" && balance > 0)
      balance = -balance;
    if (moneyVals.every((v) => v === null)) continue; // not a transaction (a page heading that begins with a date)
    raws.push({
      date: parseDate(dateText),
      desc: joinNarration(parts, wrapWidth),
      money: moneyVals,
      balance,
      minus,
      y: b.start.y,
      rawText:
        `${dateText} ${parts.map((x) => x.str).join(" ")} ${moneyVals.filter((v) => v !== null).join("/")} ${balance ?? ""}`.trim(),
    });
  }
  if (raws.length < 3) return null;

  // 5. Direction from the running balance. Try the order as listed and newest-first; keep the one the balances fit better.
  const amountOf = (r: Raw) => r.money.find((v) => v !== null) ?? 0;
  const fit = (list: Raw[]) => {
    let ok = 0;
    for (let k = 1; k < list.length; k++) {
      const a = list[k - 1]!;
      const b = list[k]!;
      if (a.balance === null || b.balance === null) continue;
      if (
        Math.abs(toPaise(b.balance) - toPaise(a.balance)) ===
        toPaise(amountOf(b))
      )
        ok++;
    }
    return ok;
  };
  const listed = raws;
  const reversed = [...raws].reverse();
  const order: PositionedStatement["order"] =
    fit(reversed) > fit(listed) ? "newest_first" : "as_listed";
  const chrono = order === "newest_first" ? reversed : listed;
  // ICICI sometimes prints a run of balances with a leading minus that is not a real overdraft. Their size fits the amounts either way,
  // so the sign is decided where the run meets the lines around it: the reading that follows on from both sides wins; a tie keeps
  // the sign as printed.
  for (let k = 0; k < chrono.length;) {
    if (
      !chrono[k]!.minus ||
      chrono[k]!.balance === null ||
      chrono[k]!.balance! >= 0
    ) {
      k++;
      continue;
    }
    let e = k;
    while (
      e + 1 < chrono.length &&
      chrono[e + 1]!.minus &&
      chrono[e + 1]!.balance !== null &&
      chrono[e + 1]!.balance! < 0
    )
      e++;
    const before = chrono[k - 1];
    const after = chrono[e + 1];
    const run = chrono.slice(k, e + 1);
    const fitsAt = (sign: 1 | -1) => {
      let n = 0;
      const first = run[0]!.balance! * sign;
      const last = run[run.length - 1]!.balance! * sign;
      if (
        before?.balance != null &&
        Math.abs(toPaise(first) - toPaise(before.balance)) ===
          toPaise(amountOf(run[0]!))
      )
        n++;
      if (
        after?.balance != null &&
        Math.abs(toPaise(after.balance) - toPaise(last)) ===
          toPaise(amountOf(after))
      )
        n++;
      return n;
    };
    if (fitsAt(-1) > fitsAt(1)) for (const r of run) r.balance = -r.balance!;
    k = e + 1;
  }

  // ICICI also prints some negative balances without their minus. A balance whose sign is the only thing keeping it from following the
  // line before it (to the paisa) is read with the other sign.
  chrono.forEach((r, k) => {
    const prev = chrono[k - 1];
    if (!prev || prev.balance === null || r.balance === null || r.balance === 0)
      return;
    const step = (b: number) => Math.abs(toPaise(b) - toPaise(prev.balance!));
    if (
      step(r.balance) !== toPaise(amountOf(r)) &&
      step(-r.balance) === toPaise(amountOf(r))
    )
      r.balance = -r.balance;
  });

  // Which money column is money out? Voted by the lines the balance confirms.
  const votes = money.map(() => ({ out: 0, in: 0 }));
  const dir: ("in" | "out" | null)[] = chrono.map(() => null);
  chrono.forEach((r, k) => {
    const prev = chrono[k - 1];
    if (!prev || prev.balance === null || r.balance === null) return;
    const delta = toPaise(r.balance) - toPaise(prev.balance);
    if (Math.abs(delta) !== toPaise(amountOf(r)) || delta === 0) return;
    dir[k] = delta > 0 ? "in" : "out";
    const col = r.money.findIndex((v) => v !== null);
    if (col >= 0) votes[col]![dir[k]!]++;
  });
  // The first line has no earlier balance in the table: it follows the column the rest agree on.
  if (process.env.PDFT_DEBUG)
    console.log(
      "votes",
      JSON.stringify(votes),
      "order",
      order,
      "fitListed",
      fit(listed),
      "fitRev",
      fit(reversed),
      "cols",
      JSON.stringify(cols),
    );
  const colDir = votes.map((v) =>
    v.out > v.in ? "out" : v.in > v.out ? "in" : null,
  );
  const opposite = (d: "in" | "out" | null) =>
    d === "in" ? "out" : d === "out" ? "in" : null;
  if (money.length === 2) {
    if (!colDir[0] && colDir[1]) colDir[0] = opposite(colDir[1]);
    if (!colDir[1] && colDir[0]) colDir[1] = opposite(colDir[0]);
  }

  let verified = 0;
  const rows: ExtractedRow[] = chrono.map((r, k) => {
    const col = r.money.findIndex((v) => v !== null);
    const issues: string[] = [];
    let direction = dir[k];
    let confidence = 0.95;
    if (direction) verified++;
    else {
      direction = col >= 0 ? (colDir[col] ?? null) : null;
      confidence = direction ? 0.8 : 0.5;
      issues.push(
        direction
          ? "Direction from the column the amount sits in; not confirmed by the running balance"
          : "Money in/out unclear",
      );
    }
    if (!r.date) {
      issues.push("Date could not be read");
      confidence = Math.min(confidence, 0.3);
    }
    return {
      row_index: k,
      raw_text: r.rawText,
      date: r.date,
      amount: round2(amountOf(r)),
      direction,
      description: r.desc,
      counterparty: null,
      reference: null,
      category: null,
      currency: "INR",
      balance: r.balance,
      parse_confidence: confidence,
      parse_issues: issues,
    };
  });

  const notes: string[] = [];
  if (order === "newest_first")
    notes.push(
      "The bank lists this statement newest first; the lines were put in date order.",
    );
  return {
    rows,
    order,
    verifiedShare: rows.length ? verified / rows.length : 0,
    notes,
  };
}
