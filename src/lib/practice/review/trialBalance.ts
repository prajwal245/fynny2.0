/**
 * Tally's ledger-wise Trial Balance and Ledger Masters, read as the base of the opening-balance check.
 *
 *  - Trial Balance: per ledger, the group and primary group, opening (Dr/Cr), the year's net movement (Dr/Cr) and closing. Some exports leave the
 *    closing columns and the Total rows empty, so closing is always worked out as opening + movement, never trusted from a blank cell.
 *  - Ledger Masters: the party list with GSTIN, PAN, state, registration type, bill-wise flag and opening balance.
 *
 * Sign convention in this file: debit is positive, credit negative ("Dr +/ Cr −"). Tally's own XML writes it the other way round; `toMasterLedgers`
 * converts, so the existing group-level comparison (`compareOpening`) can use these ledgers unchanged.
 *
 * Pure code. An unbalanced trial balance is reported with the exact difference and whether it matches the figure the exporter quoted.
 */
import { money } from "../gst/invoices";
import type { MasterLedger } from "../extract/tallyMasters";

const r2 = (n: number) => Math.round(n * 100) / 100;
const cell = (v: unknown) => String(v ?? "").trim();
const norm = (v: unknown) => cell(v).toLowerCase().replace(/\s+/g, " ");
const num = (v: unknown) => money(cell(v).replace(/^-\s*$/, "")) ?? 0;

export interface TbLedger {
  name: string; group: string; primary: string;
  /** Dr positive, Cr negative. */
  opening: number; movement: number; closing: number;
  movementDr: number; movementCr: number;
  row: number;
}
export interface TrialBalance { ledgers: TbLedger[]; statedOpeningDiff: number | null; closingStated: boolean; notes: string[] }

export function readTrialBalance(rows: string[][]): TrialBalance {
  const hi = rows.findIndex((r) => norm(r[0]) === "ledger" && /opening/.test(norm(r[3])) && /closing/.test(norm(r[7])));
  if (hi < 0) return { ledgers: [], statedOpeningDiff: null, closingStated: false, notes: ["This is not a ledger-wise Trial Balance (no Ledger / Opening / Movement / Closing columns)."] };
  const ledgers: TbLedger[] = [];
  let closingStated = false;
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i]!;
    const name = cell(r[0]);
    if (!name) continue;
    if (/^(total|difference)/i.test(name)) continue;
    if (/^note:/i.test(name) || !cell(r[1])) continue;
    const opening = r2(num(r[3]) - num(r[4]));
    const movementDr = num(r[5]), movementCr = num(r[6]);
    const movement = r2(movementDr - movementCr);
    const stated = cell(r[7]) || cell(r[8]) ? r2(num(r[7]) - num(r[8])) : null;
    if (stated !== null) closingStated = true;
    ledgers.push({ name, group: cell(r[1]), primary: cell(r[2]) || cell(r[1]), opening, movement, movementDr, movementCr, closing: stated ?? r2(opening + movement), row: i + 1 });
  }
  const note = rows.map((r) => cell(r[0])).find((t) => /difference in opening balances/i.test(t));
  const m = note ? /₹\s*([\d,]+(?:\.\d+)?)/.exec(note) : null;
  const statedOpeningDiff = m ? Number(m[1]!.replace(/,/g, "")) : null;
  const notes: string[] = [];
  if (!closingStated) notes.push("The export leaves the closing columns blank, so closing is worked out as opening + the year's movement.");
  return { ledgers, statedOpeningDiff, closingStated, notes };
}

export interface MasterRow {
  name: string; group: string; primary: string; gstin: string | null; pan: string | null; state: string | null; regType: string | null; billWise: boolean;
  /** Dr positive, Cr negative. */
  opening: number;
}

