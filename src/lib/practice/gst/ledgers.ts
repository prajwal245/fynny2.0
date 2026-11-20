/**
 * The GST electronic ledgers, proved from the portal reports a CA already downloads:
 *
 *  - "GSTR-3B vs GSTR-2B ITC" report (credit claimed against credit the portal showed, month by month);
 *  - "ITC claimed and utilised" (table 4(C) against table 6.1);
 *  - "Challan deposit summary" and "Return filing status";
 *  - "Credit and liability statement".
 *
 * Two loops come out of them, in the order the CA works:
 *   credit ledger:  opening credit + claimed (4C) − utilised (6.1)  =  closing credit, against the input-credit ledgers in Tally;
 *   cash ledger:    challans paid  =  cash paid in 3B table 6.1 (plus RCM, always cash), against the tax payments in Tally.
 *
 * Pure code. The report's own totals are re-added before anything is built on them; a figure that cannot be reproduced from the
 * files on hand (the 2A/2B side of the ITC report) is shown as "per the report", never as ours.
 */
import { money } from "./invoices";
import type { TaxSplit } from "./returns";
import { readGstr3bPayment } from "./reports";

const r2 = (n: number) => Math.round(n * 100) / 100;
const cell = (v: unknown) => String(v ?? "").trim();
const norm = (v: unknown) => cell(v).toLowerCase().replace(/\s+/g, " ");
const num = (v: unknown) => money(cell(v).replace(/^-\s*$/, "")) ?? 0;

export interface Heads { igst: number; cgst: number; sgst: number; cess: number }
const heads = (a = 0, b = 0, c = 0, d = 0): Heads => ({ igst: a, cgst: b, sgst: c, cess: d });
const addH = (a: Heads, b: Heads): Heads => ({ igst: r2(a.igst + b.igst), cgst: r2(a.cgst + b.cgst), sgst: r2(a.sgst + b.sgst), cess: r2(a.cess + b.cess) });
const subH = (a: Heads, b: Heads): Heads => ({ igst: r2(a.igst - b.igst), cgst: r2(a.cgst - b.cgst), sgst: r2(a.sgst - b.sgst), cess: r2(a.cess - b.cess) });
const totH = (h: Heads) => r2(h.igst + h.cgst + h.sgst + h.cess);
const fromSplit = (s: TaxSplit): Heads => heads(s.igst, s.cgst, s.sgst, s.cess);
const sameH = (a: Heads, b: Heads, tol: number) => (["igst", "cgst", "sgst", "cess"] as const).every((k) => Math.abs(a[k] - b[k]) <= tol);

const MONTHS = ["apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec", "jan", "feb", "mar"];

/** "2025 - 2026" in a report header → 2025. */
export function fyStartOf(rows: string[][]): number | null {
  for (const r of rows.slice(0, 8)) for (const c of r) { const m = /^(20\d{2})\s*-\s*(20\d{2})$/.exec(cell(c)); if (m) return Number(m[1]); }
  return null;
}
/** "April", "Aug", "Jan" → "2025-04" given the financial year start. */
export function fyMonthKey(label: string, fyStart: number): string | null {
  const i = MONTHS.indexOf(norm(label).slice(0, 3));
  if (i < 0) return null;
  const calMonth = ((i + 3) % 12) + 1;
  return `${calMonth >= 4 ? fyStart : fyStart + 1}-${String(calMonth).padStart(2, "0")}`;
}
const dmy = (raw: unknown): string | null => {
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(cell(raw));
  return m ? `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}` : null;
};

/* ── ITC: 3B vs 2B ─────────────────────────────────────── */

export interface ItcMonth { month: string; claimed: Heads; twoB: Heads; diff: Heads; claimedNet: Heads; diffNet: Heads }
export interface ItcReport { months: ItcMonth[]; total: ItcMonth | null; notes: string[] }

