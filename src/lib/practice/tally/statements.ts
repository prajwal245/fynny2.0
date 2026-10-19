/**
 * Financial statements from a Tally ledger snapshot. Pure functions, no I/O.
 *
 * A snapshot is every ledger's balance as on a date, with the financial year
 * starting at `fyStart`. Balances are signed the accounting way here:
 * debit positive, credit negative. (The agent sends Tally's own sign, where a
 * debit is negative; `fromTallySign` flips it once, at the edge.)
 *
 * Tally has a fixed set of primary groups. Every user-made group sits under
 * one of them, so walking a ledger's parent chain to the first reserved name
 * says what kind of account it is and where it belongs in Schedule III.
 */
import { round2 } from "../core";

export interface GroupMaster {
  name: string;
  parent: string;
}
export interface LedgerBalance {
  name: string;
  /** Immediate parent group, as Tally reports it. */
  parent: string;
  /** Debit positive, credit negative. */
  closing: number;
  opening?: number;
}

export type Nature = "asset" | "liability" | "income" | "expense" | "other";

/** Tally's reserved primary groups. */
export const PRIMARY: Record<string, Nature> = {
  "capital account": "liability",
  "loans (liability)": "liability",
  "current liabilities": "liability",
  "fixed assets": "asset",
  investments: "asset",
  "current assets": "asset",
  "misc. expenses (asset)": "asset",
  "suspense a/c": "asset",
  "branch / divisions": "other",
  "sales accounts": "income",
  "direct incomes": "income",
  "income (direct)": "income",
  "indirect incomes": "income",
  "income (indirect)": "income",
  "purchase accounts": "expense",
  "direct expenses": "expense",
  "expenses (direct)": "expense",
  "indirect expenses": "expense",
  "expenses (indirect)": "expense",
};

const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Debit positive. Tally writes debits as negative numbers. */
export const fromTallySign = (tallyAmount: number) => round2(-tallyAmount);

export interface Resolved extends LedgerBalance {
  /** Groups from the primary group down to the ledger's parent. */
  path: string[];
  primary: string;
  nature: Nature;
}

/** Walk each ledger's group chain up to a reserved primary group. */
export function resolveLedgers(groups: GroupMaster[], ledgers: LedgerBalance[]): Resolved[] {
  const parentOf = new Map(groups.map((g) => [key(g.name), g.parent]));
  return ledgers.map((l) => {
    const path: string[] = [];
    let cur = l.parent;
    const seen = new Set<string>();
    let primary = "";
    while (cur && !seen.has(key(cur))) {
      seen.add(key(cur));
      path.unshift(cur);
      if (PRIMARY[key(cur)]) {
        primary = cur;
        break;
      }
      const next = parentOf.get(key(cur));
      if (!next || key(next) === key(cur)) break;
      cur = next;
    }
    return { ...l, path, primary, nature: primary ? PRIMARY[key(primary)] : "other" };
  });
}

/* ── Trial Balance ─────────────────────────────────────────── */

export interface TbRow {
  ledger: string;
  group: string;
  primary: string;
  debit: number;
  credit: number;
}
export interface TrialBalance {
  rows: TbRow[];
  totalDebit: number;
  totalCredit: number;
  /** Debits minus credits. Zero in a balanced book. */
  difference: number;
  balanced: boolean;
}

export function trialBalance(res: Resolved[]): TrialBalance {
  const rows = res
    .filter((r) => Math.abs(r.closing) >= 0.005)
    .map((r) => ({
      ledger: r.name,
      group: r.parent,
      primary: r.primary || "Unmapped",
      debit: r.closing > 0 ? round2(r.closing) : 0,
      credit: r.closing < 0 ? round2(-r.closing) : 0,
    }))
    .sort((a, b) => a.primary.localeCompare(b.primary) || a.group.localeCompare(b.group) || a.ledger.localeCompare(b.ledger));
  const totalDebit = round2(rows.reduce((s, r) => s + r.debit, 0));
  const totalCredit = round2(rows.reduce((s, r) => s + r.credit, 0));
  const difference = round2(totalDebit - totalCredit);
  return { rows, totalDebit, totalCredit, difference, balanced: Math.abs(difference) < 1 };
}

