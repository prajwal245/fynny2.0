/**
 * The bank's own control figures, read from the statement itself and compared with what FynHelp read.
 *
 * Most banks print something a person can tick against: HDFC a summary row (opening, debit and credit counts and totals, closing),
 * Indian Bank a "Dr. Count / Cr. Count" row on every page, Union Bank a "Total" row, ICICI a serial number on every line and
 * "Page n of N" on every page. These used to be thrown away as page furniture. They are free ground truth: "we read 161 of the
 * bank's 161 and both totals tie" is a stronger statement than "the balance follows".
 *
 * Pure and cautious. It only reports a figure it found in the file; a bank that prints nothing gets no checks, never a guess.
 * A figure that disagrees is evidence for a person to look at, never an instruction to change a line.
 */
import type { PosItem } from "./pdfTable";

export interface BankSummary {
  /** Which printed layout the figures came from, for the person reading the check. */
  source: "summary_row" | "page_counts" | "total_row" | "serials";
  drCount?: number;
  crCount?: number;
  debits?: number;
  credits?: number;
  opening?: number;
  closing?: number;
  /** Union Bank's credit total includes the opening balance. */
  creditsMayIncludeOpening?: boolean;
  /** Indian Bank's money totals run across pages, so the last page's are the statement's. Its counts are per page and are added up. */
  serialMax?: number;
  serialMissing?: number[];
  pagesPrinted?: number;
  pagesInFile?: number;
}

export interface TieCheck {
  ok: boolean | null;
  label: string;
  detail: string;
}

export interface TieOut {
  checks: TieCheck[];
  /** true: everything the bank printed ties; false: something differs; null: the bank printed nothing to compare. */
  tied: boolean | null;
}

const AMT = /^\(?-?[\d,]+\.\d{1,2}\)?(?:\s?(?:CR|DR|Cr|Dr))?$/;
const money = (s: string): number | null => {
  const m = /^\(?(-?)([\d,]+(?:\.\d+)?)\)?\s?(?:CR|DR|Cr|Dr)?$/.exec(s.trim());
  if (!m) return null;
  const n = Number(m[2]!.replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round((m[1] ? -n : n) * 100) / 100 : null;
};

interface Line {
  y: number;
  items: PosItem[];
  text: string;
}

function linesOf(items: PosItem[]): Line[] {
  const sorted = items.filter((i) => i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const out: Line[] = [];
  for (const it of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.y - it.y) <= 2.2) last.items.push(it);
    else out.push({ y: it.y, items: [it], text: "" });
  }
  for (const l of out) {
    l.items.sort((a, b) => a.x - b.x);
    l.text = l.items.map((i) => i.str.trim()).join(" ");
  }
  return out;
}