/** Columns: period, then five blocks of four heads (IGST, CGST, SGST, Cess): claimed, 2B, difference, claimed after reversal, difference after reversal. */
export function readItcReport(rows: string[][]): ItcReport {
  const fy = fyStartOf(rows);
  const out: ItcReport = { months: [], total: null, notes: [] };
  if (fy == null || !rows.some((r) => /gstr-3b vs\.? gstr-2b itc/i.test(cell(r[0])))) { out.notes.push("This is not a GSTR-3B vs GSTR-2B ITC report."); return out; }
  const block = (r: string[], k: number): Heads => heads(num(r[1 + 4 * k]), num(r[2 + 4 * k]), num(r[3 + 4 * k]), num(r[4 + 4 * k]));
  for (const r of rows) {
    const label = cell(r[0]);
    const isTotal = /^total$/i.test(label);
    const month = isTotal ? "total" : fyMonthKey(label, fy);
    if (!month) continue;
    const m: ItcMonth = { month, claimed: block(r, 0), twoB: block(r, 1), diff: block(r, 2), claimedNet: block(r, 3), diffNet: block(r, 4) };
    if (isTotal) out.total = m; else out.months.push(m);
  }
  if (!out.months.length) out.notes.push("No month rows found in the ITC report.");
  return out;
}

export interface LedgerCheck { id: string; label: string; ok: boolean; detail: string }

/** The report's own arithmetic: every month's difference is claimed − 2B, and the total row is the sum of the months. */
export function proveItcReport(rep: ItcReport): { checks: LedgerCheck[]; excess: Heads } {
  const checks: LedgerCheck[] = [];
  const sum = (pick: (m: ItcMonth) => Heads) => rep.months.reduce((a, m) => addH(a, pick(m)), heads());
  const badMonths = rep.months.filter((m) => !sameH(subH(m.claimed, m.twoB), m.diff, 0.02));
  checks.push({ id: "itc-diff", label: "Each month: ITC claimed in 3B − ITC in 2B = the difference shown", ok: badMonths.length === 0, detail: badMonths.length ? `Does not add up in ${badMonths.map((m) => m.month).join(", ")}.` : `${rep.months.length} months add up.` });
  if (rep.total) {
    const t = rep.total;
    const okClaim = sameH(sum((m) => m.claimed), t.claimed, 0.05), ok2b = sameH(sum((m) => m.twoB), t.twoB, 0.05), okDiff = sameH(sum((m) => m.diff), t.diff, 0.05);
    checks.push({ id: "itc-total", label: "Total row = sum of the months (claimed, 2B and difference)", ok: okClaim && ok2b && okDiff, detail: okClaim && ok2b && okDiff ? "Total row reproduced." : "The total row differs from the sum of the months." });
  }
  const excess = rep.total?.diff ?? sum((m) => m.diff);
  return { checks, excess };
}

/* ── ITC claimed and utilised ──────────────────────────── */

export interface UtilMonth { month: string; claimed: Heads; utilised: Heads }
export interface ItcUtil { months: UtilMonth[]; claimed: Heads; utilised: Heads; notes: string[] }

export function readItcUtil(rows: string[][]): ItcUtil {
  const fy = fyStartOf(rows);
  const out: ItcUtil = { months: [], claimed: heads(), utilised: heads(), notes: [] };
  if (fy == null || !rows.some((r) => /input tax credit claimed & utili[sz]ed/i.test(cell(r[0])))) { out.notes.push("This is not an 'ITC claimed and utilised' report."); return out; }
  for (const r of rows) {
    const label = cell(r[0]);
    if (/^total$/i.test(label)) continue;
    const month = fyMonthKey(label, fy);
    if (!month) continue;
    out.months.push({ month, claimed: heads(num(r[1]), num(r[2]), num(r[3]), num(r[4])), utilised: heads(num(r[6]), num(r[7]), num(r[8]), num(r[9])) });
  }
  for (const m of out.months) { out.claimed = addH(out.claimed, m.claimed); out.utilised = addH(out.utilised, m.utilised); }
  return out;
}

/* ── Challans and filing status ────────────────────────── */

export type ChallanStatus = "PAID" | "FAILED" | "EXPIRED" | "AWAITING" | "OTHER";
export interface Challan { month: string; cpin: string; created: string; amount: Heads; total: number; mode: string; reason: string; deposited: string | null; status: ChallanStatus; rawStatus: string }