/* ── Schedule III heads ────────────────────────────────────── */

export interface Line {
  label: string;
  amount: number;
  /** Ledgers behind this line, largest first. */
  ledgers: { name: string; amount: number }[];
}
export interface Section {
  title: string;
  lines: Line[];
  total: number;
}

const has = (path: string[], ...names: string[]) => path.some((p) => names.includes(key(p)));

/** Where a balance-sheet ledger belongs, by its group chain. */
export function sheetHead(r: Resolved): { section: string; line: string } {
  const p = key(r.primary);
  const n = key(r.name);
  if (p === "capital account") return { section: "Shareholders' funds", line: has(r.path, "reserves & surplus") ? "Reserves and surplus" : "Capital" };
  if (p === "loans (liability)") return { section: "Non-current liabilities", line: "Long-term borrowings" };
  if (p === "current liabilities") {
    if (has(r.path, "sundry creditors")) return { section: "Current liabilities", line: "Trade payables" };
    if (has(r.path, "duties & taxes")) return { section: "Current liabilities", line: "Statutory dues (GST, TDS, other taxes)" };
    if (has(r.path, "provisions")) return { section: "Current liabilities", line: "Provisions" };
    return { section: "Current liabilities", line: "Other current liabilities" };
  }
  if (p === "fixed assets") return { section: "Non-current assets", line: "Property, plant and equipment" };
  if (p === "investments") return { section: "Non-current assets", line: "Investments" };
  if (p === "current assets") {
    if (has(r.path, "sundry debtors")) return { section: "Current assets", line: "Trade receivables" };
    if (has(r.path, "bank accounts", "cash-in-hand", "bank od a/c")) return { section: "Current assets", line: "Cash and bank balances" };
    if (has(r.path, "stock-in-hand")) return { section: "Current assets", line: "Inventories" };
    if (has(r.path, "loans & advances (asset)", "deposits (asset)")) return { section: "Current assets", line: "Loans, advances and deposits" };
    return { section: "Current assets", line: "Other current assets" };
  }
  if (p === "misc. expenses (asset)") return { section: "Current assets", line: "Other current assets" };
  // Suspense is shown on whichever side its sign puts it.
  if (p === "suspense a/c" || n === "suspense") return { section: r.closing >= 0 ? "Current assets" : "Current liabilities", line: "Suspense (to be cleared)" };
  return { section: "Current assets", line: "Other current assets" };
}

/* ── Profit and Loss ───────────────────────────────────────── */

export interface ProfitAndLoss {
  revenue: Line[];
  revenueTotal: number;
  otherIncome: Line[];
  otherIncomeTotal: number;
  directCosts: Line[];
  directCostsTotal: number;
  indirectExpenses: Line[];
  indirectExpensesTotal: number;
  totalIncome: number;
  totalExpenses: number;
  grossProfit: number;
  netProfit: number;
  /** Percent of revenue from operations; null when there is no revenue. */
  grossMarginPct: number | null;
  netMarginPct: number | null;
}

function groupLines(rs: Resolved[], sign: 1 | -1): Line[] {
  const byLabel = new Map<string, Line>();
  for (const r of rs) {
    const amt = round2(r.closing * sign);
    if (Math.abs(amt) < 0.005) continue;
    // One line per immediate group keeps the statement readable.
    const label = r.parent || r.primary;
    const line = byLabel.get(label) ?? { label, amount: 0, ledgers: [] };
    line.amount = round2(line.amount + amt);
    line.ledgers.push({ name: r.name, amount: amt });
    byLabel.set(label, line);
  }
  const lines = [...byLabel.values()];
  for (const l of lines) l.ledgers.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  return lines.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}
const sum = (ls: Line[]) => round2(ls.reduce((s, l) => s + l.amount, 0));
const pct = (n: number, d: number) => (Math.abs(d) < 0.005 ? null : Math.round((n / d) * 1000) / 10);

/**
 * Revenue from operations is Sales Accounts plus Direct Incomes. Indirect
 * incomes are other income. Closing stock is not a ledger posting in Tally
 * (it is worked out when the report runs), so a business that holds stock
 * passes `stockAdjustment` = closing stock less opening stock.
 */