/** Reads whatever control figures the statement prints. Null when it prints none we recognise. */
export function readBankSummary(pagesIn: PosItem[][]): BankSummary | null {
  const pages = pagesIn.map(linesOf);
  const found: Partial<BankSummary> = {};
  let source: BankSummary["source"] | null = null;

  // 1. HDFC: a heading row (Opening Balance, Dr Count, Cr Count, Debits, Credits, Closing Bal) and the figures under it.
  for (const ls of pages) {
    ls.forEach((l, k) => {
      if (source === "summary_row") return;
      const has = (re: RegExp) => l.items.some((i) => re.test(i.str));
      if (!(has(/^Dr\.?\s*Count$/i) && has(/^Cr\.?\s*Count$/i) && has(/^Debits?$/i) && has(/^Credits?$/i))) return;
      const below = ls[k + 1];
      if (!below || l.y - below.y > 40) return;
      const heads = l.items.filter((i) => /^(Opening\s*Bal\w*|Dr\.?\s*Count|Cr\.?\s*Count|Debits?|Credits?|Closing\s*Bal\w*)$/i.test(i.str)).sort((a, b) => a.x - b.x);
      const vals = below.items.filter((i) => /^[\d,]+(?:\.\d+)?$/.test(i.str.trim())).sort((a, b) => a.x - b.x);
      if (heads.length < 4 || vals.length !== heads.length) return;
      heads.forEach((h, n) => {
        const v = money(vals[n]!.str);
        if (v === null) return;
        if (/^Opening/i.test(h.str)) found.opening = v;
        else if (/^Dr\.?\s*Count/i.test(h.str)) found.drCount = Math.round(v);
        else if (/^Cr\.?\s*Count/i.test(h.str)) found.crCount = Math.round(v);
        else if (/^Debit/i.test(h.str)) found.debits = v;
        else if (/^Credit/i.test(h.str)) found.credits = v;
        else if (/^Closing/i.test(h.str)) found.closing = v;
      });
      source = "summary_row";
    });
  }

  // 2. Indian Bank: every page prints "Dr. Count: n  Cr. Count: m  <debits so far>  <credits so far>", the counts being that page's own.
  // The LAST page prints the statement's whole summary, so only a summary on the last page of the file is used: an earlier page's
  // figures are page totals and would only mislead.
  if (!source && pages.length) {
    const last = pages[pages.length - 1]!;
    for (const l of last) {
      const cr = /Cr\.?\s*Count\s*:?\s*(\d+)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/i.exec(l.text);
      if (!cr) continue;
      // The debit count sits on this line, or on a line the PDF put a little above or below it.
      const whole = /Dr\.?\s*Count\s*:?\s*(\d+)\s+Cr/i.exec(l.text);
      let dr: number | null = whole ? Number(whole[1]) : null;
      if (dr === null)
        for (const o of last) {
          if (o === l || Math.abs(o.y - l.y) > 14) continue;
          const m = /\bCount\s*:?\s*(\d+)\s*$/i.exec(o.text);
          if (m) dr = Number(m[1]);
        }
      if (dr === null) continue;
      Object.assign(found, { drCount: dr, crCount: Number(cr[1]), debits: money(cr[2]!) ?? undefined, credits: money(cr[3]!) ?? undefined });
      source = "page_counts";
    }
  }

  // 3. Union Bank: "Total(Curr. INR) : 1,59,29,559.95  2,02,19,062.53  42,89,502.58CR" (debits, credits, closing); credits include the opening balance.
  if (!source) {
    for (const ls of pages)
      for (const l of ls) {
        const m = /Total\s*\(Curr\.?\s*INR\)\s*:?\s*([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*(?:CR|DR)?/i.exec(l.text);
        if (!m) continue;
        found.debits = money(m[1]!) ?? undefined;
        found.credits = money(m[2]!) ?? undefined;
        found.closing = money(m[3]!) ?? undefined;
        found.creditsMayIncludeOpening = true;
        source = "total_row";
      }
    if (source === "total_row") {
      for (const ls of pages.slice(0, 2))
        for (const l of ls) {
          const m = /Opening\s+balance\s*:?\s*([\d,]+\.\d{2})\s*(?:CR|DR)?/i.exec(l.text);
          if (m && found.opening === undefined) found.opening = money(m[1]!) ?? undefined;
        }
    }
  }

  // 4. Serial numbers (ICICI): the column headed S.no counts every line from 1. The heading is printed on the first page only, so its
  // position is applied to every page.
  const heads = pagesIn.flatMap((items) => items.filter((i) => /^S\.?\s*no\.?$/i.test(i.str.trim())));
  const serials: number[] = [];
  if (heads.length) {
    const x0 = heads.map((h) => h.x).sort((a, b) => a - b)[Math.floor(heads.length / 2)]!;
    pagesIn.forEach((items) => {
      const head = items.find((i) => /^S\.?\s*no\.?$/i.test(i.str.trim()));
      for (const i of items) if ((!head || i.y < head.y - 5) && Math.abs(i.x - x0) <= 8 && /^\d{1,6}$/.test(i.str.trim())) serials.push(Number(i.str.trim()));
    });
  }
  if (serials.length >= 3) {
    const sorted = [...new Set(serials)].sort((a, b) => a - b);
    // Lines are numbered 1..N: a column of other numbers (page numbers, codes) would not start at 1 and run on.
    if (sorted[0] === 1 && sorted.length >= serials.length * 0.9) {
      const max = sorted[sorted.length - 1]!;
      const have = new Set(sorted);
      const missing: number[] = [];
      for (let n = 1; n <= max && missing.length < 50; n++) if (!have.has(n)) missing.push(n);
      found.serialMax = max;
      found.serialMissing = missing;
      source ??= "serials";
    }
  }
  let printedPages = 0;
  for (const ls of pages)
    for (const l of ls) {
      const m = /\bPage\s+(\d+)\s+of\s+(\d+)\b/i.exec(l.text);
      if (m) printedPages = Math.max(printedPages, Number(m[2]));
    }
  if (printedPages >= 2) {
    found.pagesPrinted = printedPages;
    found.pagesInFile = pagesIn.length;
    source ??= "serials";
  }

  return source ? ({ source, ...found } as BankSummary) : null;
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const n0 = (n: number) => n.toLocaleString("en-IN");
const near = (a: number, b: number) => Math.abs(a - b) < 0.005;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export interface ReadFigures {
  /** The lines FynHelp read (those with a date, an amount and a direction). */
  lines: { amount: number; direction: "in" | "out" }[];
  /** The opening and closing balance the printed balances imply, from the statement check. */
  opening: number | null;
  closing: number | null;
}

/** Compares what the bank printed with what was read. One check per figure the bank printed. */
export function tieOut(s: BankSummary | null, read: ReadFigures): TieOut {
  if (!s) return { checks: [], tied: null };
  const checks: TieCheck[] = [];
  const outs = read.lines.filter((l) => l.direction === "out");
  const ins = read.lines.filter((l) => l.direction === "in");
  const sum = (l: { amount: number }[]) => Math.round(l.reduce((n, x) => n + Math.round(x.amount * 100), 0)) / 100;

  if (s.drCount !== undefined && s.crCount !== undefined) {
    const okDr = outs.length === s.drCount;
    const okCr = ins.length === s.crCount;
    const parts: string[] = [];
    if (!okDr) parts.push(s.drCount > outs.length ? `${plural(s.drCount - outs.length, "debit")} missing` : `${plural(outs.length - s.drCount, "extra debit")}`);
    if (!okCr) parts.push(s.crCount > ins.length ? `${plural(s.crCount - ins.length, "credit")} missing` : `${plural(ins.length - s.crCount, "extra credit")}`);
    checks.push({
      ok: okDr && okCr,
      label: "The bank's own count",
      detail: `The bank prints ${plural(s.drCount, "debit")} and ${plural(s.crCount, "credit")}. We read ${outs.length} and ${ins.length}${okDr && okCr ? ": every line is accounted for." : `: ${parts.join(", ")}.`}`,
    });
  }

  if (s.debits !== undefined || s.credits !== undefined) {
    const sumOut = sum(outs);
    const sumIn = sum(ins);
    const okDebits = s.debits === undefined || near(s.debits, sumOut);
    const creditOk = s.credits === undefined || near(s.credits, sumIn) || (s.creditsMayIncludeOpening === true && s.opening !== undefined && near(s.credits, sumIn + s.opening));
    const bits: string[] = [];
    if (s.debits !== undefined) bits.push(okDebits ? `debits ${inr(s.debits)} tie` : `debits: the bank says ${inr(s.debits)}, we read ${inr(sumOut)} (${inr(Math.abs(s.debits - sumOut))} ${s.debits > sumOut ? "short" : "over"})`);
    if (s.credits !== undefined) bits.push(creditOk ? `credits ${inr(s.credits)} tie` : `credits: the bank says ${inr(s.credits)}, we read ${inr(sumIn)} (${inr(Math.abs(s.credits - sumIn))} ${s.credits > sumIn ? "short" : "over"})`);
    checks.push({ ok: okDebits && creditOk, label: "The bank's own totals", detail: `${bits.join("; ")}.${s.creditsMayIncludeOpening && creditOk && s.credits !== undefined && !near(s.credits, sumIn) ? " (This bank counts the opening balance in its credit total.)" : ""}` });
  }

  if (s.source === "summary_row" && s.opening !== undefined && s.closing !== undefined && read.opening !== null && read.closing !== null) {
    const ok = near(s.opening, read.opening) && near(s.closing, read.closing);
    checks.push({ ok, label: "The bank's own balances", detail: ok ? `Opening ${inr(s.opening)} and closing ${inr(s.closing)} tie.` : `The bank prints opening ${inr(s.opening)} and closing ${inr(s.closing)}; the lines give ${inr(read.opening)} and ${inr(read.closing)}.` });
  }

  if (s.serialMax !== undefined) {
    const missing = s.serialMissing ?? [];
    const ok = read.lines.length === s.serialMax && missing.length === 0;
    checks.push({
      ok,
      label: "The bank's line numbers",
      detail: ok
        ? `The bank numbers its lines 1 to ${n0(s.serialMax)}. We read ${n0(read.lines.length)}.`
        : `The bank numbers its lines 1 to ${n0(s.serialMax)}; we read ${n0(read.lines.length)}.${missing.length ? ` Numbers not in the file: ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? "…" : ""}.` : ""}`,
    });
  }

  if (s.pagesPrinted !== undefined && s.pagesInFile !== undefined) {
    const ok = s.pagesPrinted === s.pagesInFile;
    checks.push({ ok, label: "Pages", detail: ok ? `The statement says ${s.pagesPrinted} pages and the file has ${s.pagesInFile}.` : `The statement says ${s.pagesPrinted} pages but the file has ${s.pagesInFile}: a page may be missing.` });
  }

  if (!checks.length) return { checks, tied: null };
  return { checks, tied: checks.every((c) => c.ok === true) ? true : checks.some((c) => c.ok === false) ? false : null };
}