export function readChallans(rows: string[][]): { challans: Challan[]; notes: string[] } {
  const fy = fyStartOf(rows);
  const notes: string[] = [];
  const hi = rows.findIndex((r) => norm(r[0]) === "month" && norm(r[1]) === "cpin");
  if (hi < 0 || fy == null) return { challans: [], notes: ["This is not a challan deposit summary."] };
  const challans: Challan[] = [];
  for (const r of rows.slice(hi + 1)) {
    const month = fyMonthKey(cell(r[0]), fy);
    if (!month || cell(r[1]) === "-" || !cell(r[1])) continue; // a month with no challan prints a dash
    const raw = cell(r[13]);
    const status: ChallanStatus = /^paid$/i.test(raw) ? "PAID" : /^failed$/i.test(raw) ? "FAILED" : /^expired$/i.test(raw) ? "EXPIRED" : /awaiting/i.test(raw) ? "AWAITING" : "OTHER";
    const amount = heads(num(r[4]), num(r[5]), num(r[6]), num(r[7]));
    const total = num(r[8]);
    if (Math.abs(totH(amount) - total) > 0.5) notes.push(`Challan ${cell(r[1])}: the heads add to ${totH(amount)} but the total says ${total}.`);
    challans.push({ month, cpin: cell(r[1]), created: dmy(r[2]) ?? cell(r[2]), amount, total, mode: cell(r[9]), reason: cell(r[11]), deposited: dmy(r[12]), status, rawStatus: raw });
  }
  return { challans, notes };
}

export interface Filing { month: string; type: string; arn: string; status: string; date: string | null }
export function readFilingStatus(rows: string[][]): Filing[] {
  const fy = fyStartOf(rows);
  const hi = rows.findIndex((r) => norm(r[0]) === "month" && norm(r[1]) === "arn");
  if (hi < 0 || fy == null) return [];
  const out: Filing[] = [];
  for (const r of rows.slice(hi + 1)) {
    const month = fyMonthKey(cell(r[0]), fy);
    if (!month) continue;
    out.push({ month, type: cell(r[2]).toUpperCase().replace(/\s+/g, ""), arn: cell(r[1]), status: cell(r[3]), date: dmy(r[4]) });
  }
  return out;
}

/** A challan that did not pay, and a return that is not filed: what the CA must look at first. */
export function challanFlags(challans: Challan[], filings: Filing[]): string[] {
  const out: string[] = [];
  const bad = challans.filter((c) => c.status !== "PAID");
  for (const status of ["FAILED", "EXPIRED", "AWAITING", "OTHER"] as const) {
    const list = bad.filter((c) => c.status === status);
    if (!list.length) continue;
    const label = status === "AWAITING" ? "waiting for bank confirmation" : status === "OTHER" ? "in an unrecognised state" : status.toLowerCase();
    out.push(`${list.length} challan${list.length > 1 ? "s" : ""} ${label} (₹${r2(list.reduce((a, c) => a + c.total, 0)).toLocaleString("en-IN")}): ${list.map((c) => `${c.cpin} on ${c.created}`).join("; ")}. Only a PAID challan reaches the cash ledger.`);
  }
  for (const f of filings) if (!/^filed$/i.test(f.status)) out.push(`${f.type} for ${f.month} is "${f.status}", not filed.`);
  return out;
}

/** Returns with no row in the filing status report, one line per return type with the months as a range ("2025-10 to 2026-03"), not one line per month. */
export function missingReturns(filings: Filing[], months: string[]): string[] {
  const out: string[] = [];
  const nextOf = (m: string) => { const [y, mo] = m.split("-").map(Number); return mo === 12 ? `${y! + 1}-01` : `${y}-${String(mo! + 1).padStart(2, "0")}`; };
  for (const t of ["GSTR1", "GSTR3B"]) {
    const gone = months.filter((m) => !filings.some((x) => x.month === m && x.type === t)).sort();
    const runs: string[][] = [];
    for (const m of gone) { const last = runs.at(-1); if (last && nextOf(last.at(-1)!) === m) last.push(m); else runs.push([m]); }
    const label = t === "GSTR1" ? "GSTR-1" : "GSTR-3B";
    for (const r of runs) out.push(`${label} for ${r.length > 1 ? `${r[0]} to ${r.at(-1)}` : r[0]} ${r.length > 1 ? "are" : "is"} not in the filing status report.`);
  }
  return out;
}

/* ── Credit and liability statement ────────────────────── */