export function profitAndLoss(res: Resolved[], stockAdjustment = 0): ProfitAndLoss {
  const by = (p: string[]) => res.filter((r) => p.includes(key(r.primary)));
  const revenue = groupLines(by(["sales accounts", "direct incomes", "income (direct)"]), -1);
  const otherIncome = groupLines(by(["indirect incomes", "income (indirect)"]), -1);
  const directCosts = groupLines(by(["purchase accounts", "direct expenses", "expenses (direct)"]), 1);
  if (Math.abs(stockAdjustment) >= 0.005) {
    directCosts.push({ label: "Change in inventories", amount: round2(-stockAdjustment), ledgers: [] });
  }
  const indirectExpenses = groupLines(by(["indirect expenses", "expenses (indirect)"]), 1);
  const revenueTotal = sum(revenue);
  const otherIncomeTotal = sum(otherIncome);
  const directCostsTotal = sum(directCosts);
  const indirectExpensesTotal = sum(indirectExpenses);
  const grossProfit = round2(revenueTotal - directCostsTotal);
  const netProfit = round2(grossProfit + otherIncomeTotal - indirectExpensesTotal);
  return {
    revenue,
    revenueTotal,
    otherIncome,
    otherIncomeTotal,
    directCosts,
    directCostsTotal,
    indirectExpenses,
    indirectExpensesTotal,
    totalIncome: round2(revenueTotal + otherIncomeTotal),
    totalExpenses: round2(directCostsTotal + indirectExpensesTotal),
    grossProfit,
    netProfit,
    grossMarginPct: pct(grossProfit, revenueTotal),
    netMarginPct: pct(netProfit, revenueTotal),
  };
}

/* ── Balance Sheet ─────────────────────────────────────────── */

export interface BalanceSheet {
  liabilities: Section[];
  assets: Section[];
  totalLiabilities: number;
  totalAssets: number;
  /** Assets less liabilities, after profit for the year is carried in. */
  difference: number;
  balanced: boolean;
}

const SECTION_ORDER_L = ["Shareholders' funds", "Non-current liabilities", "Current liabilities"];
const SECTION_ORDER_A = ["Non-current assets", "Current assets"];

function build(rs: Resolved[], sections: string[], sign: 1 | -1, extra: Record<string, Line[]> = {}): Section[] {
  const out = new Map<string, Map<string, Line>>(sections.map((s) => [s, new Map()]));
  for (const r of rs) {
    const { section, line } = sheetHead(r);
    const amt = round2(r.closing * sign);
    if (Math.abs(amt) < 0.005) continue;
    const secMap = out.get(section) ?? out.get(sections[sections.length - 1])!;
    const l = secMap.get(line) ?? { label: line, amount: 0, ledgers: [] };
    l.amount = round2(l.amount + amt);
    l.ledgers.push({ name: r.name, amount: amt });
    secMap.set(line, l);
  }
  for (const [s, ls] of Object.entries(extra)) {
    const m = out.get(s);
    if (m) for (const l of ls) m.set(l.label, l);
  }
  return sections
    .map((title) => {
      const lines = [...out.get(title)!.values()];
      for (const l of lines) l.ledgers.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
      return { title, lines, total: sum(lines) };
    })
    .filter((s) => s.lines.length);
}

/**
 * Profit for the year (income less expenses, in the snapshot) is carried into
 * Reserves and surplus, the way Tally's own balance sheet shows it.
 */
