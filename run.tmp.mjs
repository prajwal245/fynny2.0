// ../../../tmp/claude-0/-home-user-fynny2-0/f1942684-1163-55a4-835f-3c411fedaf3e/scratchpad/run.ts
import { getDocumentProxy } from "unpdf";
import fs from "fs";

// src/lib/practice/core.ts
var toPaise = (rupees) => Math.round(rupees * 100);
var round2 = (n) => Math.round(n * 100) / 100;
var MONTHS = {
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
  december: 12
};
var pad = (n) => String(n).padStart(2, "0");
function validYmd(y, m, d) {
  if (!(y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31))
    return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}
var fullYear = (y) => y.length === 2 ? 2e3 + Number(y) : Number(y);
function parseDate(raw) {
  if (raw == null) return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return validYmd(
      raw.getUTCFullYear(),
      raw.getUTCMonth() + 1,
      raw.getUTCDate()
    );
  }
  const s = String(raw).trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (m) return validYmd(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return validYmd(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:\s.*)?$/);
  if (m) return validYmd(fullYear(m[3]), Number(m[2]), Number(m[1]));
  m = s.match(
    /^(\d{1,2})[-/.\s]([A-Za-z]{3,9})[-/.,\s]+(\d{2}|\d{4})(?:\s.*)?$/
  );
  if (m && MONTHS[m[2].toLowerCase()])
    return validYmd(fullYear(m[3]), MONTHS[m[2].toLowerCase()], Number(m[1]));
  m = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m && MONTHS[m[1].toLowerCase()])
    return validYmd(Number(m[3]), MONTHS[m[1].toLowerCase()], Number(m[2]));
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const serial = Math.floor(Number(s));
    if (serial > 2e4 && serial < 8e4) {
      const dt = new Date(Date.UTC(1899, 11, 30) + serial * 864e5);
      return validYmd(
        dt.getUTCFullYear(),
        dt.getUTCMonth() + 1,
        dt.getUTCDate()
      );
    }
  }
  return null;
}