export function readLedgerMasters(rows: string[][]): MasterRow[] {
  const hi = rows.findIndex((r) => norm(r[0]) === "ledger" && r.some((c) => /^bill-?wise/i.test(cell(c))));
  if (hi < 0) return [];
  const h = rows[hi]!.map(norm);
  const at = (re: RegExp, d: number) => { const i = h.findIndex((c) => re.test(c)); return i >= 0 ? i : d; };
  const cG = at(/^under/, 1), cP = at(/^primary/, 2), cGs = at(/^gstin/, 3), cPan = at(/^pan/, 4), cSt = at(/^state/, 5), cReg = at(/registration/, 6), cBw = at(/^bill-?wise/, 7), cOp = at(/^opening/, 8);
  const out: MasterRow[] = [];
  for (const r of rows.slice(hi + 1)) {
    const name = cell(r[0]);
    if (!name || !cell(r[cG])) continue;
    out.push({
      name, group: cell(r[cG]), primary: cell(r[cP]) || cell(r[cG]),
      gstin: /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z0-9][A-Z0-9]$/.test(cell(r[cGs])) ? cell(r[cGs]) : null,
      pan: /^[A-Z]{5}\d{4}[A-Z]$/.test(cell(r[cPan])) ? cell(r[cPan]) : null,
      state: cell(r[cSt]) || null, regType: cell(r[cReg]) || null, billWise: /^yes$/i.test(cell(r[cBw])), opening: r2(num(r[cOp])),
    });
  }
  return out;
}

/* ── integrity ─────────────────────────────────────────── */

export interface TbCheck { id: string; label: string; ok: boolean; detail: string }