export function balanceSheet(res: Resolved[], stockAdjustment = 0): BalanceSheet {
  const sheet = res.filter((r) => r.nature === "asset" || r.nature === "liability");
  const pl = profitAndLoss(res, stockAdjustment);
  // Closing stock sits in assets only if the ledger carries it; an adjustment
  // for the year is mirrored here so the sheet still balances.
  const assetsExtra: Record<string, Line[]> = {};
  if (Math.abs(stockAdjustment) >= 0.005) assetsExtra["Current assets"] = [{ label: "Inventories (closing stock adjustment)", amount: round2(stockAdjustment), ledgers: [] }];

  const liabRes = sheet.filter((r) => r.nature === "liability" && !(key(r.primary) === "suspense a/c" && r.closing > 0));
  const assetRes = sheet.filter((r) => r.nature === "asset" && !(key(r.primary) === "suspense a/c" && r.closing < 0));
  const suspCr = sheet.filter((r) => key(r.primary) === "suspense a/c" && r.closing < 0);

  const liabilities = build([...liabRes, ...suspCr], SECTION_ORDER_L, -1, {
    "Shareholders' funds": Math.abs(pl.netProfit) >= 0.005 ? [{ label: pl.netProfit >= 0 ? "Profit for the year" : "Loss for the year", amount: pl.netProfit, ledgers: [] }] : [],
  });
  const assets = build(assetRes, SECTION_ORDER_A, 1, assetsExtra);
  const totalLiabilities = round2(liabilities.reduce((s, x) => s + x.total, 0));
  const totalAssets = round2(assets.reduce((s, x) => s + x.total, 0));
  const difference = round2(totalAssets - totalLiabilities);
  return { liabilities, assets, totalLiabilities, totalAssets, difference, balanced: Math.abs(difference) < 1 };
}

/* ── Working capital: debtors and creditors ────────────────── */

export interface PartyBalance {
  name: string;
  amount: number;
}
/** Sundry debtors with a debit balance, and creditors with a credit balance. */
export function parties(res: Resolved[]) {
  const debtors = res.filter((r) => has(r.path, "sundry debtors") && r.closing > 0.005).map((r) => ({ name: r.name, amount: round2(r.closing) }));
  const creditors = res.filter((r) => has(r.path, "sundry creditors") && r.closing < -0.005).map((r) => ({ name: r.name, amount: round2(-r.closing) }));
  const top = (a: PartyBalance[]) => a.sort((x, y) => y.amount - x.amount);
  return { debtors: top(debtors), creditors: top(creditors) };
}

/* ── Books agent: the checks a careful reviewer would make ──── */

export type Severity = "high" | "medium" | "info";
export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  /** Ledgers to open first. */
  ledgers: string[];
}

const money = (n: number) => "₹" + Math.abs(Math.round(n)).toLocaleString("en-IN");