export interface CredLiabMonth { month: string; liabilityGstr1: number; liabilityGstr3b: number; itcClaimed: number; itc2a: number }
export function readCreditLiability(rows: string[][]): CredLiabMonth[] {
  const fy = fyStartOf(rows);
  if (fy == null || !rows.some((r) => /credit & liability statement/i.test(cell(r[0])))) return [];
  const out: CredLiabMonth[] = [];
  for (const r of rows) {
    const month = fyMonthKey(cell(r[0]), fy);
    if (!month) continue;
    out.push({ month, liabilityGstr1: num(r[1]), liabilityGstr3b: num(r[2]), itcClaimed: num(r[4]), itc2a: num(r[5]) });
  }
  return out;
}

/* ── Credit ledger loop ────────────────────────────────── */

export interface CreditLoop {
  opening: Heads; claimed: Heads; utilised: Heads; derivedClosing: Heads;
  tallyClosing: Heads; difference: Heads; ok: boolean;
  /** The ledger heads the Tally side came from, so the CA can see exactly what was added. */
  ledgers: { name: string; head: keyof Heads; closing: number }[];
  notes: string[];
}

/**
 * Credit ledger loop. Opening credit is the Tally opening of the input-credit ledgers (the portal's credit ledger opening was not on file —
 * the loop says so). Claimed and utilised are the report's tables 4(C) and 6.1. The derived closing is compared with the same Tally ledgers' closing.
 */
export function creditLedgerLoop(util: ItcUtil, tally: { name: string; head: keyof Heads; opening: number; closing: number }[], tol = 1): CreditLoop {
  const sumBy = (pick: (l: (typeof tally)[number]) => number): Heads => {
    const h = heads();
    for (const l of tally) h[l.head] = r2(h[l.head] + pick(l));
    return h;
  };
  const opening = sumBy((l) => l.opening), tallyClosing = sumBy((l) => l.closing);
  const derivedClosing = subH(addH(opening, util.claimed), util.utilised);
  const difference = subH(tallyClosing, derivedClosing);
  const notes = [
    "Opening credit is taken from the Tally input-credit ledgers because the portal's opening credit ledger balance is not on file. If Tally's opening differs from the portal, that shows up here as a difference of the same size.",
  ];
  const neg = (["igst", "cgst", "sgst", "cess"] as const).filter((k) => derivedClosing[k] < -tol);
  if (neg.length) notes.push(`${neg.map((k) => k.toUpperCase()).join(", ")} credit comes out negative (${neg.map((k) => derivedClosing[k].toLocaleString("en-IN")).join(", ")}): more was set off than was ever available, so the opening balance or a claim is wrong.`);
  return { opening, claimed: util.claimed, utilised: util.utilised, derivedClosing, tallyClosing, difference, ok: sameH(tallyClosing, derivedClosing, tol), ledgers: tally.map((l) => ({ name: l.name, head: l.head, closing: l.closing })), notes };
}

/** Which Tally ledgers hold input credit, by head: "Input CGST", "INPUT IGST @ 18% C F", "Input Sgst CF 26-27", "RCM CGST INPUT". Output and payable ledgers are never taken. */
export function inputCreditLedgers<T extends { name: string }>(ledgers: T[]): (T & { head: keyof Heads })[] {
  const out: (T & { head: keyof Heads })[] = [];
  for (const l of ledgers) {
    const n = norm(l.name);
    if (/output|payable|bank charges|late fee|tds|tcs|purchase|sales|service fee/.test(n)) continue;
    if (!/(input|itc|rcm .* input|cf\b|carry forward)/.test(n)) continue;
    const head = /igst|i\.gst/.test(n) ? "igst" : /cgst/.test(n) ? "cgst" : /sgst|utgst/.test(n) ? "sgst" : /cess/.test(n) ? "cess" : null;
    if (head) out.push({ ...l, head });
  }
  return out;
}

/* ── Cash ledger loop ──────────────────────────────────── */

export interface CashStep { month: string; filedOn: string; cashUsed: number; rcmUsed: number; deposited: number; balanceAfter: number }
export interface CashLoop {
  steps: CashStep[]; deposited: number; used: number; derivedBalance: number;
  /** The last day the challan report covers; a return filed after it cannot be tested. */
  coveredUntil: string | null; untested: string[];
  lowestBalance: number; ok: boolean; paidChallans: Challan[]; unpaidTotal: number; notes: string[];
}

