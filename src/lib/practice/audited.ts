/**
 * Last year's audited financials, read from the signed Balance Sheet and Profit and Loss PDFs, and proved before anything is compared:
 *
 *   1. the Balance Sheet's liabilities add up to its printed total, and so do its assets, and the two totals are equal;
 *   2. the Profit and Loss adds up (income less expenses is the profit before tax, less tax is the profit after tax);
 *   3. reserves at the end of the year equal reserves at the start plus the year's profit, or the difference is stated.
 *
 * Only then are the closing balances set against the opening balances in Tally, head by head, with the grouping rules stated. Figures
 * in the statements are in the unit the page declares ("Amount in '000"), so they are scaled, never assumed. The text of the PDF is read by
 * code; nothing here is guessed, and a line that cannot be read is listed.
 */
import type { MasterLedger } from "./extract/tallyMasters";

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface StatementLine {
  label: string;
  /** The statement prints one figure on this line, so which year it belongs to is not in the text. Settled by the totals (see below). */
  oneFigure?: boolean;
  side?: "liab" | "asset";
  /** Closing figure in rupees (already scaled). Null when the statement prints nothing in that column. */
  current: number | null;
  prior: number | null;
  key: string | null;
}

export interface Statement {
  kind: "balance_sheet" | "profit_and_loss";
  unit: number;
  /** "2025-03-31" for a balance sheet; the year end for a P&L. */
  asAt: string | null;
  lines: StatementLine[];
  /** The printed totals, in rupees. */
  totals: Record<string, number>;
}

