/**
 * Year-end review checks that need more than one file to answer. Every check says one of three things: "findings" (a list, each row
 * with the reason), "clear" (it ran on its data and found nothing), or "blocked" (a file it needs is missing, and which one). A check
 * that cannot run is never shown as passed. Read-only: nothing here changes the books. A finding is a reason to look; the CA decides.
 */
import type { Voucher } from "./dayBook";
import { suggestLedgerMap, type Family } from "./ledgerMap";
import type { TrialBalance } from "./trialBalance";

export type YearCheckStatus = "findings" | "clear" | "blocked";
export interface YearRow { ref: string; detail: string; amount?: number; date?: string }
export interface YearCheck {
  id: "sales_vs_gstr1" | "rcm" | "ais_vs_books" | "chart_of_accounts" | "opened_closed" | "unchanged_balances" | "closed_by_journal";
  label: string;
  status: YearCheckStatus;
  /** What is missing when blocked. */
  needs: string[];
  summary: string;
  rows: YearRow[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const inr = (n: number) => `₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const ym = (d: string) => d.slice(0, 7);
const TOL = 1;

const blocked = (id: YearCheck["id"], label: string, needs: string[]): YearCheck => ({ id, label, status: "blocked", needs, summary: `Not checked. Needs ${needs.join(" and ")}.`, rows: [] });
const done = (id: YearCheck["id"], label: string, rows: YearRow[], clear: string, found: string): YearCheck => ({ id, label, status: rows.length ? "findings" : "clear", needs: [], summary: rows.length ? found : clear, rows });

function familyOf(vouchers: Voucher[], extra: { name: string; group?: string | null }[] = []): Map<string, Family> {
  const names = new Map<string, string | null>();
  for (const e of extra) names.set(e.name, e.group ?? null);
  for (const v of vouchers) for (const l of v.legs) if (!names.has(l.ledger)) names.set(l.ledger, null);
  return new Map(suggestLedgerMap([...names].map(([name, group]) => ({ name, group }))).map((m) => [m.ledger, m.family]));
}

/* ── 1. Sales books against GSTR-1 ─────────────────────── */

export interface Gstr1Month { month: string; taxable: number; tax: number }

/** Sales in the books (credit less debit on sales ledgers) and output tax, month by month, against what GSTR-1 reported. */
export function salesVsGstr1(vouchers: Voucher[], gstr1: Gstr1Month[] | null): YearCheck {
  const label = "Sales books against GSTR-1";
  if (!vouchers.length) return blocked("sales_vs_gstr1", label, ["the Day Book"]);
  if (!gstr1?.length) return blocked("sales_vs_gstr1", label, ["the GSTR-1 report (Excel from the GST portal)"]);
  const fam = familyOf(vouchers);
  const books = new Map<string, { taxable: number; tax: number }>();
  for (const v of vouchers) {
    for (const l of v.legs) {
      const f = fam.get(l.ledger);
      if (f !== "sales" && f !== "output_tax") continue;
      const m = books.get(ym(v.date)) ?? { taxable: 0, tax: 0 };
      if (f === "sales") m.taxable += l.credit - l.debit; else m.tax += l.credit - l.debit;
      books.set(ym(v.date), m);
    }
  }
  const months = [...new Set([...books.keys(), ...gstr1.map((g) => g.month)])].sort();
  const rows: YearRow[] = [];
  for (const m of months) {
    const b = books.get(m) ?? { taxable: 0, tax: 0 };
    const g = gstr1.find((x) => x.month === m);
    if (!g) { if (b.taxable > TOL) rows.push({ ref: m, detail: `Books show sales of ${inr(b.taxable)} but this month is not in the GSTR-1 report.`, amount: r2(b.taxable) }); continue; }
    const dT = r2(b.taxable - g.taxable), dX = r2(b.tax - g.tax);
    if (Math.abs(dT) > TOL || Math.abs(dX) > TOL) {
      rows.push({ ref: m, detail: `Books: sales ${inr(b.taxable)}, output tax ${inr(b.tax)}. GSTR-1: ${inr(g.taxable)}, ${inr(g.tax)}. Difference: sales ${dT >= 0 ? "+" : "−"}${inr(dT)}, tax ${dX >= 0 ? "+" : "−"}${inr(dX)}.`, amount: dT });
    }
  }
  return done("sales_vs_gstr1", label, rows, `Sales and output tax agree with GSTR-1 for ${months.length} months.`, `${rows.length} of ${months.length} months differ. Timing (an invoice dated in one month, filed in the next) is the usual reason; the CA confirms.`);
}

/* ── 2. Reverse charge ─────────────────────────────────── */

/** Every voucher on the reverse-charge ledgers, whether the liability was paid, and whether credit was taken before payment. */
export function rcmReview(vouchers: Voucher[]): YearCheck {
  const label = "Reverse charge entries";
  if (!vouchers.length) return blocked("rcm", label, ["the Day Book"]);
  const fam = familyOf(vouchers);
  const rows: YearRow[] = [];
  let liability = 0, paid = 0, input = 0, entries = 0;
  const liabByMonth = new Map<string, { liab: number; paid: number }>();
  for (const v of vouchers) {
    const liab = v.legs.filter((l) => fam.get(l.ledger) === "rcm_liability");
    const inp = v.legs.filter((l) => fam.get(l.ledger) === "rcm_input");
    if (!liab.length && !inp.length) continue;
    entries++;
    const cr = r2(liab.reduce((n, l) => n + l.credit, 0)), dr = r2(liab.reduce((n, l) => n + l.debit, 0)), taken = r2(inp.reduce((n, l) => n + l.debit, 0));
    liability += cr; paid += dr; input += taken;
    const m = liabByMonth.get(ym(v.date)) ?? { liab: 0, paid: 0 };
    m.liab += cr; m.paid += dr; liabByMonth.set(ym(v.date), m);
    const ref = `${v.type} ${v.no}`;
    if (taken > TOL && cr < TOL && dr < TOL) rows.push({ ref, date: v.date, amount: taken, detail: `Credit of ${inr(taken)} taken on reverse charge with no liability booked in the same voucher. Credit is available only after the tax is paid in cash.` });
    else if (cr > TOL && taken > TOL && Math.abs(cr - taken) > TOL) rows.push({ ref, date: v.date, amount: r2(cr - taken), detail: `Liability ${inr(cr)} and credit ${inr(taken)} differ by ${inr(cr - taken)}.` });
    else if (cr > TOL && taken < TOL) rows.push({ ref, date: v.date, amount: cr, detail: `Reverse-charge liability of ${inr(cr)} booked with no matching credit entry. Right if the supply is not eligible for credit; otherwise the credit is unclaimed.` });
  }
  if (!entries) return { id: "rcm", label, status: "clear", needs: [], summary: "No entry on a reverse-charge ledger in the Day Book. If the client buys from unregistered suppliers or pays for legal, transport or security services, the CA should ask why.", rows: [] };
  for (const [m, t] of [...liabByMonth].sort()) if (t.liab - t.paid > TOL && m !== [...liabByMonth.keys()].sort().at(-1)) rows.push({ ref: m, date: `${m}-01`, amount: r2(t.liab - t.paid), detail: `Reverse-charge liability of ${inr(t.liab)} in ${m} with ${inr(t.paid)} paid in the month: ${inr(t.liab - t.paid)} still to be paid or carried to the next month.` });
  const d = done("rcm", label, rows, `${entries} reverse-charge vouchers: liability ${inr(liability)}, paid ${inr(paid)}, credit taken ${inr(input)}. Nothing out of line.`, `${entries} reverse-charge vouchers (liability ${inr(liability)}, paid ${inr(paid)}, credit taken ${inr(input)}). ${rows.length} to look at.`);
  return d;
}

/* ── 3. AIS against books ──────────────────────────────── */

export interface AisLine { category: string; source: string; amount: number }
export interface Ais { fy: string | null; lines: AisLine[]; notes: string[] }

/** Reads the text of an AIS download: each information line is a category, the reporting source and the amount. Tolerant of layout; a scanned PDF has no text and is reported as such. */
export function readAis(text: string): Ais {
  const out: Ais = { fy: /(?:Financial Year|F\.?Y\.?)\s*[:\-]?\s*(20\d{2}\s*-\s*\d{2})/i.exec(text)?.[1]?.replace(/\s/g, "") ?? null, lines: [], notes: [] };
  if (!text.trim()) { out.notes.push("This AIS is a scanned image with no text. Upload the AIS JSON or CSV from the income-tax portal, or let OCR read it."); return out; }
  let cat = "";
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim();
    if (!l) continue;
    const head = /^(TDS\/TCS Information|SFT Information|Taxes Paid|Demand and Refund|Other Information|GST (?:turnover|Information)|Information relating to GST)/i.exec(l);
    if (head) { cat = /gst/i.test(head[1]!) ? "GST turnover" : /tds|tcs/i.test(head[1]!) ? "TDS/TCS" : /sft/i.test(head[1]!) ? "SFT" : head[1]!; continue; }
    const m = /^(?:\d+\s+)?(.+?)\s{2,}(-?[\d,]+(?:\.\d+)?)\s*$/.exec(l);
    if (m && cat && !/^(total|sr\.?\s*no)/i.test(m[1]!)) out.lines.push({ category: cat, source: m[1]!.trim(), amount: Number(m[2]!.replace(/,/g, "")) });
  }
  if (!out.lines.length) out.notes.push("No information lines were found in this AIS text.");
  return out;
}

/** AIS turnover and TDS against the books, and every SFT or other item the books should explain. */
export function aisVsBooks(vouchers: Voucher[], ais: Ais | null, tdsInBooks: number | null): YearCheck {
  const label = "AIS against books";
  if (!ais) return blocked("ais_vs_books", label, ["the AIS (JSON, CSV or text PDF from the income-tax portal)"]);
  if (!ais.lines.length) return { id: "ais_vs_books", label, status: "blocked", needs: ["a readable AIS"], summary: ais.notes[0] ?? "The AIS could not be read.", rows: [] };
  if (!vouchers.length) return blocked("ais_vs_books", label, ["the Day Book"]);
  const fam = familyOf(vouchers);
  const sales = r2(vouchers.reduce((n, v) => n + v.legs.reduce((s, l) => s + (fam.get(l.ledger) === "sales" ? l.credit - l.debit : 0), 0), 0));
  const rows: YearRow[] = [];
  const aisTurnover = r2(ais.lines.filter((x) => x.category === "GST turnover").reduce((n, x) => n + x.amount, 0));
  if (aisTurnover > 0 && Math.abs(aisTurnover - sales) > Math.max(TOL, aisTurnover * 0.005)) rows.push({ ref: "Turnover", amount: r2(sales - aisTurnover), detail: `GST turnover in AIS ${inr(aisTurnover)}; sales in the books ${inr(sales)}; difference ${inr(sales - aisTurnover)}.` });
  const aisTds = r2(ais.lines.filter((x) => x.category === "TDS/TCS").reduce((n, x) => n + x.amount, 0));
  if (aisTds > 0 && tdsInBooks != null && Math.abs(aisTds - tdsInBooks) > TOL) rows.push({ ref: "TDS/TCS", amount: r2(tdsInBooks - aisTds), detail: `AIS shows TDS/TCS information of ${inr(aisTds)}; TDS receivable in the books ${inr(tdsInBooks)}. AIS lists the amount paid or credited, so a difference needs the 26AS to settle.` });
  for (const x of ais.lines.filter((x) => x.category === "SFT" || x.category === "Other Information")) rows.push({ ref: x.category, amount: x.amount, detail: `${x.source}: ${inr(x.amount)}. The books should show where this went; the CA asks the client if they do not.` });
  return done("ais_vs_books", label, rows, "AIS turnover and TDS agree with the books.", `${rows.length} item${rows.length === 1 ? "" : "s"} in the AIS to match to the books.`);
}

/* ── 4. Chart of accounts and entity type ──────────────── */

export type Entity = "company" | "llp" | "partnership" | "proprietorship" | "trust" | "unknown";
const ENTITY_WORDS: [Entity, RegExp][] = [
  ["company", /share capital|equity share|securities premium|director'?s? (loan|remuneration)|\bpvt\b|private limited/i],
  ["partnership", /partner'?s?'? (capital|current)|capital.*partner|partner'?s? (salary|interest)|interest to partner/i],
  ["proprietorship", /proprietor|owner'?s? capital|drawings?\b/i],
];

export function entityFromName(clientName: string | null | undefined, declared?: string | null): Entity {
  const t = `${declared ?? ""} ${clientName ?? ""}`.toLowerCase();
  if (/\bllp\b/.test(t)) return "llp";
  if (/pvt|private limited|\blimited\b|\bltd\b|company/.test(t)) return "company";
  if (/partnership|\bfirm\b|& co|and co\b/.test(t)) return "partnership";
  if (/propriet/.test(t)) return "proprietorship";
  if (/trust|society/.test(t)) return "trust";
  return "unknown";
}

/** Ledger names against the entity type: capital ledgers that do not belong to it, ones that should exist and do not, duplicates and unmapped ledgers. */
export function chartReview(ledgers: { name: string; group?: string | null }[], entity: Entity, complete = true): YearCheck {
  const label = "Chart of accounts and entity type";
  if (!ledgers.length) return blocked("chart_of_accounts", label, ["the Day Book or the Trial Balance"]);
  const rows: YearRow[] = [];
  const has = (re: RegExp) => ledgers.some((l) => re.test(l.name) || re.test(l.group ?? ""));
  if (entity === "unknown") rows.push({ ref: "Entity type", detail: "The client's constitution is not recorded, so the capital ledgers cannot be judged against it. Set it on the client." });
  else {
    const shown = ENTITY_WORDS.filter(([, re]) => has(re)).map(([e]) => e);
    const wrong = shown.filter((e) => e !== entity && !(entity === "llp" && e === "partnership"));
    for (const w of wrong) rows.push({ ref: "Capital ledgers", detail: `The chart has ${w} ledgers (${ledgers.filter((l) => ENTITY_WORDS.find(([e]) => e === w)![1].test(l.name)).slice(0, 3).map((l) => l.name).join(", ")}) but the client is a ${entity}.` });
    // A ledger list taken from the Day Book holds only accounts that moved this year, so "should exist" cannot be judged from it.
    if (complete && entity === "company" && !has(/share capital|equity share|capital account/i)) rows.push({ ref: "Share capital", detail: "A company, but no share capital ledger. Capital may sit in a loan or director ledger." });
    if (complete && entity === "company" && !has(/reserves?|surplus|profit (and|&) loss/i)) rows.push({ ref: "Reserves", detail: "A company, but no reserves and surplus or profit and loss ledger." });
    if (complete && (entity === "partnership" || entity === "llp") && !has(/partner/i)) rows.push({ ref: "Partners", detail: `A ${entity}, but no partner capital or current account ledger.` });
    if (complete && entity === "proprietorship" && !has(/capital|proprietor|owner/i)) rows.push({ ref: "Capital", detail: "A proprietorship, but no capital account." });
  }
  const dupes = new Map<string, string[]>();
  for (const l of ledgers) { const k = l.name.toLowerCase().replace(/[^a-z0-9]/g, ""); dupes.set(k, [...(dupes.get(k) ?? []), l.name]); }
  for (const [, names] of dupes) if (names.length > 1) rows.push({ ref: names[0]!, detail: `Same ledger spelled ${names.length} ways: ${names.join(" / ")}.` });
  if (has(/suspense|difference in opening/i)) rows.push({ ref: "Suspense", detail: `There is a suspense or opening-difference ledger (${ledgers.filter((l) => /suspense|difference in opening/i.test(l.name)).map((l) => l.name).join(", ")}). It should be nil at year end.` });
  return done("chart_of_accounts", label, rows, `The ${complete ? "chart" : "ledgers that moved this year"} fit a ${entity}.${complete ? "" : " Add the Trial Balance to judge the full chart."}`, `${rows.length} point${rows.length === 1 ? "" : "s"} in the chart of accounts to look at.`);
}

/* ── 5, 6, 7. Trial balance movement checks ────────────── */

interface Touch { first: string; last: string; lastType: string; lastNo: string; count: number }
function touches(vouchers: Voucher[]): Map<string, Touch> {
  const t = new Map<string, Touch>();
  for (const v of vouchers) for (const l of v.legs) {
    const c = t.get(l.ledger);
    if (!c) t.set(l.ledger, { first: v.date, last: v.date, lastType: v.type, lastNo: v.no, count: 1 });
    else { c.count++; if (v.date >= c.last) { c.last = v.date; c.lastType = v.type; c.lastNo = v.no; } if (v.date < c.first) c.first = v.date; }
  }
  return t;
}
const NEED_TB = ["the Trial Balance (Tally Excel)"];

/** Ledgers with no opening balance and a closing one (opened), or the reverse (closed) in the year. */
export function openedClosed(tb: TrialBalance | null, vouchers: Voucher[]): YearCheck {
  const label = "Accounts opened or closed in the year";
  if (!tb?.ledgers.length) return blocked("opened_closed", label, NEED_TB);
  const t = touches(vouchers);
  const rows: YearRow[] = [];
  for (const l of tb.ledgers) {
    if (Math.abs(l.opening) < TOL && Math.abs(l.closing) >= TOL) rows.push({ ref: l.name, amount: l.closing, date: t.get(l.name)?.first, detail: `Opened in the year: nil at the start, ${inr(l.closing)} ${l.closing > 0 ? "Dr" : "Cr"} at the end${t.get(l.name) ? `, first entry ${t.get(l.name)!.first}` : ""} (${l.group}).` });
    else if (Math.abs(l.opening) >= TOL && Math.abs(l.closing) < TOL) rows.push({ ref: l.name, amount: l.opening, date: t.get(l.name)?.last, detail: `Closed in the year: ${inr(l.opening)} ${l.opening > 0 ? "Dr" : "Cr"} at the start, nil at the end${t.get(l.name) ? `, last entry ${t.get(l.name)!.last}` : ""} (${l.group}).` });
  }
  return done("opened_closed", label, rows, "No ledger was opened or closed in the year.", `${rows.filter((r) => /^Opened/.test(r.detail)).length} opened and ${rows.filter((r) => /^Closed/.test(r.detail)).length} closed. Each is a reason to ask what it was for.`);
}

/** Balances that sit at the same figure from the first day to the last, with no entry in the year. */
export function unchangedBalances(tb: TrialBalance | null, vouchers: Voucher[]): YearCheck {
  const label = "Balances carried with no change";
  if (!tb?.ledgers.length) return blocked("unchanged_balances", label, NEED_TB);
  if (!vouchers.length) return blocked("unchanged_balances", label, ["the Day Book"]);
  const t = touches(vouchers);
  const rows = tb.ledgers
    .filter((l) => Math.abs(l.opening) >= TOL && Math.abs(l.closing - l.opening) < TOL && !t.has(l.name) && Math.abs(l.movementDr) < TOL && Math.abs(l.movementCr) < TOL)
    .sort((a, b) => Math.abs(b.closing) - Math.abs(a.closing))
    .map((l) => ({ ref: l.name, amount: l.closing, detail: `${inr(l.closing)} ${l.closing > 0 ? "Dr" : "Cr"} (${l.group}) unchanged all year, no entry. Old debtors, creditors, advances and deposits sit here; the CA asks if each is still due.` }));
  return done("unchanged_balances", label, rows, "Every balance moved in the year.", `${rows.length} balances did not move in the year, ${inr(rows.reduce((n, r) => n + Math.abs(r.amount ?? 0), 0))} in all.`);
}

/** Ledgers that stand at nil with a Journal as their last entry: closed by transfer, not by payment or receipt. */
export function closedByJournal(tb: TrialBalance | null, vouchers: Voucher[]): YearCheck {
  const label = "Accounts closed by journal";
  if (!tb?.ledgers.length) return blocked("closed_by_journal", label, NEED_TB);
  if (!vouchers.length) return blocked("closed_by_journal", label, ["the Day Book"]);
  const t = touches(vouchers);
  const rows: YearRow[] = [];
  for (const l of tb.ledgers) {
    const c = t.get(l.name);
    if (!c || Math.abs(l.closing) >= TOL || Math.abs(l.opening) + l.movementDr + l.movementCr < TOL) continue;
    if (!/journal/i.test(c.lastType)) continue;
    const size = Math.max(Math.abs(l.opening), l.movementDr, l.movementCr);
    rows.push({ ref: l.name, amount: r2(size), date: c.last, detail: `Nil at year end, last entry a Journal (${c.lastNo}) on ${c.last}. Largest figure on the account ${inr(size)} (${l.group}). Check where the balance was moved to and why.` });
  }
  rows.sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
  return done("closed_by_journal", label, rows, "No ledger was cleared by a journal.", `${rows.length} ledgers were cleared by a journal entry.`);
}

/* ── all of them ───────────────────────────────────────── */

export interface YearInputs {
  vouchers: Voucher[];
  tb: TrialBalance | null;
  ledgers: { name: string; group?: string | null }[];
  gstr1: Gstr1Month[] | null;
  ais: Ais | null;
  tdsInBooks: number | null;
  entity: Entity;
}

export function runYearChecks(i: YearInputs): YearCheck[] {
  return [
    salesVsGstr1(i.vouchers, i.gstr1),
    rcmReview(i.vouchers),
    aisVsBooks(i.vouchers, i.ais, i.tdsInBooks),
    chartReview(i.ledgers, i.entity, i.tb != null),
    openedClosed(i.tb, i.vouchers),
    unchangedBalances(i.tb, i.vouchers),
    closedByJournal(i.tb, i.vouchers),
  ];
}