/**
 * Cash ledger loop. A challan is a DEPOSIT into the cash ledger; the ledger is drawn down when a 3B is filed (table 6.1 cash, RCM always cash).
 * So the proof is a running balance: deposits that are PAID, less the cash each return used, in date order. The portal's opening cash balance is not
 * on file, so it starts at zero; a balance that goes negative means a challan is missing from the report or there was an opening balance.
 * Returns filed after the last challan in the report are listed as untested, never counted as zero deposit.
 */
export function cashLedgerLoop(challans: Challan[], filings: Filing[], payments: { month: string; paidCash: TaxSplit; rcmPaidCash: TaxSplit }[], opening = 0): CashLoop {
  const paid = challans.filter((c) => c.status === "PAID");
  const f3 = filings.filter((f) => f.type === "GSTR3B" && f.date).sort((a, b) => a.date!.localeCompare(b.date!));
  const notes: string[] = [];
  const coveredUntil = challans.length ? challans.map((c) => c.created).sort().at(-1)! : null;
  // The report lists challans created up to its last row; a month with a dash has none. Anything filed after the last challan date is outside it.
  const steps: CashStep[] = [];
  const untested: string[] = [];
  let bal = opening, prev = "", lowest = opening;
  for (const f of f3) {
    const p = payments.find((x) => x.month === f.month);
    if (!p) continue;
    const dep = r2(paid.filter((c) => c.created > prev && c.created <= f.date!).reduce((a, c) => a + c.total, 0));
    prev = f.date!;
    const cash = totH(fromSplit(p.paidCash)), rcm = totH(fromSplit(p.rcmPaidCash));
    if (coveredUntil && f.date! > coveredUntil) { untested.push(f.month); continue; }
    bal = r2(bal + dep - cash - rcm);
    lowest = Math.min(lowest, bal);
    steps.push({ month: f.month, filedOn: f.date!, cashUsed: cash, rcmUsed: rcm, deposited: dep, balanceAfter: bal });
  }
  if (untested.length) notes.push(`The challan report's last entry is ${coveredUntil}, so the returns for ${untested.join(", ")} (filed later) are not tested. Ask for the full-year challan report.`);
  if (opening === 0) notes.push("The portal's opening cash ledger balance is not on file, so the running balance starts at zero.");
  notes.push("A deposit can also pay interest, late fee or a demand order, none of which is in table 6.1, and a deposit can sit unused for months, so the proof is the running balance, not a month-by-month match.");
  return {
    steps, deposited: r2(steps.reduce((a, s) => a + s.deposited, 0)), used: r2(steps.reduce((a, s) => a + s.cashUsed + s.rcmUsed, 0)), derivedBalance: bal,
    coveredUntil, untested, lowestBalance: lowest, ok: lowest >= -0.5 && untested.length === 0,
    paidChallans: paid, unpaidTotal: r2(challans.filter((c) => c.status !== "PAID").reduce((a, c) => a + c.total, 0)), notes,
  };
}

/* ── Challans against the books ────────────────────────── */

export interface BooksVoucher { date: string; type: string; no: string; legs: { ledger: string; debit: number; credit: number }[] }
export interface ChallanBooksMatch {
  ledgers: string[];
  matched: { challan: Challan; voucher: { date: string; no: string; amount: number } }[];
  /** PAID on the portal but no payment in the books: the cash ledger has money the books do not show leaving the bank. */
  paidNotInBooks: Challan[];
  /** Paid in the books (up to the last challan in the report) but no PAID challan: recorded for a failed or expired challan, or not paid at all. */
  booksNotPaid: { date: string; no: string; amount: number }[];
  /** Payments in the books dated after the last challan in the report; not testable, only counted. */
  afterReport: number;
}

