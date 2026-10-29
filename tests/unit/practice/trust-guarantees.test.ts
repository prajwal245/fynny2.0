/**
 * The three promises the product makes to a CA, as tests:
 *  1. Figures come from code; AI text that cites unknown transactions or invents numbers is rejected.
 *  2. Doubt goes to a person: ambiguous or inconsistent lines become exceptions, never silent matches.
 *  3. Learned answers are suggestions: memory never moves a line out of review by itself.
 */
import { describe, expect, it } from "vitest";
import { reconcile, type ReconTxn } from "@/lib/practice/recon/engine";
import { computeFigures, type NarrateTxn } from "@/lib/practice/narrate/calc";
import { validateInsights } from "@/lib/practice/narrate/insights";

const nt = (id: string, amount: number, direction: "in" | "out", party: string): NarrateTxn => ({
  id, side: "bank", direction, amount, txn_date: "2025-08-10", counterparty: party, description: party, category: null, reference: null, balance: null, row_index: 0, extraction_id: null,
});
const matched = [nt("a", 100000, "in", "Kaveri Textiles"), nt("b", 40000, "out", "Mandi Steel")];
const figures = computeFigures(matched, [], matched);

describe("1. figures are code, AI text is checked", () => {
  const check = (text: string, ids = ["a"]) => validateInsights({ insights: [{ text, cited_transaction_ids: ids }] }, figures, matched);

  it("accepts a sentence that cites a real transaction and quotes real figures", () => {
    expect(check("Receipts of ₹1,00,000 came from Kaveri Textiles.").accepted).toHaveLength(1);
  });
  it("rejects an invented total, a made-up percentage and an unknown transaction id", () => {
    expect(check("Receipts were ₹3,50,000 this month.").accepted).toHaveLength(0);
    expect(check("Receipts grew 73% over last month.").accepted).toHaveLength(0);
    expect(check("Kaveri paid on time.", ["zzz"]).accepted).toHaveLength(0);
  });
  it("rejects a sentence with no citation at all", () => {
    expect(validateInsights({ insights: [{ text: "Business looks healthy." }] }, figures, matched).accepted).toHaveLength(0);
  });
  it("the MIS totals are plain sums of matched lines, whatever the AI says", () => {
    expect(figures.numbers.total_receipts?.value).toBe(100000);
    expect(figures.numbers.total_payments?.value).toBe(40000);
  });
  it("garbage from the AI yields nothing, not an error", () => {
    expect(validateInsights(null, figures, matched).accepted).toEqual([]);
    expect(validateInsights({ insights: "nope" }, figures, matched).accepted).toEqual([]);
  });
});

describe("2. doubt becomes an exception", () => {
  const t = (o: Partial<ReconTxn> & { id: string; side: "bank" | "books" }): ReconTxn => ({
    direction: "out", amount: 50000, txn_date: "2025-08-10", counterparty: "Mandi Steel", reference: null, description: "Mandi Steel", category: null, ...o,
  });

  it("two equally good book entries for one bank line is a duplicate suspect, not a pick", () => {
    const r = reconcile(
      [t({ id: "b", side: "bank", reference: "SIP/511" })],
      [t({ id: "k1", side: "books", reference: "SIP/511" }), t({ id: "k2", side: "books", reference: "SIP/511" })],
    );
    // The two identical book entries are flagged for a person; they are never both consumed silently.
    expect(r.exceptions.some((e) => e.reason_code === "duplicate_suspect")).toBe(true);
    expect(r.stats.matched).toBeLessThanOrEqual(1);
  });
  it("a different amount for the same party is an exception to decide, never a match", () => {
    const r = reconcile([t({ id: "b", side: "bank", amount: 50000 })], [t({ id: "k", side: "books", amount: 45000 })]);
    expect(r.stats.matched).toBe(0);
    expect(r.exceptions.length).toBeGreaterThan(0);
  });
  it("an amount-only coincidence between strangers is not matched", () => {
    const r = reconcile([t({ id: "b", side: "bank", counterparty: "Ravi Traders", description: "Ravi Traders" })], [t({ id: "k", side: "books", txn_date: "2025-08-13", counterparty: "Omega Steels", description: "Omega Steels" })]);
    expect(r.stats.matched).toBe(0);
  });
  it("every bank and book line is either matched or an exception: nothing disappears", () => {
    const bank = [t({ id: "b1", side: "bank" }), t({ id: "b2", side: "bank", amount: 777, counterparty: "X", description: "X" })];
    const books = [t({ id: "k1", side: "books" }), t({ id: "k2", side: "books", amount: 999, counterparty: "Y", description: "Y" })];
    const r = reconcile(bank, books);
    const seen = new Set([...r.matches.flatMap((m) => [m.bank_txn_id, ...m.book_txn_ids]), ...r.exceptions.map((e) => e.txn_id)]);
    for (const id of ["b1", "b2", "k1", "k2"]) expect(seen.has(id)).toBe(true);
  });
});
