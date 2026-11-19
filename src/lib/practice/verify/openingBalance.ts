/**
 * Check 1 of the CA's four: do the opening balances in Tally agree with last year's audited closing?
 *
 * Two inputs. The audited balance sheet (its text copied from the signed PDF, or an Excel with a label column and amount columns) is
 * read into heads (Share capital, Trade payables, Inventories, and so on) and TIED OUT first: the heads must add up to the totals the
 * document itself prints, or the schedule is held and nothing is compared. The Tally masters give each ledger's opening balance and
 * its group. Heads and groups are brought to the same coarse buckets (a CA regroups within a bucket all the time: long-term and
 * short-term borrowings, a bank overdraft shown under borrowings), and each bucket is compared.
 *
 * A difference is a decision for a person: nothing here accepts one. Pure and isomorphic; no AI. A figure it cannot place is listed,
 * never folded in silently.
 */
import type { MasterLedger } from "../extract/tallyMasters";
import { money } from "../gst/invoices";
import { inputsHash, statusOf, totalsOf, type VerifyCheck, type VerifyDecision, type VerifyLine, type VerifyMissing } from "./types";

const r2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => `₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export type Side = "liability" | "asset";

export type Bucket =
  | "equity"
  | "borrowings"
  | "deferred_tax"
  | "trade_payables"
  | "other_liabilities"
  | "fixed_assets"
  | "investments"
  | "inventories"
  | "trade_receivables"
  | "cash"
  | "loans_and_other_assets";

export const BUCKET_LABEL: Record<Bucket, string> = {
  equity: "Share capital and reserves",
  borrowings: "Borrowings (long and short term, bank overdraft)",
  deferred_tax: "Deferred tax (net liability)",
  trade_payables: "Trade payables (sundry creditors)",
  other_liabilities: "Other liabilities and provisions (duties and taxes, provisions)",
  fixed_assets: "Property, plant and equipment (fixed assets)",
  investments: "Investments",
  inventories: "Inventories (stock in hand)",
  trade_receivables: "Trade receivables (sundry debtors)",
  cash: "Cash and bank balances",
  loans_and_other_assets: "Loans, advances, deposits and other assets",
};

const SIDE_OF: Record<Bucket, Side> = {
  equity: "liability",
  borrowings: "liability",
  deferred_tax: "liability",
  trade_payables: "liability",
  other_liabilities: "liability",
  fixed_assets: "asset",
  investments: "asset",
  inventories: "asset",
  trade_receivables: "asset",
  cash: "asset",
  loans_and_other_assets: "asset",
};

/** Schedule III heads, in the order they are tried (the specific ones before the general). */
const HEADS: { key: string; side: Side; bucket: Bucket; sign: 1 | -1; re: RegExp }[] = [
  { key: "deferred_tax_liab", side: "liability", bucket: "deferred_tax", sign: 1, re: /deferred tax liabilit/ },
  { key: "other_lt_liab", side: "liability", bucket: "other_liabilities", sign: 1, re: /other long.?term liabilit/ },
  { key: "lt_provisions", side: "liability", bucket: "other_liabilities", sign: 1, re: /long.?term provisions?/ },
  { key: "lt_borrowings", side: "liability", bucket: "borrowings", sign: 1, re: /long.?term borrowings?/ },
  { key: "st_borrowings", side: "liability", bucket: "borrowings", sign: 1, re: /short.?term borrowings?/ },
  { key: "st_provisions", side: "liability", bucket: "other_liabilities", sign: 1, re: /short.?term provisions?/ },
  { key: "other_current_liab", side: "liability", bucket: "other_liabilities", sign: 1, re: /other current liabilit/ },
  { key: "trade_payables", side: "liability", bucket: "trade_payables", sign: 1, re: /trade payables?|creditors|micro enterprises/ },
  { key: "share_capital", side: "liability", bucket: "equity", sign: 1, re: /share capital|partners.? capital|proprietor.?s? capital|capital account/ },
  { key: "reserves", side: "liability", bucket: "equity", sign: 1, re: /reserves|surplus|profit (and|&) loss/ },
  { key: "deferred_tax_asset", side: "asset", bucket: "deferred_tax", sign: -1, re: /deferred tax assets?/ },
  { key: "nc_investments", side: "asset", bucket: "investments", sign: 1, re: /non.?current investments?/ },
  { key: "c_investments", side: "asset", bucket: "investments", sign: 1, re: /current investments?/ },
  { key: "lt_loans_adv", side: "asset", bucket: "loans_and_other_assets", sign: 1, re: /long.?term loans/ },
  { key: "other_nc_assets", side: "asset", bucket: "loans_and_other_assets", sign: 1, re: /other non.?current assets?/ },
  { key: "other_current_assets", side: "asset", bucket: "loans_and_other_assets", sign: 1, re: /other current assets?/ },
  { key: "st_loans_adv", side: "asset", bucket: "loans_and_other_assets", sign: 1, re: /short.?term loans/ },
  { key: "ppe", side: "asset", bucket: "fixed_assets", sign: 1, re: /property,? plant|fixed assets|tangible|capital work/ },
  { key: "inventories", side: "asset", bucket: "inventories", sign: 1, re: /inventor/ },
  { key: "trade_receivables", side: "asset", bucket: "trade_receivables", sign: 1, re: /trade receivables?|debtors/ },
  { key: "cash", side: "asset", bucket: "cash", sign: 1, re: /cash and cash equivalents?|cash (and|&) bank|cash in hand/ },
];

export interface AuditedHead {
  key: string;
  label: string;
  side: Side;
  bucket: Bucket;
  /** Amount in rupees for the closing year (the left-hand amount column). */
  current: number;
  /** The comparative year, when the document gives it. */
  previous: number | null;
  /** The head could not be matched to a known Schedule III head; it is compared in the nearest bucket and said so. */
  guessed: boolean;
  /** The document printed one amount for this head and the tie-out decided which column it belongs to. */
  placedByTieOut?: boolean;
}

export interface AuditedSchedule {
  heads: AuditedHead[];
  /** Rupees per printed unit: 1000 for "Amount in '000". */
  unit: number;
  /** "2025-03-31", when the heading says it. */
  asOn: string | null;
  /** The totals the document prints for the closing year. */
  printed: { liabilities: number | null; assets: number | null };
  /** Did the heads add up to the printed totals? A schedule that did not is held: nothing is compared from it. */
  tied: boolean;
  /** Why it did not tie, in plain words. */
  reasons: string[];
  notes: string[];
}

/* ── reading the balance sheet text ────────────────────── */

const AMT = String.raw`\(?-?\d[\d,]*\.\d{2}\)?`;
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’'`]/g, "'")
    .replace(/[^a-z0-9%&,.'()/ -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function unitOf(text: string): number {
  const t = text.toLowerCase();
  if (/amounts?\s*(?:are\s*)?in\s*(?:rs\.?\s*)?'?000|in thousands|\(in '?000\)|rs\.? in thousands|in rs\.? ?'000/.test(t)) return 1000;
  if (/in (?:rs\.? )?lakhs?|in lacs?|\(in lakhs?\)/.test(t)) return 100_000;
  if (/in (?:rs\.? )?crores?|\(in crores?\)/.test(t)) return 10_000_000;
  if (/in millions?/.test(t)) return 1_000_000;
  return 1;
}

function asOnOf(text: string): string | null {
  const m = /(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s*,?\s*(20\d{2})/i.exec(text);
  if (!m) return null;
  const mon = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"].indexOf(m[2]!.toLowerCase());
  return `${m[3]}-${String(mon + 1).padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
}

const headOf = (label: string) => HEADS.find((h) => h.re.test(norm(label)));

interface RawRow {
  label: string;
  /** The printed amounts in order, in printed units. */
  amounts: number[];
  side: Side;
}

/** Rows of a Schedule III balance sheet from its text: each group of amounts takes the label that precedes it. */
function rawRowsFromText(text: string): { rows: RawRow[]; totals: { liabilities: number[]; assets: number[] }; notes: string[] } {
  const clean = text.replace(/\\\*/g, " ").replace(/\*/g, " ").replace(/\r/g, " ").replace(/\s+/g, " ");
  const notes: string[] = [];
  const group = new RegExp(`(${AMT})(?:\\s+(${AMT}))?`, "g");
  const groups: { start: number; end: number; vals: number[] }[] = [];
  for (const m of clean.matchAll(group)) {
    const vals = [m[1], m[2]].filter(Boolean).map((v) => money(v!)!).filter((v) => v !== null);
    groups.push({ start: m.index!, end: m.index! + m[0].length, vals });
  }
  // TOTAL rows: the first is liabilities, the second assets.
  const totals = { liabilities: [] as number[], assets: [] as number[] };
  const totalIdx: number[] = [];
  groups.forEach((g, k) => {
    if (/\btotal\s*$/i.test(clean.slice(Math.max(0, g.start - 12), g.start))) totalIdx.push(k);
  });
  if (totalIdx.length >= 1) totals.liabilities = groups[totalIdx[0]!]!.vals;
  if (totalIdx.length >= 2) totals.assets = groups[totalIdx[1]!]!.vals;
  const split = totalIdx.length ? groups[totalIdx[0]!]!.start : Infinity;
  const rows: RawRow[] = [];
  let prevEnd = 0;
  groups.forEach((g, k) => {
    const region = clean.slice(prevEnd, g.start);
    prevEnd = g.end;
    if (totalIdx.includes(k)) return;
    // The label is what follows the last "(a)", "(b)", "(i)" marker; then the note number just before the amounts is dropped.
    const markers = [...region.matchAll(/\((?:[a-z]|[ivx]{1,4})\)/gi)];
    let label = markers.length ? region.slice(markers[markers.length - 1]!.index! + markers[markers.length - 1]![0].length) : region;
    label = label.replace(/\s+\d{1,2}\s*$/, "").replace(/^\s*[-–]\s*\d{0,2}\s*/, "").trim();
    if (!label || !headOf(label)) {
      if (label) notes.push(`"${label.slice(0, 60)}" was not recognised as a balance sheet head.`);
      if (!label || !/[a-z]{4}/i.test(label)) return;
    }
    rows.push({ label, amounts: g.vals, side: g.start < split ? "liability" : "asset" });
  });
  return { rows, totals, notes };
}

const sumBy = (heads: AuditedHead[], side: Side) => r2(heads.filter((h) => h.side === side).reduce((t, h) => t + h.current, 0));

/** Reads an audited balance sheet from text copied out of the PDF, ties it out against the totals it prints, and holds it if it does not tie. */
export function readBalanceSheetText(text: string): AuditedSchedule {
  const unit = unitOf(text);
  const asOn = asOnOf(text);
  const { rows, totals, notes } = rawRowsFromText(text);
  return buildSchedule(rows, totals, unit, asOn, notes);
}

function buildSchedule(rows: RawRow[], totals: { liabilities: number[]; assets: number[] }, unit: number, asOn: string | null, notes: string[]): AuditedSchedule {
  const printed = { liabilities: totals.liabilities.length ? r2(totals.liabilities[0]! * unit) : null, assets: totals.assets.length ? r2(totals.assets[0]! * unit) : null };
  const heads: AuditedHead[] = rows.map((r) => {
    const h = headOf(r.label);
    const fallback: Bucket = r.side === "liability" ? "other_liabilities" : "loans_and_other_assets";
    return {
      key: h?.key ?? "unrecognised",
      label: r.label,
      side: h?.side ?? r.side,
      bucket: h?.bucket ?? fallback,
      current: r2((r.amounts[0] ?? 0) * unit),
      previous: r.amounts.length > 1 ? r2(r.amounts[1]! * unit) : null,
      guessed: !h,
    };
  });
  const tol = Math.max(1, unit * 0.01 * 0.5 * Math.max(1, rows.length));
  const reasons: string[] = [];
  // A head printed with one amount is either the closing or the comparative year. The document's own totals decide: try every placement
  // and keep the one that makes the closing column add up. If none or several do, the schedule is held for a person.
  const ambiguous = heads.map((h, i) => ({ h, i, raw: rows[i]! })).filter((x) => x.raw.amounts.length === 1);
  const sumFor = (placeCurrent: boolean[], side: Side) =>
    r2(heads.reduce((t, h, i) => {
      if (h.side !== side) return t;
      const amb = ambiguous.findIndex((a) => a.i === i);
      if (amb >= 0 && !placeCurrent[amb]) return t;
      return t + h.current;
    }, 0));
  const hasTotals = printed.liabilities !== null && printed.assets !== null;
  let tied = false;
  if (!hasTotals) {
    reasons.push("The balance sheet's own TOTAL lines were not found in the text, so the heads cannot be proved complete.");
  } else if (ambiguous.length > 10) {
    reasons.push(`${ambiguous.length} heads have one amount and cannot be placed by the totals alone.`);
  } else {
    const winners: boolean[][] = [];
    for (let mask = 0; mask < 1 << ambiguous.length; mask++) {
      const place = ambiguous.map((_, k) => Boolean(mask & (1 << k)));
      if (Math.abs(sumFor(place, "liability") - printed.liabilities!) <= tol && Math.abs(sumFor(place, "asset") - printed.assets!) <= tol) winners.push(place);
    }
    if (winners.length === 1) {
      tied = true;
      const w = winners[0]!;
      ambiguous.forEach((a, k) => {
        if (!w[k]) {
          // The single amount belongs to the comparative year; it is not part of the closing balance.
          a.h.previous = a.h.current;
          a.h.current = 0;
        }
        a.h.placedByTieOut = true;
      });
    } else if (winners.length > 1) {
      reasons.push("The heads can be placed in more than one way and still add up to the printed totals, so the document is ambiguous.");
    } else {
      const l = sumBy(heads, "liability");
      const a = sumBy(heads, "asset");
      reasons.push(
        `The heads do not add up to the totals the balance sheet prints: liabilities ${fmt(l)} against ${fmt(printed.liabilities!)}, assets ${fmt(a)} against ${fmt(printed.assets!)}. A head was missed or misread.`,
      );
    }
  }
  if (!heads.length) reasons.push("No balance sheet heads were found in the text.");
  return { heads, unit, asOn, printed, tied, reasons, notes };
}

/** An Excel or CSV schedule: a label column and one or two amount columns, with a TOTAL row for each side. */
export function readBalanceSheetRows(rowsIn: string[][]): AuditedSchedule {
  const flat = rowsIn.map((r) => r.map((c) => String(c ?? "").trim()));
  const unit = unitOf(flat.slice(0, 8).map((r) => r.join(" ")).join(" "));
  const asOn = asOnOf(flat.slice(0, 8).map((r) => r.join(" ")).join(" "));
  const rows: RawRow[] = [];
  const totals = { liabilities: [] as number[], assets: [] as number[] };
  let seenTotals = 0;
  for (const r of flat) {
    const label = r.find((c) => c && money(c) === null && /[a-z]{3}/i.test(c)) ?? "";
    const nums = r.map((c) => (c && /\d/.test(c) ? money(c) : null)).filter((v): v is number => v !== null && Math.abs(v) >= 0.005);
    if (!label || !nums.length) continue;
    if (/^\s*(grand\s+)?total\b/i.test(label)) {
      (seenTotals === 0 ? totals.liabilities : totals.assets).push(...nums.slice(0, 2));
      seenTotals++;
      continue;
    }
    rows.push({ label: label.replace(/^\(?[a-z0-9]{1,4}\)\s*/i, ""), amounts: nums.slice(-2).length === 2 && nums.length >= 2 ? nums.slice(-2) : nums.slice(-1), side: seenTotals === 0 ? "liability" : "asset" });
  }
  const s = buildSchedule(rows, totals, unit, asOn, []);
  s.notes.push("Read from a spreadsheet: the first TOTAL line closes the liabilities and the second the assets.");
  return s;
}

/* ── the Tally side ────────────────────────────────────── */

export interface TallyBucketFigure {
  bucket: Bucket;
  /** In the sign of its side: a credit for liabilities, a debit for assets. */
  amount: number;
  ledgers: { name: string; parent: string; amount: number }[];
}

export interface TallyOpening {
  buckets: Map<Bucket, TallyBucketFigure>;
  /** Ledgers with an opening balance that could not be placed in a bucket. They are listed, never added to a bucket. */
  unmapped: MasterLedger[];
  /** Do the openings balance? Debits must equal credits, whatever the grouping. */
  debit: number;
  credit: number;
}

const PARENT: [RegExp, Bucket][] = [
  [/^(capital account|reserves? (and|&) surplus|reserves)/, "equity"],
  [/^(loans? \(liability\)|secured loans?|unsecured loans?|bank od|bank occ|bank overdraft|bank accounts? \(od\)|cash credit)/, "borrowings"],
  [/^sundry creditors?/, "trade_payables"],
  [/^(duties (and|&) taxes|provisions?|current liabilities|other liabilities|stat(utory)? liabilities)/, "other_liabilities"],
  [/^fixed assets?/, "fixed_assets"],
  [/^investments?/, "investments"],
  [/^stock.?in.?hand/, "inventories"],
  [/^sundry debtors?/, "trade_receivables"],
  [/^cash.?in.?hand/, "cash"],
  [/^(loans (and|&) advances|deposits|current assets|misc\.? expenses|advance tax|tds receivable|input tax|gst input)/, "loans_and_other_assets"],
];

export function mapMasters(ledgers: MasterLedger[]): TallyOpening {
  const buckets = new Map<Bucket, TallyBucketFigure>();
  const unmapped: MasterLedger[] = [];
  let debit = 0;
  let credit = 0;
  const put = (bucket: Bucket, l: MasterLedger, amount: number) => {
    const b = buckets.get(bucket) ?? { bucket, amount: 0, ledgers: [] };
    b.amount = r2(b.amount + amount);
    b.ledgers.push({ name: l.name, parent: l.parent, amount });
    buckets.set(bucket, b);
  };
  for (const l of ledgers) {
    if (!l.opening) continue;
    if (l.opening < 0) debit += -l.opening;
    else credit += l.opening;
    const name = norm(l.name);
    const parent = norm(l.parent);
    if (/deferred tax/.test(name)) put("deferred_tax", l, l.opening); // credit positive, so a net liability
    else if (/^profit (and|&) loss/.test(name)) put("equity", l, l.opening);
    else if (/^bank accounts?$/.test(parent)) {
      // A bank ledger with a credit balance is an overdraft or cash credit: a borrowing, not cash.
      if (l.opening > 0) put("borrowings", l, l.opening);
      else put("cash", l, -l.opening);
    } else {
      const hit = PARENT.find(([re]) => re.test(parent));
      if (!hit) unmapped.push(l);
      else put(hit[1], l, SIDE_OF[hit[1]] === "liability" ? l.opening : -l.opening);
    }
  }
  return { buckets, unmapped, debit: r2(debit), credit: r2(credit) };
}

/* ── the comparison ────────────────────────────────────── */

export interface OpeningInput {
  /** File names, for the evidence. */
  auditedName: string;
  mastersName: string;
  audited: AuditedSchedule | null;
  masters: MasterLedger[] | null;
  /** The financial year the Tally file opens, as its first day ("2025-04-01"). The audited sheet must be as on the day before. */
  tallyOpensOn?: string | null;
  /** Decisions a person recorded, by bucket. */
  decisions?: Partial<Record<Bucket, VerifyDecision>>;
}

const RULE = "OB-1";
const RULE_TEXT = "Tally's opening balance of a bucket equals last year's audited closing for the same bucket (regrouping inside a bucket is allowed).";

const dayBefore = (iso: string) => new Date(Date.parse(iso) - 86_400_000).toISOString().slice(0, 10);

export function checkOpeningBalances(input: OpeningInput): VerifyCheck {
  const { audited, masters } = input;
  const missing: VerifyMissing[] = [];
  const notes: string[] = [];
  if (!audited) missing.push({ file: "Audited balance sheet for last year", why: "Opening balances are compared with last year's audited closing.", howToGetIt: "Paste the text of the signed balance sheet, or upload it as Excel. Ask the client's auditor for the Excel if the PDF will not copy." });
  else if (!audited.tied)
    missing.push({ file: "A balance sheet that adds up", why: `The balance sheet was read but cannot be trusted yet. ${audited.reasons.join(" ")}`, howToGetIt: "Check the pasted text against the PDF, or upload the schedule as Excel. Nothing is compared until the heads add up to the totals the document prints." });
  if (!masters || !masters.length) missing.push({ file: "Tally masters (ledgers with opening balances)", why: "The opening balances come from the ledger masters.", howToGetIt: "In Tally, export Masters (all ledgers) as XML for the new year, or use the connector." });

  const hash = inputsHash({ a: audited ? audited.heads.map((h) => [h.key, h.label, h.current]) : null, m: masters ? masters.map((l) => [l.name, l.parent, l.opening]) : null, d: input.decisions ?? {} });
  if (missing.length || !audited || !masters) {
    return { id: "opening-balances", kind: "opening", title: "Opening balances against last year's audit", status: "cannot_run", summary: `Add ${missing.map((m) => m.file.toLowerCase()).join(" and ")} to run this check.`, missing, lines: [], totals: totalsOf([]), inputsHash: hash, notes };
  }

  if (audited.asOn && input.tallyOpensOn && dayBefore(input.tallyOpensOn) !== audited.asOn)
    notes.push(`The balance sheet is as on ${audited.asOn}, but Tally opens on ${input.tallyOpensOn}; it should be the day before (${dayBefore(input.tallyOpensOn)}). The comparison may be of the wrong year.`);
  for (const h of audited.heads) if (h.guessed) notes.push(`"${h.label}" was not recognised as a standard head; it is compared with ${SIDE_OF[h.bucket] === "liability" ? "other liabilities" : "other assets"}.`);
  for (const h of audited.heads) if (h.placedByTieOut) notes.push(`"${h.label}" printed one amount; the document's totals show it belongs to ${h.current ? "the closing year" : "the comparative year"}.`);

  const tally = mapMasters(masters);
  const auditedBy = new Map<Bucket, { amount: number; heads: AuditedHead[] }>();
  for (const h of audited.heads) {
    const b = auditedBy.get(h.bucket) ?? { amount: 0, heads: [] };
    // Deferred tax is a net liability: an asset reduces it.
    b.amount = r2(b.amount + (h.bucket === "deferred_tax" && h.side === "asset" ? -h.current : h.current));
    b.heads.push(h);
    auditedBy.set(h.bucket, b);
  }
  const tolFor = (n: number) => Math.max(1, audited.unit * 0.01 * 0.5 * Math.max(1, n));
  const order = Object.keys(BUCKET_LABEL) as Bucket[];
  const lines: VerifyLine[] = [];
  for (const bucket of order) {
    const a = auditedBy.get(bucket);
    const t = tally.buckets.get(bucket);
    if (!a && !t) continue;
    const aAmt = a?.amount ?? 0;
    const tAmt = t?.amount ?? 0;
    const diff = r2(tAmt - aAmt);
    const matches = Math.abs(diff) <= tolFor(a?.heads.length ?? 1);
    const decision = input.decisions?.[bucket];
    const state: VerifyLine["state"] = matches ? "matched" : decision ? "explained" : !a || (a.amount === 0 && t) ? "only_in_b" : !t || tAmt === 0 ? "only_in_a" : "differs";
    lines.push({
      id: `opening:${bucket}`,
      label: BUCKET_LABEL[bucket],
      state,
      figures: [
        ...(a ? [{ label: "Audited closing", amount: aAmt, source: { document: input.auditedName, where: a.heads.map((h) => h.label).join("; ").slice(0, 160) } }] : []),
        ...(t ? [{ label: "Tally opening", amount: tAmt, source: { document: input.mastersName, where: `${t.ledgers.length} ledger${t.ledgers.length === 1 ? "" : "s"}: ${t.ledgers.slice(0, 4).map((l) => l.name).join(", ")}${t.ledgers.length > 4 ? ", ..." : ""}` } }] : []),
      ],
      difference: matches ? 0 : diff,
      ruleId: RULE,
      ruleText: RULE_TEXT,
      ...(decision ? { decision } : {}),
    });
  }
  if (tally.unmapped.length) {
    const sum = r2(tally.unmapped.reduce((t, l) => t + l.opening, 0));
    notes.push(`${tally.unmapped.length} ledger${tally.unmapped.length === 1 ? "" : "s"} with an opening balance sit in a group this check does not place (${tally.unmapped.slice(0, 4).map((l) => `${l.name} under ${l.parent}`).join("; ")}${tally.unmapped.length > 4 ? "; ..." : ""}), net ${fmt(sum)} credit. They are not in any line above; place them before relying on a match.`);
  }
  if (Math.abs(tally.debit - tally.credit) > 1) notes.push(`The Tally opening balances do not balance: debits ${fmt(tally.debit)}, credits ${fmt(tally.credit)}.`);

  const status = statusOf(lines, []);
  const totals = totalsOf(lines);
  const unplaced = tally.unmapped.length > 0 || Math.abs(tally.debit - tally.credit) > 1;
  const summary =
    status === "passed" && !unplaced
      ? `All ${totals.checked} balance sheet groups agree with last year's audited closing${totals.explained ? `, ${totals.explained} explained by a named person` : ""}.`
      : totals.open
        ? `${totals.open} of ${totals.checked} groups differ from last year's audited closing and need a decision from a person.`
        : `The groups agree, but ${tally.unmapped.length ? "some ledgers could not be placed" : "the Tally openings do not balance"}; see the notes.`;
  return { id: "opening-balances", kind: "opening", title: "Opening balances against last year's audit", status: status === "passed" && unplaced ? "differences" : status, summary, missing: [], lines, totals, inputsHash: hash, notes };
}