/** The tax-payment ledger is the one that takes the debit in Payment vouchers whose amounts equal challan totals; found from the data, not typed in. */
export function guessTaxPaymentLedgers(vouchers: BooksVoucher[], challans: Challan[]): string[] {
  const totals = new Set(challans.filter((c) => c.status === "PAID").map((c) => Math.round(c.total)));
  const hits = new Map<string, number>();
  for (const v of vouchers) {
    if (!/payment/i.test(v.type)) continue;
    for (const l of v.legs) if (l.debit > 0 && totals.has(Math.round(l.debit))) hits.set(l.ledger, (hits.get(l.ledger) ?? 0) + 1);
  }
  const best = [...hits].sort((a, b) => b[1] - a[1]);
  return best.length && best[0]![1] >= 2 ? [best[0]![0]] : [];
}

const dayDiff = (a: string, b: string) => Math.abs((Date.parse(a) - Date.parse(b)) / 86_400_000);

export function matchChallansToBooks(challans: Challan[], vouchers: BooksVoucher[], ledgers = guessTaxPaymentLedgers(vouchers, challans), windowDays = 3): ChallanBooksMatch {
  const set = new Set(ledgers);
  const books = vouchers
    .filter((v) => /payment/i.test(v.type))
    .flatMap((v) => v.legs.filter((l) => set.has(l.ledger) && l.debit > 0).map((l) => ({ date: v.date, no: v.no, amount: l.debit, used: false })))
    .sort((a, b) => a.date.localeCompare(b.date));
  const paid = challans.filter((c) => c.status === "PAID").sort((a, b) => (a.deposited ?? a.created).localeCompare(b.deposited ?? b.created));
  const matched: ChallanBooksMatch["matched"] = [], paidNotInBooks: Challan[] = [];
  for (const c of paid) {
    const when = c.deposited ?? c.created;
    const hit = books.find((b) => !b.used && Math.abs(b.amount - c.total) < 0.5 && dayDiff(b.date, when) <= windowDays);
    if (hit) { hit.used = true; matched.push({ challan: c, voucher: { date: hit.date, no: hit.no, amount: hit.amount } }); } else paidNotInBooks.push(c);
  }
  const until = challans.length ? challans.map((c) => c.created).sort().at(-1)! : null;
  const rest = books.filter((b) => !b.used);
  const inside = rest.filter((b) => until && b.date <= until);
  return { ledgers, matched, paidNotInBooks, booksNotPaid: inside.map(({ date, no, amount }) => ({ date, no, amount })), afterReport: rest.length - inside.length };
}

/* ── which report is this file ─────────────────────────── */

export type LedgerFileKind = "itc_report" | "itc_util" | "challans" | "filing_status" | "credit_liability" | "trial_balance" | "ledger_masters" | "day_book" | "gstr3b_annual";
/** Every sheet of a workbook, named by what it holds: a challan file carries two (challans and return filing status), a Tally TB export three. */
export function detectLedgerFile(sheets: { name: string; rows: string[][] }[]): { kind: LedgerFileKind; sheet: string }[] {
  const out: { kind: LedgerFileKind; sheet: string }[] = [];
  for (const sh of sheets) {
    const top = sh.rows.slice(0, 8).map((r) => r.map(cell).join(" ")).join(" ").toLowerCase();
    const has = (re: RegExp) => sh.rows.slice(0, 12).some((r) => r.some((c) => re.test(norm(c))));
    let kind: LedgerFileKind | null = null;
    if (/gstr-3b vs\.? gstr-2b itc/.test(top)) kind = "itc_report";
    else if (/input tax credit claimed & utili[sz]ed/.test(top)) kind = "itc_util";
    else if (/challan deposit summary/.test(top) || (has(/^cpin$/) && has(/^month$/))) kind = "challans";
    else if (/return filing status/.test(top) || (has(/^arn$/) && has(/^return type$/))) kind = "filing_status";
    else if (/credit & liability statement/.test(top)) kind = "credit_liability";
    else if (/gstr-3b annual report/.test(top)) kind = "gstr3b_annual";
    else if (has(/^ledger$/) && has(/^bill-?wise$/)) kind = "ledger_masters";
    else if (has(/^ledger$/) && sh.rows.slice(0, 12).some((r) => r.some((c) => /^opening .*dr$/.test(norm(c))))) kind = "trial_balance";
    else if (has(/^particulars$/) && has(/vch\s*type/)) kind = "day_book";
    if (kind) out.push({ kind, sheet: sh.name });
  }
  return out;
}

export { readGstr3bPayment };