const FIG = String.raw`(-?\(?[\d,]+\.\d{1,2}\)?|-)`;
const TWO = new RegExp(String.raw`^(.*?)\s+(?:(\d{1,2})\s+)?${FIG}\s+${FIG}\s*$`);
const ONE = new RegExp(String.raw`^(.*?)\s+(?:(\d{1,2})\s+)?${FIG}\s*$`);
const num = (s: string): number | null => {
  if (s === "-") return 0;
  const neg = /^-|^\(/.test(s);
  const v = Number(s.replace(/[(),-]/g, ""));
  return Number.isFinite(v) ? (neg ? -v : v) : null;
};

const KEYS: [string, RegExp][] = [
  ["share_capital", /share capital/i],
  ["reserves", /reserves and surplus|reserves & surplus/i],
  ["lt_borrowings", /long[- ]term borrowings/i],
  ["deferred_tax_liability", /deferred tax liabilit/i],
  ["other_lt_liabilities", /other long term liabilities/i],
  ["lt_provisions", /long term provision/i],
  ["st_borrowings", /short[- ]term borrowings/i],
  ["trade_payables", /other than micro enterprises|trade payables/i],
  ["other_current_liabilities", /other current liabilities/i],
  ["st_provisions", /short[- ]term provisions/i],
  ["ppe", /property, plant and equipment/i],
  ["nc_investments", /non-current investments/i],
  ["deferred_tax_asset", /deferred tax assets/i],
  ["lt_loans_advances", /long term loans and advances/i],
  ["other_nc_assets", /other non current assets/i],
  ["current_investments", /current investments/i],
  ["inventories", /inventories/i],
  ["trade_receivables", /trade receivables/i],
  ["cash", /cash and cash equivalents/i],
  ["st_loans_advances", /short[- ]term loans and advances/i],
  ["other_current_assets", /other current assets/i],
];

export function readStatement(text: string, kind: Statement["kind"]): Statement {
  const unit = /amount in\s*['’]?\s*000/i.test(text) ? 1000 : /amount in\s*(lakh|lac)/i.test(text) ? 100_000 : 1;
  const asAt = (() => {
    const m = /(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(20\d{2})/i.exec(text);
    if (!m) return null;
    const mo = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"].indexOf(m[2]!.toLowerCase()) + 1;
    return `${m[3]}-${String(mo).padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  })();
  const lines: StatementLine[] = [];
  const totals: Record<string, number> = {};
  const rows = text.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const scale = (n: number | null) => (n === null ? null : r2(n * unit));
  let side: "liab" | "asset" | null = null;
  for (const row of rows) {
    if (/^A\s+EQUITY AND LIABILITIES/i.test(row)) side = "liab";
    if (/^B\s+ASSETS/i.test(row)) side = "asset";
    const two = TWO.exec(row);
    const one = two ? null : ONE.exec(row);
    const m = two ?? one;
    if (!m) continue;
    const label = m[1]!.replace(/^\(?[a-zA-Z0-9]{1,3}\)\s*/, "").replace(/^[IVX]+\s+/, "").trim();
    const cur = num(m[3]!);
    const pri = two ? num(m[4]!) : null;
    if (cur === null) continue;
    if (/^total$/i.test(label) && kind === "balance_sheet") {
      totals[side === "asset" ? "assets" : "liabilities"] = scale(cur)!;
      continue;
    }
    if (kind === "profit_and_loss") {
      const l = label.toLowerCase();
      const set = (k: string) => { totals[k] = scale(cur)!; };
      if (/total income/.test(l)) set("income");
      else if (/^total expenses/.test(l)) set("expenses");
      else if (/^profit.*before tax/.test(l) && /before tax/.test(l) && !/extraordinary|exceptional/.test(l)) set("pbt");
      else if (/current tax/.test(l)) set("current_tax");
      else if (/deferred tax/.test(l)) set("deferred_tax");
      else if (/^profit.*for the period$/.test(l) || /^profit \/ \(loss\) for the period$/.test(l)) set("pat");
      continue;
    }
    const key = KEYS.find(([, re]) => re.test(label))?.[0] ?? null;
    if (!key) continue;
    // Trade payables and trade receivables are both called "trade ..."; the side of the sheet decides which is which.
    lines.push({ label, current: scale(cur), prior: scale(pri), key: key === "trade_payables" && side === "asset" ? null : key, oneFigure: !two, side: side ?? undefined });
  }
  const kept = lines.filter((l) => l.key);
  if (kind === "balance_sheet") settleSingleFigures(kept, totals, unit);
  return { kind, unit, asAt, lines: kept, totals };
}

/**
 * A line with one figure ("Deferred tax assets  1.74", or a payables line with no prior-year figure) does not say which year it is. The
 * current year's lines must add to the current year's printed total, so the figures that make it tie are the current year's; any
 * other single figure is the prior year's. When no choice ties, the lines are left out of the current year and the check says so.
 */
function settleSingleFigures(lines: StatementLine[], totals: Record<string, number>, unit: number) {
  const tol = Math.max(unit * 0.05, 1);
  for (const side of ["liab", "asset"] as const) {
    const total = totals[side === "asset" ? "assets" : "liabilities"];
    const mine = lines.filter((l) => l.side === side);
    const one = mine.filter((l) => l.oneFigure && l.current !== null);
    const base = mine.filter((l) => !l.oneFigure).reduce((n, l) => n + (l.current ?? 0), 0);
    if (!one.length || total === undefined) continue;
    let chosen: number[] | null = null;
    // At most a handful of single-figure lines on a statement: try every choice.
    for (let mask = 0; mask < 1 << Math.min(one.length, 12) && !chosen; mask++) {
      let sum = base;
      one.forEach((l, i) => { if (mask & (1 << i)) sum += l.current ?? 0; });
      if (Math.abs(sum - total) <= tol) chosen = one.map((_, i) => (mask & (1 << i) ? 1 : 0));
    }
    one.forEach((l, i) => {
      if (chosen && chosen[i]) { l.prior = null; return; }
      // Not part of the current year's total: its figure is the prior year's (or unresolved if no choice tied).
      l.prior = l.current;
      l.current = null;
    });
  }
}

export type AuditCheck = { label: string; ok: boolean; detail: string };

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const LIAB = ["share_capital", "reserves", "lt_borrowings", "deferred_tax_liability", "other_lt_liabilities", "lt_provisions", "st_borrowings", "trade_payables", "other_current_liabilities", "st_provisions"];
const ASSET = ["ppe", "nc_investments", "deferred_tax_asset", "lt_loans_advances", "other_nc_assets", "current_investments", "inventories", "trade_receivables", "cash", "st_loans_advances", "other_current_assets"];

const val = (s: Statement, k: string, col: "current" | "prior" = "current") => s.lines.find((l) => l.key === k)?.[col] ?? 0;

export function proveStatements(bs: Statement, pl: Statement | null): AuditCheck[] {
  const tol = Math.max(bs.unit * 0.05, 1); // two decimals in the unit used
  const out: AuditCheck[] = [];
  const liab = r2(LIAB.reduce((n, k) => n + val(bs, k), 0));
  const asset = r2(ASSET.reduce((n, k) => n + val(bs, k), 0));
  const tl = bs.totals["liabilities"], ta = bs.totals["assets"];
  out.push({ label: "Liabilities add up to the printed total", ok: tl !== undefined && near(liab, tl, tol), detail: tl === undefined ? "No total found on the liabilities side." : `Lines add to ${inr(liab)}, the statement prints ${inr(tl)}.` });
  out.push({ label: "Assets add up to the printed total", ok: ta !== undefined && near(asset, ta, tol), detail: ta === undefined ? "No total found on the assets side." : `Lines add to ${inr(asset)}, the statement prints ${inr(ta)}.` });
  if (tl !== undefined && ta !== undefined) out.push({ label: "Liabilities equal assets", ok: near(tl, ta, tol), detail: `${inr(tl)} against ${inr(ta)}.` });
  if (pl) {
    const t = pl.totals;
    if (t["income"] !== undefined && t["expenses"] !== undefined && t["pbt"] !== undefined)
      out.push({ label: "Profit before tax = income less expenses", ok: near(t["income"] - t["expenses"], t["pbt"], tol), detail: `${inr(t["income"])} less ${inr(t["expenses"])} is ${inr(r2(t["income"] - t["expenses"]))}; printed ${inr(t["pbt"])}.` });
    if (t["pbt"] !== undefined && t["pat"] !== undefined)
      out.push({ label: "Profit after tax = profit before tax less tax", ok: near(t["pbt"] - (t["current_tax"] ?? 0) - (t["deferred_tax"] ?? 0), t["pat"], tol), detail: `${inr(t["pbt"])} less tax ${inr(r2((t["current_tax"] ?? 0) + (t["deferred_tax"] ?? 0)))} is ${inr(r2(t["pbt"] - (t["current_tax"] ?? 0) - (t["deferred_tax"] ?? 0)))}; printed ${inr(t["pat"])}.` });
    const open = val(bs, "reserves", "prior"), close = val(bs, "reserves");
    if (t["pat"] !== undefined && open)
      out.push({ label: "Reserves roll forward by the year's profit", ok: near(open + t["pat"], close, tol), detail: `${inr(open)} + profit ${inr(t["pat"])} = ${inr(r2(open + t["pat"]))}; closing reserves ${inr(close)}${near(open + t["pat"], close, tol) ? "" : ". The difference is a movement the Balance Sheet does not show (dividend, bonus, transfer), to be explained."}` });
  }
  return out;
}

/* ── against Tally ──────────────────────────────────────── */

export type Bucket = "capital" | "borrowings" | "payables" | "other_liabilities" | "fixed_assets" | "investments" | "inventories" | "receivables" | "cash_bank" | "loans_advances_other";

export const BUCKET_LABEL: Record<Bucket, string> = {
  capital: "Share capital and reserves",
  borrowings: "Borrowings",
  payables: "Trade payables (sundry creditors)",
  other_liabilities: "Other liabilities, provisions and deferred tax",
  fixed_assets: "Property, plant and equipment",
  investments: "Investments",
  inventories: "Inventories",
  receivables: "Trade receivables (sundry debtors)",
  cash_bank: "Cash and bank",
  loans_advances_other: "Loans, advances, deposits and other assets",
};

const GROUP: [Bucket, RegExp][] = [
  ["capital", /^(capital account|reserves? (&|and) surplus|share capital)$/i],
  ["borrowings", /^(loans? \(liability\)|secured loans?|unsecured loans?|bank od a\/c|bank occ a\/c|bank overdraft)$/i],
  ["payables", /^sundry creditors$/i],
  ["other_liabilities", /^(current liabilities|duties (&|and) taxes|provisions|deferred tax liabilit\w*|branch \/ divisions|suspense a\/c)$/i],
  ["fixed_assets", /^fixed assets$/i],
  ["investments", /^investments$/i],
  ["inventories", /^stock-in-hand$/i],
  ["receivables", /^sundry debtors$/i],
  ["cash_bank", /^(cash-in-hand|bank accounts)$/i],
  ["loans_advances_other", /^(loans (&|and) advances \(asset\)|deposits \(asset\)|current assets|misc\. expenses \(asset\))$/i],
];

export interface OpeningRow { bucket: Bucket; label: string; audited: number; tally: number; diff: number; status: "agree" | "differs" }
export interface OpeningCompare {
  rows: OpeningRow[];
  /** Tally ledgers whose group is not one of the known primary groups (a custom sub-group): shown, never forced into a head. */
  unmapped: { group: string; amount: number; ledgers: number }[];
  /** Profit and loss account balance in Tally (income and expense groups) is not an opening balance of the new year; listed so it is not mistaken for a gap. */
  notes: string[];
}

/** Opening balances in Tally against last year's audited closing, by head. Tally writes a debit balance as a negative number. */
export function compareOpening(bs: Statement, ledgers: MasterLedger[], tolIn?: number): OpeningCompare {
  // Half the reporting unit: figures printed in thousands are good to ±₹500, in lakhs to ±₹50,000.
  const tol = tolIn ?? Math.max(bs.unit / 2, 1);
  const audited: Record<Bucket, number> = {
    capital: val(bs, "share_capital") + val(bs, "reserves"),
    borrowings: val(bs, "lt_borrowings") + val(bs, "st_borrowings"),
    payables: val(bs, "trade_payables"),
    other_liabilities: val(bs, "deferred_tax_liability") + val(bs, "other_lt_liabilities") + val(bs, "lt_provisions") + val(bs, "other_current_liabilities") + val(bs, "st_provisions"),
    fixed_assets: val(bs, "ppe"),
    investments: val(bs, "nc_investments") + val(bs, "current_investments"),
    inventories: val(bs, "inventories"),
    receivables: val(bs, "trade_receivables"),
    cash_bank: val(bs, "cash"),
    loans_advances_other: val(bs, "st_loans_advances") + val(bs, "lt_loans_advances") + val(bs, "other_current_assets") + val(bs, "other_nc_assets") + val(bs, "deferred_tax_asset"),
  };
  const tally: Record<Bucket, number> = Object.fromEntries(Object.keys(audited).map((k) => [k, 0])) as Record<Bucket, number>;
  const unmapped = new Map<string, { amount: number; ledgers: number }>();
  const assetBuckets: Bucket[] = ["fixed_assets", "investments", "inventories", "receivables", "cash_bank", "loans_advances_other"];
  for (const l of ledgers) {
    if (!l.opening) continue;
    const b = GROUP.find(([, re]) => re.test(l.parent.trim()))?.[0];
    if (!b) { const u = unmapped.get(l.parent) ?? { amount: 0, ledgers: 0 }; u.amount += l.opening; u.ledgers++; unmapped.set(l.parent, u); continue; }
    // Liabilities are credit balances (positive in Tally), assets debit balances (negative): both come out as positive amounts.
    tally[b] += assetBuckets.includes(b) ? -l.opening : l.opening;
  }
  const rows = (Object.keys(audited) as Bucket[]).map((b) => {
    const a = r2(audited[b]), t = r2(tally[b]), d = r2(t - a);
    return { bucket: b, label: BUCKET_LABEL[b], audited: a, tally: t, diff: d, status: Math.abs(d) <= tol ? "agree" as const : "differs" as const };
  });
  return {
    rows,
    unmapped: [...unmapped].map(([group, v]) => ({ group, amount: r2(v.amount), ledgers: v.ledgers })),
    notes: [
      "Heads are matched by Tally's own primary groups. Borrowings are long and short term together, because Tally does not split them. A custom sub-group is listed separately, not forced into a head.",
      `Differences within ${inr(tol)} (half the unit the statements are printed in) are rounding.`,
    ],
  };
}
