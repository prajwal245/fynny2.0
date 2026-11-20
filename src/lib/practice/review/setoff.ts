/**
 * The month-end GST set-off entry against GSTR-3B table 6.1, and the reverse charge loop from the books.
 *
 * Set-off: the journal that debits the Output ledgers and credits the Input ledgers (and the payment ledger for cash) must say what
 * table 6.1 says: the tax payable by head, the credit used, and the cash paid. Credit used is checked in total and by head of credit:
 * credit of one head may only be used against its own liability, except IGST credit, which is used first and may go against any head.
 * A month with no set-off entry is reported, because Output and Input ledgers then carry balances that look like dues.
 *
 * Reverse charge: each month with RCM has four legs that must all be there and agree: the liability booked (RCM payable credited), the
 * cash paid (RCM payable cleared through the payment ledger), the credit claimed (RCM input debited) and the return (3.1(d) liability
 * and 4A(3) credit). RCM never appears in the portal's invoice view, so the books are the only place the liability can be checked.
 */
import type { Gstr3bPayment } from "../gst/reports";
import type { Gstr3bRead, TaxSplit } from "../gst/returns";
import { suggestLedgerMap, type Family } from "./ledgerMap";
import type { Voucher } from "./dayBook";

const r2 = (n: number) => Math.round(n * 100) / 100;
export const TOL = 1;
type Head = "igst" | "cgst" | "sgst" | "cess";
const HEADS: Head[] = ["igst", "cgst", "sgst", "cess"];
const zero = (): Record<Head, number> => ({ igst: 0, cgst: 0, sgst: 0, cess: 0 });

export interface LoopLine { label: string; books: number; portal: number; diff: number; ok: boolean }
export interface SetOffResult { month: string; entries: string[]; lines: LoopLine[]; ok: boolean; status: "agree" | "differs" | "no_entry" | "no_return"; summary: string }

const line = (label: string, books: number, portal: number): LoopLine => ({ label, books: r2(books), portal: r2(portal), diff: r2(books - portal), ok: Math.abs(books - portal) <= TOL });
const familyOf = (vouchers: Voucher[]) => {
  const names = [...new Set(vouchers.flatMap((v) => v.legs.map((l) => l.ledger)))];
  return new Map<string, { family: Family; head: Head | null }>(suggestLedgerMap(names.map((name) => ({ name }))).map((s) => [s.ledger, { family: s.family, head: s.gstHead }]));
};
const inMonth = (v: Voucher, month: string) => v.date.startsWith(month);

export function setOffCheck(vouchers: Voucher[], payment: Gstr3bPayment, month: string): SetOffResult {
  if (!payment.found) return { month, entries: [], lines: [], ok: false, status: "no_return", summary: "GSTR-3B table 6.1 for this month is not in the file." };
  const fam = familyOf(vouchers);
  const payable = zero(), credit = zero();
  let cash = 0;
  const entries: string[] = [];
  for (const v of vouchers.filter((x) => inMonth(x, month))) {
    // A set-off entry is a journal that debits an output ledger. A credit note also debits one (it reduces the liability) but it is a
    // document, not the month-end set-off, so it stays in the payable only through the return, not here.
    if (!/^(journal|contra)$/i.test(v.type)) continue;
    const out = v.legs.filter((l) => fam.get(l.ledger)?.family === "output_tax" && l.debit > 0);
    if (!out.length) continue;
    entries.push(`${v.type} ${v.no}`);
    for (const l of v.legs) {
      const f = fam.get(l.ledger);
      if (f?.family === "output_tax" && f.head) payable[f.head] += l.debit - l.credit;
      else if ((f?.family === "input_tax" || f?.family === "input_tax_carry_forward") && f.head) credit[f.head] += l.credit - l.debit;
      else if (f?.family === "gst_payment") cash += l.credit - l.debit;
    }
  }
  if (!entries.length) return { month, entries, lines: [], ok: false, status: "no_entry", summary: `No set-off entry (a journal debiting the Output GST ledgers) was found for ${month}, so the Output and Input ledgers will carry balances that look like dues.` };
  const lines: LoopLine[] = [];
  for (const h of HEADS) if (payable[h] || payment.payable[h]) lines.push(line(`Tax payable, ${h.toUpperCase()}`, payable[h], payment.payable[h]));
  const itcBooks = credit.igst + credit.cgst + credit.sgst + credit.cess;
  const itcPortal = payment.paidItc.igst + payment.paidItc.cgst + payment.paidItc.sgst + payment.paidItc.cess;
  lines.push(line("Credit used, all heads", itcBooks, itcPortal));
  lines.push(line("Cash paid", cash, payment.paidCash.igst + payment.paidCash.cgst + payment.paidCash.sgst + payment.paidCash.cess));
  // Use of credit by head: CGST credit only against CGST tax, SGST credit only against SGST tax, IGST credit against any.
  const rule: LoopLine[] = [];
  if (credit.cgst > payable.cgst + TOL) rule.push({ label: "CGST credit used above the CGST payable", books: r2(credit.cgst), portal: r2(payable.cgst), diff: r2(credit.cgst - payable.cgst), ok: false });
  if (credit.sgst > payable.sgst + TOL) rule.push({ label: "SGST credit used above the SGST payable", books: r2(credit.sgst), portal: r2(payable.sgst), diff: r2(credit.sgst - payable.sgst), ok: false });
  const ok = [...lines, ...rule].every((l) => l.ok);
  const bad = [...lines, ...rule].filter((l) => !l.ok);
  return { month, entries, lines: [...lines, ...rule], ok, status: ok ? "agree" : "differs", summary: ok ? `The set-off entry (${entries.join(", ")}) agrees to table 6.1: payable, credit used and cash.` : `The set-off entry (${entries.join(", ")}) differs from table 6.1 on: ${bad.map((l) => `${l.label} by ₹${Math.abs(l.diff).toLocaleString("en-IN")}`).join("; ")}.` };
}