// src/lib/practice/extract/statementCheck.ts
var inr = (n) => `\u20B9${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
var days = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
var signed = (r) => (r.direction === "in" ? 1 : -1) * toPaise(r.amount);
var GAP_DAYS = 10;
function checkStatement(rowsIn) {
  const rows = [...rowsIn].sort((a, b) => a.index - b.index);
  const base = {
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
    checks: []
  };
  if (!rows.length) return base;
  const newestFirst = rows.length > 1 && rows[0].date > rows[rows.length - 1].date;
  const ordered = newestFirst ? [...rows].reverse() : rows;
  const dates = ordered.map((r) => r.date).sort();
  const withBalance = ordered.filter((r) => r.balance !== null).length;
  const totals = {
    in: ordered.filter((r) => r.direction === "in").reduce((n, r) => n + toPaise(r.amount), 0) / 100,
    out: ordered.filter((r) => r.direction === "out").reduce((n, r) => n + toPaise(r.amount), 0) / 100
  };
  const breaks = [];
  let prev = null;
  let opening = null;
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
          note: Math.abs(diff) === 2 * toPaise(r.amount) ? `The balance moved the other way. This line was probably read as ${r.direction === "in" ? "money in" : "money out"} but is ${r.direction === "in" ? "money out" : "money in"}.` : diff > 0 ? `The balance is ${inr(diff / 100)} higher than these lines explain: a line of money in is missing, or a line of money out was read with too large an amount.` : `The balance is ${inr(-diff / 100)} lower than these lines explain: a line of money out is missing, or a line of money in was read with too large an amount.`
        });
      }
    }
    if (bal !== null) prev = bal;
  });
  const closing = [...ordered].reverse().find((r) => r.balance !== null)?.balance ?? null;
  const gaps = [];
  const sortedDates = [...new Set(dates)];
  for (let i = 1; i < sortedDates.length; i++) {
    const d = days(sortedDates[i - 1], sortedDates[i]);
    if (d > GAP_DAYS) gaps.push({ from: sortedDates[i - 1], to: sortedDates[i], days: d });
  }
  const have = new Set(dates.map((d) => d.slice(0, 7)));
  const emptyMonths = [];
  if (dates.length) {
    let [y, m] = dates[0].slice(0, 7).split("-").map(Number);
    const [ly, lm] = dates[dates.length - 1].slice(0, 7).split("-").map(Number);
    while (y < ly || y === ly && m <= lm) {
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
  const checks = [];
  checks.push(
    enough ? { ok: breaks.length === 0, label: "Running balance", detail: breaks.length ? `${breaks.length} place${breaks.length === 1 ? "" : "s"} where the printed balance does not follow from the lines. First: line ${breaks[0].line} on ${breaks[0].date}.` : `All ${ordered.length} lines move the balance by exactly their amount.` } : { ok: null, label: "Running balance", detail: withBalance < 2 ? "The statement has no balance column, so the lines could not be checked against it. Check the closing balance by hand." : `Only ${withBalance} of ${ordered.length} lines carry a balance, so the check is partial.` }
  );
  if (opening !== null && closing !== null && enough) {
    const implied = Math.round((opening / 100 + totals.in - totals.out) * 100) / 100;
    const ties = toPaise(implied) === toPaise(closing);
    checks.push({ ok: ties, label: "Opening and closing balance", detail: ties ? `Opening ${inr(opening / 100)} plus money in ${inr(totals.in)} less money out ${inr(totals.out)} gives the closing balance ${inr(closing)}.` : `Opening ${inr(opening / 100)} plus money in less money out is ${inr(implied)}, but the statement closes at ${inr(closing)}: ${inr(Math.abs(closing - implied))} is unaccounted for.` });
  }
  checks.push({ ok: gaps.length === 0 && emptyMonths.length === 0, label: "Dates", detail: emptyMonths.length ? `No lines at all in ${emptyMonths.join(", ")}. A month or a page may be missing.` : gaps.length ? `${gaps.length} stretch${gaps.length === 1 ? "" : "es"} of more than ${GAP_DAYS} days with no line, the longest ${Math.max(...gaps.map((g) => g.days))} days (${[...gaps].sort((a, b) => b.days - a.days)[0].from} to ${[...gaps].sort((a, b) => b.days - a.days)[0].to}). Quiet accounts have these; a missing page looks the same.` : `Lines on every stretch of ${GAP_DAYS} days between ${dates[0]} and ${dates[dates.length - 1]}.` });
  let status;
  let headline;
  if (breaks.length) {
    status = "fail";
    headline = `The balance does not follow at ${breaks.length} place${breaks.length === 1 ? "" : "s"}. Line ${breaks[0].line} (${breaks[0].date}): expected ${inr(breaks[0].expected)}, the statement shows ${inr(breaks[0].printed)}.`;
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
    checks
  };
}

// src/lib/practice/extract/pdfTable.ts
var DATE_START = /^(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}[-\s][A-Za-z]{3}[-\s]\d{2,4}|\d{1,2}-[A-Za-z]{3}-?|\d{4}-\d{2}-\d{2})/;
var AMOUNT = /^\(?-?\d{1,3}(?:,\d{2,3})*\.\d{1,2}\)?(?:\s?(?:CR|DR|Cr|Dr))?$|^\(?-?\d+\.\d{2}\)?(?:\s?(?:CR|DR|Cr|Dr))?$/;
var FOOTER = /computer[- ]generated|system[- ]generated|page\s*\d+\s*(of\s*\d+)?|generated on|toll[- ]free|customer care|registered office|www\.[a-z0-9-]+\.[a-z]{2,}|end of statement|^report\b|^rep\d+|^total\s*\(|chief man|authori[sz]ed signator|branch manager/i;
var HEADER_WORDS = /\b(date|narration|description|particulars|balance|debit|credit|withdrawals?|deposits?|cheque|chq|ref|value|dr|cr|amt|amount|remarks?|tran|txn|transaction)\b/gi;
var isHeaderLine = (items) => {
  const text = items.map((i) => i.str).join(" ");
  return (text.match(HEADER_WORDS)?.length ?? 0) >= 3 && !items.some((i) => AMOUNT.test(i.str));
};
var edgeLeft = (i) => i.x;
var edgeRight = (i) => i.x + i.width;
function moneyOf(raw) {
  const m = /^\(?(-?)([\d,]+(?:\.\d+)?)\)?\s?(CR|DR|Cr|Dr)?$/.exec(raw.trim());
  if (!m) return null;
  const n = Number(m[2].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  let v = m[1] ? -n : n;
  if (m[3] && m[3].toUpperCase() === "DR") v = -Math.abs(v);
  return round2(v);
}
function cluster(values, tol = 5) {
  const sorted = [...values].sort((a, b) => a - b);
  const out = [];
  for (const v of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(v - last.sum / last.count) <= tol) {
      last.sum += v;
      last.count++;
    } else out.push({ sum: v, count: 1 });
  }
  return out.map((c) => ({ at: c.sum / c.count, count: c.count }));
}
function toLines(items) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - it.y) <= 2.2) last.items.push(it);
    else lines.push({ y: it.y, items: [it] });
  }
  for (const l of lines) {
    l.items.sort((a, b) => a.x - b.x);
    const merged = [];
    for (const it of l.items) {
      const prev = merged[merged.length - 1];
      if (prev && /^(CR|DR|Cr|Dr)$/.test(it.str) && AMOUNT.test(prev.str) && it.x - (prev.x + prev.width) < 14) {
        merged[merged.length - 1] = {
          ...prev,
          str: `${prev.str}${it.str.toUpperCase()}`,
          width: it.x + it.width - prev.x
        };
      } else merged.push(it);
    }
    l.items = merged;
  }
  return lines;
}
function splitGlued(it) {
  const m = /^(\d{1,2}[-/.]\d{1,2}[-/.]\d{4})(?=[A-Za-z]\w*$)/.exec(it.str);
  if (!m) return it;
  return {
    ...it,
    str: m[1],
    width: it.width * (m[1].length / it.str.length)
  };
}
function joinNarration(parts, wrapWidth) {
  let out = "";
  parts.forEach((p, k) => {
    const prev = parts[k - 1];
    if (!prev) out = p.str;
    else
      out += (prev.line !== p.line && prev.w >= wrapWidth && /[A-Za-z0-9/@.]$/.test(prev.str) ? "" : " ") + p.str;
  });
  return out.replace(/\s+/g, " ").trim();
}
function rowsFromPositioned(pagesIn) {
  const pages = pagesIn.map(
    (p) => p.map((i) => ({ ...i, str: i.str.trim() })).filter((i) => i.str).map(splitGlued)
  );
  const allLines = pages.map(toLines);
  const dateItems = pages.flatMap(
    (p) => p.filter((i) => DATE_START.test(i.str))
  );
  if (dateItems.length < 3) return null;
  const dateCols = cluster(dateItems.map(edgeLeft), 6);
  const maxCount = Math.max(...dateCols.map((c) => c.count));
  const dateCol = dateCols.filter((c) => c.count >= maxCount * 0.5).sort((a, b) => a.at - b.at)[0];
  const inDateCol = (i) => Math.abs(i.x - dateCol.at) <= 8;
  const amounts = allLines.flatMap(
    (ls) => ls.flatMap(
      (l) => l.items.filter(
        (i) => AMOUNT.test(i.str) && !inDateCol(i) && i.x > dateCol.at
      )
    )
  );
  if (amounts.length < 3) return null;
  const pick = (edge) => {
    const cs = cluster(amounts.map(edge), 5).filter(
      (c) => c.count >= (amounts.length < 60 ? 1 : Math.max(3, amounts.length * 0.015))
    );
    const covered = cs.reduce((n, c) => n + c.count, 0);
    return { cs: cs.sort((a, b) => a.at - b.at), covered, edge };
  };
  const right = pick(edgeRight);
  const left = pick(edgeLeft);
  const minGap = (cs) => cs.slice(1).reduce((m, c, k) => Math.min(m, c.at - cs[k].at), Infinity);
  const okRight = minGap(right.cs) >= 25;
  const okLeft = minGap(left.cs) >= 25;
  const chosen = okLeft && !okRight ? left : okRight && !okLeft ? right : left.covered > right.covered * 1.05 ? left : right;
  let cols = chosen.cs;
  if (cols.length < 2) return null;
  const balanceCol = cols[cols.length - 1];
  let money = cols.slice(0, -1);
  if (money.length > 2)
    money = [...money].sort((a, b) => b.count - a.count).slice(0, 2).sort((a, b) => a.at - b.at);
  cols = [...money, balanceCol];
  const colOf = (i) => {
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
    return bestD <= (best === cols.length - 1 ? 26 : 14) ? best : -1;
  };
  const moneyLeft = Math.min(
    ...money.map((c) => c.at - (chosen.edge === edgeRight ? 70 : 6))
  );
  const isStart = (l) => {
    const k = l.items.findIndex((i) => inDateCol(i) && DATE_START.test(i.str));
    if (k < 0) return false;
    const next = l.items[k + 1];
    return !(next && /^\d{1,2}:\d{2}(:\d{2})?$/.test(next.str));
  };
  const startsPerPage = allLines.map((ls) => ls.filter(isStart));
  let withText = 0;
  let totalStarts = 0;
  allLines.forEach((ls, p) => {
    for (const first of startsPerPage[p]) {
      totalStarts++;
      void ls;
      if (first.items.some(
        (i) => !inDateCol(i) && i.x > dateCol.at && !AMOUNT.test(i.str) && !DATE_START.test(i.str) && !/^[-–:]+$/.test(i.str) && !/^(CR|DR)$/i.test(i.str)
      ))
        withText++;
    }
  });
  const centred = totalStarts > 0 && withText / totalStarts < 0.5;
  const blocks = [];
  allLines.forEach((ls, p) => {
    const starts = new Set(startsPerPage[p]);
    const pitch = (() => {
      const gaps = [];
      for (let k = 1; k < ls.length; k++) gaps.push(ls[k - 1].y - ls[k].y);
      gaps.sort((a, b) => a - b);
      return gaps.length ? Math.max(gaps[Math.floor(gaps.length * 0.25)], 5) : 10;
    })();
    const mine = ls.filter((l) => starts.has(l));
    if (!mine.length) return;
    const BARRIER = /brought forward|carried forward|\bb\/?f\b|\bc\/?f\b|opening balance|closing balance|statement of account|account statement|report for|\bpage\s*\d|printed|\d{1,2}:\d{2}:\d{2}/i;
    const barriers = ls.filter(
      (l) => !starts.has(l) && (isHeaderLine(l.items) || BARRIER.test(l.items.map((i) => i.str).join(" ")))
    );
    const blocked = (fromY, toY) => barriers.some((b) => b.y < fromY && b.y > toY);
    const made = mine.map((s) => ({ page: p, start: s, lines: [s] }));
    for (const l of ls) {
      if (starts.has(l) || isHeaderLine(l.items) || barriers.includes(l))
        continue;
      if (l.items.every((i) => FOOTER.test(i.str)) || FOOTER.test(l.items.map((i) => i.str).join(" ")))
        continue;
      let target = null;
      if (centred) {
        let bestD = Infinity;
        for (const b of made) {
          const d = Math.abs(b.start.y - l.y);
          if (d < bestD) {
            bestD = d;
            target = b;
          }
        }
        if (bestD > pitch * 4 || target && blocked(
          Math.max(target.start.y, l.y) + 0.1,
          Math.min(target.start.y, l.y) - 0.1
        ))
          target = null;
      } else {
        for (const b of made) if (b.start.y > l.y) target = b;
        if (target && (target.start.y - l.y > pitch * 12 || blocked(target.start.y, l.y)))
          target = null;
      }
      if (target) target.lines.push(l);
    }
    blocks.push(...made);
  });
  const widths = allLines.flatMap(
    (ls) => ls.filter((l) => !isHeaderLine(l.items)).flatMap((l) => l.items)
  ).filter(
    (i) => i.x > dateCol.at && !AMOUNT.test(i.str) && !DATE_START.test(i.str) && i.x < moneyLeft
  ).map((i) => i.width).sort((a, b) => a - b);
  const wrapWidth = widths.length ? widths[Math.floor(widths.length * 0.9)] * 0.93 : Infinity;
  const raws = [];
  for (const b of blocks) {
    const lines = [...b.lines].sort((a, z) => z.y - a.y || 0);
    let dateText = "";
    const parts = [];
    const moneyVals = money.map(() => null);
    let balance = null;
    let minus = false;
    let sawDateCol = false;
    let balanceSide = null;
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
        if (it.x <= dateCol.at) continue;
        if (/^(CR|DR)$/i.test(it.str) && edgeRight(it) <= balanceCol.at + 16 && edgeRight(it) >= balanceCol.at - 70 && chosen.edge === edgeRight) {
          balanceSide = it.str.toUpperCase();
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
        if (DATE_START.test(it.str)) continue;
        if (/^[-–]$/.test(it.str)) continue;
        if (chosen.edge(it) >= moneyLeft && AMOUNT.test(it.str)) continue;
        if (chosen.edge === edgeLeft && it.x >= moneyLeft) continue;
        parts.push({ str: it.str, w: it.width, line: lineNo });
      }
    }
    if (balance !== null && balanceSide === "DR" && balance > 0)
      balance = -balance;
    if (moneyVals.every((v) => v === null)) continue;
    raws.push({
      date: parseDate(dateText),
      desc: joinNarration(parts, wrapWidth),
      money: moneyVals,
      balance,
      minus,
      y: b.start.y,
      rawText: `${dateText} ${parts.map((x) => x.str).join(" ")} ${moneyVals.filter((v) => v !== null).join("/")} ${balance ?? ""}`.trim()
    });
  }
  if (raws.length < 3) return null;
  const amountOf = (r) => r.money.find((v) => v !== null) ?? 0;
  const fit = (list) => {
    let ok = 0;
    for (let k = 1; k < list.length; k++) {
      const a = list[k - 1];
      const b = list[k];
      if (a.balance === null || b.balance === null) continue;
      if (Math.abs(toPaise(b.balance) - toPaise(a.balance)) === toPaise(amountOf(b)))
        ok++;
    }
    return ok;
  };
  const listed = raws;
  const reversed = [...raws].reverse();
  const order = fit(reversed) > fit(listed) ? "newest_first" : "as_listed";
  const chrono = order === "newest_first" ? reversed : listed;
  for (let k = 0; k < chrono.length; ) {
    if (!chrono[k].minus || chrono[k].balance === null || chrono[k].balance >= 0) {
      k++;
      continue;
    }
    let e = k;
    while (e + 1 < chrono.length && chrono[e + 1].minus && chrono[e + 1].balance !== null && chrono[e + 1].balance < 0)
      e++;
    const before = chrono[k - 1];
    const after = chrono[e + 1];
    const run = chrono.slice(k, e + 1);
    const fitsAt = (sign) => {
      let n = 0;
      const first = run[0].balance * sign;
      const last = run[run.length - 1].balance * sign;
      if (before?.balance != null && Math.abs(toPaise(first) - toPaise(before.balance)) === toPaise(amountOf(run[0])))
        n++;
      if (after?.balance != null && Math.abs(toPaise(after.balance) - toPaise(last)) === toPaise(amountOf(after)))
        n++;
      return n;
    };
    if (fitsAt(-1) > fitsAt(1)) for (const r of run) r.balance = -r.balance;
    k = e + 1;
  }
  chrono.forEach((r, k) => {
    const prev = chrono[k - 1];
    if (!prev || prev.balance === null || r.balance === null || r.balance === 0)
      return;
    const step = (b) => Math.abs(toPaise(b) - toPaise(prev.balance));
    if (step(r.balance) !== toPaise(amountOf(r)) && step(-r.balance) === toPaise(amountOf(r)))
      r.balance = -r.balance;
  });
  const votes = money.map(() => ({ out: 0, in: 0 }));
  const dir = chrono.map(() => null);
  chrono.forEach((r, k) => {
    const prev = chrono[k - 1];
    if (!prev || prev.balance === null || r.balance === null) return;
    const delta = toPaise(r.balance) - toPaise(prev.balance);
    if (Math.abs(delta) !== toPaise(amountOf(r)) || delta === 0) return;
    dir[k] = delta > 0 ? "in" : "out";
    const col = r.money.findIndex((v) => v !== null);
    if (col >= 0) votes[col][dir[k]]++;
  });
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
      JSON.stringify(cols)
    );
  const colDir = votes.map(
    (v) => v.out > v.in ? "out" : v.in > v.out ? "in" : null
  );
  const opposite = (d) => d === "in" ? "out" : d === "out" ? "in" : null;
  if (money.length === 2) {
    if (!colDir[0] && colDir[1]) colDir[0] = opposite(colDir[1]);
    if (!colDir[1] && colDir[0]) colDir[1] = opposite(colDir[0]);
  }
  let verified = 0;
  const rows = chrono.map((r, k) => {
    const col = r.money.findIndex((v) => v !== null);
    const issues = [];
    let direction = dir[k];
    let confidence = 0.95;
    if (direction) verified++;
    else {
      direction = col >= 0 ? colDir[col] ?? null : null;
      confidence = direction ? 0.8 : 0.5;
      issues.push(
        direction ? "Direction from the column the amount sits in; not confirmed by the running balance" : "Money in/out unclear"
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
      parse_issues: issues
    };
  });
  const notes = [];
  if (order === "newest_first")
    notes.push(
      "The bank lists this statement newest first; the lines were put in date order."
    );
  return {
    rows,
    order,
    verifiedShare: rows.length ? verified / rows.length : 0,
    notes
  };
}

// ../../../tmp/claude-0/-home-user-fynny2-0/f1942684-1163-55a4-835f-3c411fedaf3e/scratchpad/run.ts
var lo = Number(process.env.LO || -1);
var hi = Number(process.env.HI || -1);
var files = process.argv.slice(2);
for (const f of files) {
  const doc = await getDocumentProxy(new Uint8Array(fs.readFileSync(f)));
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    pages.push(c.items.filter((t) => typeof t.str === "string").map((t) => ({ str: t.str, x: t.transform[4], y: t.transform[5], width: t.width })));
  }
  const t0 = Date.now();
  const r = rowsFromPositioned(pages);
  console.log("\n##", f.split("/").pop(), "pages", doc.numPages, r ? `rows ${r.rows.length} order ${r.order} verified ${(r.verifiedShare * 100).toFixed(1)}% ${Date.now() - t0}ms` : "NULL");
  if (r) {
    const rows = r.rows;
    const chk = checkStatement(rows.filter((x) => x.date && x.amount && x.direction).map((x) => ({ index: x.row_index, date: x.date, amount: x.amount, direction: x.direction, balance: x.balance ?? null })));
    console.log("CHECK", chk.status, "| breaks", chk.breaks.length, "| opening", chk.opening, "closing", chk.closing, "| empty months", chk.emptyMonths.join(",") || "-", "|", chk.headline.slice(0, 160));
    const show = [0, 1, 2, rows.length - 1];
    for (const k of show) {
      const x = rows[k];
      if (x) console.log(k, x.date, x.direction, x.amount, x.balance, (x.description ?? "").slice(0, 70), x.parse_issues.join(";"));
    }
    if (lo >= 0) for (let k = lo; k <= hi; k++) {
      const x = rows[k];
      console.log("ROW", k, x.date, x.direction, x.amount, x.balance, x.description.slice(0, 50), x.parse_confidence);
    }
    let net = 0;
    for (const x of rows) net += (x.direction === "in" ? 1 : -1) * Math.round(x.amount * 100);
    const first = rows[0], last = rows[rows.length - 1];
    const openImplied = first.balance - (first.direction === "in" ? 1 : -1) * first.amount;
    console.log("NET", (net / 100).toFixed(2), "closing-opening", (last.balance - openImplied).toFixed(2), "diff", (last.balance - openImplied - net / 100).toFixed(2));
    const bad = rows.filter((x) => x.parse_issues.length);
    console.log("rows with issues:", bad.length);
    bad.slice(0, 12).forEach((x) => console.log("  ", x.date, x.direction, x.amount, x.balance, x.description.slice(0, 60), x.parse_issues.join(";")));
  }
}