/** Debits equal credits: at opening, in the year's movement, and at closing. The exporter's own quoted difference is reproduced, not trusted. */
export function trialBalanceIntegrity(tb: TrialBalance): { checks: TbCheck[]; openingDiff: number; closingDiff: number; movementDiff: number } {
  const sum = (pick: (l: TbLedger) => number) => r2(tb.ledgers.reduce((a, l) => a + pick(l), 0));
  const openingDiff = sum((l) => l.opening), movementDiff = sum((l) => l.movement), closingDiff = sum((l) => l.closing);
  const checks: TbCheck[] = [];
  const inr = (n: number) => `₹${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
  checks.push({
    id: "tb-opening", label: "Opening balances: debits equal credits", ok: Math.abs(openingDiff) < 0.005,
    detail: Math.abs(openingDiff) < 0.005 ? "Opening debits equal credits." : `Debits are ${inr(openingDiff)} ${openingDiff > 0 ? "more" : "less"} than credits at 1 April.`,
  });
  if (tb.statedOpeningDiff != null) {
    const same = Math.abs(Math.abs(openingDiff) - tb.statedOpeningDiff) < 0.005;
    checks.push({ id: "tb-stated", label: "The difference Tally quotes is the one in the ledgers", ok: same, detail: same ? `Reproduced: ${inr(tb.statedOpeningDiff)}.` : `Tally quotes ${inr(tb.statedOpeningDiff)} but the ledgers differ by ${inr(openingDiff)}.` });
  }
  checks.push({ id: "tb-movement", label: "The year's movement balances", ok: Math.abs(movementDiff) < 0.005, detail: Math.abs(movementDiff) < 0.005 ? "Movement debits equal credits." : `Movement differs by ${inr(movementDiff)}.` });
  checks.push({
    id: "tb-closing", label: "Closing balances: debits equal credits", ok: Math.abs(closingDiff - openingDiff) < 0.005 && Math.abs(movementDiff) < 0.005,
    detail: Math.abs(closingDiff) < 0.005 ? "Closing debits equal credits." : Math.abs(closingDiff - openingDiff) < 0.005 ? `Closing differs by ${inr(closingDiff)}, carried through from the opening difference.` : `Closing differs by ${inr(closingDiff)}.`,
  });
  return { checks, openingDiff, closingDiff, movementDiff };
}

/** Trial Balance against the masters: the same ledger must open with the same balance in both. */
export function tbAgainstMasters(tb: TrialBalance, masters: MasterRow[]): { ok: boolean; compared: number; missingInTb: { name: string; opening: number }[]; differs: { name: string; tb: number; masters: number }[] } {
  const byName = new Map(tb.ledgers.map((l) => [l.name.toLowerCase(), l]));
  const missingInTb: { name: string; opening: number }[] = [];
  const differs: { name: string; tb: number; masters: number }[] = [];
  let compared = 0;
  for (const m of masters) {
    const t = byName.get(m.name.toLowerCase());
    if (!t) { if (Math.abs(m.opening) >= 0.005) missingInTb.push({ name: m.name, opening: m.opening }); continue; }
    compared++;
    if (Math.abs(t.opening - m.opening) >= 0.005) differs.push({ name: m.name, tb: t.opening, masters: m.opening });
  }
  return { ok: !missingInTb.length && !differs.length, compared, missingInTb, differs };
}

/** For the group-level comparison with the audited balance sheet: Tally's XML sign (credit positive) and the PRIMARY group as the parent. */
export function toMasterLedgers(tb: TrialBalance, masters: MasterRow[] = []): MasterLedger[] {
  const info = new Map(masters.map((m) => [m.name.toLowerCase(), m]));
  return tb.ledgers.map((l) => {
    const m = info.get(l.name.toLowerCase());
    return { name: l.name, parent: l.primary, opening: r2(-l.opening), gstin: m?.gstin ?? null, state: m?.state ?? null };
  });
}

/* ── things a CA looks at in the openings ──────────────── */

export interface OpeningFinding { kind: "old_year_ledger" | "profit_loss_balance" | "opening_difference" | "sign_against_group"; ledger: string; detail: string; amount: number }

/**
 * Findings the group comparison cannot show:
 *  - a ledger named for an earlier year that still carries a balance (old tax receivable, old advance) that should have been cleared or provided for;
 *  - the Profit & Loss A/c balance, which is not an opening balance of the new year;
 *  - a debtor with a credit opening or a creditor with a debit opening (advances or unadjusted receipts, worth a line in the working paper).
 */
export function openingFindings(tb: TrialBalance, fyStart: number): OpeningFinding[] {
  const out: OpeningFinding[] = [];
  const yearInName = /(?:fy|f\.y\.?)\s*(20\d{2})|(?:^|\D)(20\d{2})\s*-\s*(\d{2,4})(?:\D|$)/i;
  for (const l of tb.ledgers) {
    if (/^profit\s*&\s*loss a\/c$/i.test(l.name) && Math.abs(l.opening) >= 0.005) out.push({ kind: "profit_loss_balance", ledger: l.name, detail: "The Profit & Loss A/c carries a balance at 1 April. It is not part of the balance sheet comparison.", amount: l.opening });
    const m = yearInName.exec(l.name);
    const y = m ? Number(m[1] ?? m[2]) : null;
    if (y != null && y < fyStart - 1 && Math.abs(l.closing) >= 0.5) out.push({ kind: "old_year_ledger", ledger: l.name, detail: `Named for ${y} and still carries ${l.closing > 0 ? "a debit" : "a credit"} balance of ₹${Math.abs(l.closing).toLocaleString("en-IN")} at the close of the year.`, amount: l.closing });
    if (/^sundry debtors$/i.test(l.primary) && l.opening < -0.5) out.push({ kind: "sign_against_group", ledger: l.name, detail: "A debtor that opens with a credit balance: an advance or an unadjusted receipt.", amount: l.opening });
    if (/^sundry creditors$/i.test(l.primary) && l.opening > 0.5) out.push({ kind: "sign_against_group", ledger: l.name, detail: "A creditor that opens with a debit balance: an advance paid or an unadjusted payment.", amount: l.opening });
  }
  return out;
}

/** Closing balance of one ledger by name (case-insensitive), for the loops that need it. */
export const tbLedger = (tb: TrialBalance, name: string): TbLedger | undefined => tb.ledgers.find((l) => l.name.toLowerCase() === name.toLowerCase());