export interface RcmResult { month: string; lines: LoopLine[]; ok: boolean; status: "agree" | "differs" | "none"; summary: string }

export function rcmLoop(vouchers: Voucher[], payment: Gstr3bPayment, g3b: Gstr3bRead, month: string): RcmResult {
  const fam = familyOf(vouchers);
  const booked = zero(), claimed = zero();
  let paid = 0;
  for (const v of vouchers.filter((x) => inMonth(x, month))) {
    const hasPayable = v.legs.some((l) => fam.get(l.ledger)?.family === "rcm_liability");
    for (const l of v.legs) {
      const f = fam.get(l.ledger);
      if (f?.family === "rcm_liability" && f.head) {
        booked[f.head] += l.credit;
        // The payable is cleared by a debit: that debit is the payment, whether it goes through the payment ledger or the bank.
        if (l.debit) paid += l.debit;
      } else if (f?.family === "rcm_input" && f.head) claimed[f.head] += l.debit - l.credit;
    }
    void hasPayable;
  }
  const bookedTotal = r2(booked.igst + booked.cgst + booked.sgst + booked.cess);
  const declared = r2(g3b.rcm.igst + g3b.rcm.cgst + g3b.rcm.sgst + g3b.rcm.cess);
  const paidPortal = r2(payment.rcmPaidCash.igst + payment.rcmPaidCash.cgst + payment.rcmPaidCash.sgst + payment.rcmPaidCash.cess);
  if (!bookedTotal && !declared && !paid) return { month, lines: [], ok: true, status: "none", summary: "No reverse charge in the books or in GSTR-3B this month." };
  const claimedTotal = r2(claimed.igst + claimed.cgst + claimed.sgst + claimed.cess);
  const claimed3b = r2(g3b.itcOnRcm.igst + g3b.itcOnRcm.cgst + g3b.itcOnRcm.sgst + g3b.itcOnRcm.cess);
  const lines = [
    line("Liability booked (RCM payable) against 3.1(d)", bookedTotal, declared),
    line("Cash paid (RCM payable cleared) against 6.1 cash", paid, paidPortal),
    line("Credit booked (RCM input) against 4A(3)", claimedTotal, claimed3b),
    line("Credit claimed equals the tax paid", claimedTotal, paid),
  ];
  for (const h of ["igst", "cgst", "sgst"] as Head[]) if (booked[h] || g3b.rcm[h]) lines.push(line(`Liability by head, ${h.toUpperCase()}`, booked[h], g3b.rcm[h]));
  const bad = lines.filter((l) => !l.ok);
  return { month, lines, ok: bad.length === 0, status: bad.length ? "differs" : "agree", summary: bad.length ? `Reverse charge differs on: ${bad.map((l) => `${l.label} by ₹${Math.abs(l.diff).toLocaleString("en-IN")}`).join("; ")}.` : "All four legs agree: liability booked, cash paid, credit claimed, and the return." };
}

export type { TaxSplit };