/** Rule-based review of a snapshot. Every finding names the ledgers it came from. */
export function reviewBooks(res: Resolved[], stockAdjustment = 0): Finding[] {
  const out: Finding[] = [];
  const tb = trialBalance(res);
  if (!tb.balanced) {
    out.push({
      id: "tb-out-of-balance",
      severity: "high",
      title: "Trial balance does not tally",
      detail: `Debits ${money(tb.totalDebit)} against credits ${money(tb.totalCredit)}, a gap of ${money(tb.difference)}. Check the sync covered every ledger, then look for ledgers outside any group.`,
      ledgers: [],
    });
  }
  const unmapped = res.filter((r) => !r.primary && Math.abs(r.closing) >= 0.005);
  if (unmapped.length) {
    out.push({
      id: "unmapped",
      severity: "high",
      title: `${unmapped.length} ledger${unmapped.length === 1 ? "" : "s"} could not be placed`,
      detail: "Their group does not lead to a Tally primary group, so they are left out of the statements. Resend the groups, or map them by hand.",
      ledgers: unmapped.slice(0, 8).map((r) => r.name),
    });
  }
  const susp = res.filter((r) => key(r.primary) === "suspense a/c" && Math.abs(r.closing) >= 1);
  if (susp.length) {
    out.push({
      id: "suspense",
      severity: "high",
      title: "Suspense account has a balance",
      detail: `${money(susp.reduce((s, r) => s + r.closing, 0))} is parked in suspense. It is not income or expense yet; find what it is and rebook it before sign-off.`,
      ledgers: susp.map((r) => r.name),
    });
  }
  const negBank = res.filter((r) => has(r.path, "bank accounts", "cash-in-hand") && r.closing < -0.5);
  if (negBank.length) {
    out.push({
      id: "negative-cash",
      severity: "high",
      title: "Cash or bank shows a credit balance",
      detail: "A cash or bank ledger below zero usually means receipts are missing or payments are booked twice. Bank overdrafts should sit under Bank OD A/c.",
      ledgers: negBank.map((r) => r.name),
    });
  }
  const p = parties(res);
  const crDebtors = res.filter((r) => has(r.path, "sundry debtors") && r.closing < -1);
  if (crDebtors.length) {
    out.push({
      id: "debtor-credit",
      severity: "medium",
      title: `${crDebtors.length} debtor${crDebtors.length === 1 ? "" : "s"} with a credit balance`,
      detail: `${money(crDebtors.reduce((s, r) => s + r.closing, 0))} in total. Usually advances received or unadjusted credit notes; they belong in current liabilities.`,
      ledgers: crDebtors.slice(0, 8).map((r) => r.name),
    });
  }
  const drCreditors = res.filter((r) => has(r.path, "sundry creditors") && r.closing > 1);
  if (drCreditors.length) {
    out.push({
      id: "creditor-debit",
      severity: "medium",
      title: `${drCreditors.length} creditor${drCreditors.length === 1 ? "" : "s"} with a debit balance`,
      detail: `${money(drCreditors.reduce((s, r) => s + r.closing, 0))} in total. Usually advances paid or unadjusted debit notes; they belong in current assets.`,
      ledgers: drCreditors.slice(0, 8).map((r) => r.name),
    });
  }
  const pl = profitAndLoss(res, stockAdjustment);
  if (pl.revenueTotal > 0 && pl.netProfit < 0) {
    out.push({
      id: "loss",
      severity: "info",
      title: "The year is running at a loss",
      detail: `Revenue ${money(pl.revenueTotal)} against costs ${money(pl.totalExpenses)}.`,
      ledgers: [],
    });
  }
  const bs = balanceSheet(res, stockAdjustment);
  if (tb.balanced && !bs.balanced) {
    out.push({
      id: "bs-out-of-balance",
      severity: "medium",
      title: "Balance sheet is off by closing stock",
      detail: `Assets and liabilities differ by ${money(bs.difference)}. If the client keeps inventory, Tally adds closing stock when the report runs; enter closing less opening stock to bring it in.`,
      ledgers: [],
    });
  }
  const tdsDr = res.filter((r) => has(r.path, "duties & taxes") && /tds/i.test(r.name) && r.closing > 1);
  if (tdsDr.length) {
    out.push({
      id: "tds-debit",
      severity: "info",
      title: "A TDS ledger is in debit",
      detail: "TDS payable normally carries a credit balance; a debit can mean TDS receivable on income, or an excess deposit.",
      ledgers: tdsDr.map((r) => r.name),
    });
  }
  if (p.debtors.length && p.debtors[0].amount > 0) {
    const total = p.debtors.reduce((s, d) => s + d.amount, 0);
    const share = Math.round((p.debtors[0].amount / total) * 100);
    if (p.debtors.length >= 3 && share >= 50) {
      out.push({
        id: "concentration",
        severity: "info",
        title: "One customer holds most of the receivables",
        detail: `${p.debtors[0].name} owes ${money(p.debtors[0].amount)}, ${share}% of all receivables.`,
        ledgers: [p.debtors[0].name],
      });
    }
  }
  const order: Record<Severity, number> = { high: 0, medium: 1, info: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

/* ── Month-by-month: year-to-date snapshots to monthly movement ── */

export interface MonthlyPoint {
  month: string;
  revenue: number;
  otherIncome: number;
  expenses: number;
  netProfit: number;
}

/**
 * Snapshots are cumulative from the start of the year, so a month's own
 * figures are this snapshot less the one before it.
 * `ytd` must be ordered by `asOn` and share one financial year.
 */
export function monthlySeries(ytd: { asOn: string; pl: ProfitAndLoss }[]): MonthlyPoint[] {
  return ytd.map((cur, i) => {
    const prev = i > 0 ? ytd[i - 1].pl : null;
    const d = (a: number, b: number | undefined) => round2(a - (b ?? 0));
    return {
      month: cur.asOn.slice(0, 7),
      revenue: d(cur.pl.revenueTotal, prev?.revenueTotal),
      otherIncome: d(cur.pl.otherIncomeTotal, prev?.otherIncomeTotal),
      expenses: d(cur.pl.totalExpenses, prev?.totalExpenses),
      netProfit: d(cur.pl.netProfit, prev?.netProfit),
    };
  });
}
