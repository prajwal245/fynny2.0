/**
 * Edge cases taken from the live Zoho Books test organisation (FYNHELP TEST DATA):
 * the five customer payments below are exactly what Zoho returned for them, pushed
 * through FynHelp's Zoho ledger -> Extract -> Recon path against the bank statement.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ledgerCsv, ledgerLine, type LedgerLine } from "@/lib/practice/zoho.server";
import { runExtract } from "@/lib/practice/extract/pipeline";
import { reconcile, type ReconTxn } from "@/lib/practice/recon/engine";
import type { ExtractedRow } from "@/lib/practice/core";

// The bank-account ledger as /chartofaccounts/transactions presents customer payments (debit = money in).
const zohoPayments = [
  { date: "2026-09-12", payee: "Kaveri Textiles Pvt Ltd", reference_number: "RTGS000001", amount: 100000, inv: "INV-2601" },
  { date: "2026-09-15", payee: "Mehta Foods LLP", reference_number: "NEFT000003", amount: 30000, inv: "INV-2602" },
  { date: "2026-09-18", payee: "Sundar Auto Components", reference_number: "NEFT000004", amount: 50000, inv: "INV-2603" },
  { date: "2026-09-20", payee: "Orion IT Services Pvt Ltd", reference_number: "RTGS000005", amount: 100000, inv: "INV-2604" },
  { date: "2026-09-24", payee: "Mehta Foods LLP", reference_number: "NEFT000007", amount: 25000, inv: "INV-2607" },
].map((p) => ({
  transaction_date: p.date,
  transaction_type: "customer_payment",
  transaction_type_formatted: "Customer Payment",
  payee: p.payee,
  description: `FYNHELP TEST DATA part payment of ${p.inv}`,
  reference_number: p.reference_number,
  debit_amount: p.amount,
  credit_amount: 0,
}));

async function rowsOf(text: string, filename: string, side: "bank" | "books"): Promise<ExtractedRow[]> {
  const out = await runExtract({ bytes: new TextEncoder().encode(text), filename, mime: "text/csv", side, businessId: null }, { llm: null });
  return (out as { rows?: ExtractedRow[] }).rows ?? [];
}
const toTxn = (side: "bank" | "books") => (r: ExtractedRow, i: number): ReconTxn => ({
  id: `${side}-${i}`, side, direction: r.direction ?? "out", amount: r.amount ?? 0, txn_date: r.date ?? "",
  counterparty: r.counterparty, reference: r.reference, description: r.description, category: r.category,
});
const bankStatement = () => readFileSync("public/samples/zoho-test/bank_statement_sep2026.csv", "utf8");
const lines = (raw: Record<string, unknown>[]) => raw.map((t) => ledgerLine(t)).filter((l): l is LedgerLine => !!l);

describe("live Zoho samples through the Zoho -> Extract -> Recon path", () => {
  it("turns Zoho's customer payments into money-in ledger lines with the customer as the party", () => {
    const l = lines(zohoPayments);
    expect(l).toHaveLength(5);
    expect(l.every((x) => x.moneyIn > 0 && x.moneyOut === 0)).toBe(true);
    expect(l[0]).toMatchObject({ date: "2026-09-12", particulars: expect.stringContaining("Kaveri Textiles"), type: "Customer Payment", number: "RTGS000001" });
  });

  it("matches all five Zoho receipts to the bank deposits even though Zoho's references differ from the bank's", async () => {
    const books = (await rowsOf(ledgerCsv(lines(zohoPayments)), "zoho.csv", "books")).map(toTxn("books"));
    const bank = (await rowsOf(bankStatement(), "bank.csv", "bank")).map(toTxn("bank"));
    const r = reconcile(bank, books);
    expect(books).toHaveLength(5);
    expect(r.stats.matched).toBe(5);
  });

  it("matches a receipt the books recorded a day or two after the bank credit", async () => {
    const late = zohoPayments.map((p, i) => (i === 1 ? { ...p, transaction_date: "2026-09-17" } : p));
    const books = (await rowsOf(ledgerCsv(lines(late)), "zoho.csv", "books")).map(toTxn("books"));
    const bank = (await rowsOf(bankStatement(), "bank.csv", "bank")).map(toTxn("bank"));
    expect(reconcile(bank, books).stats.matched).toBe(5);
  });

  it("leaves the unrecorded UPI deposit and the bank charge as exceptions, never silently matched", async () => {
    const books = (await rowsOf(ledgerCsv(lines(zohoPayments)), "zoho.csv", "books")).map(toTxn("books"));
    const bank = (await rowsOf(bankStatement(), "bank.csv", "bank")).map(toTxn("bank"));
    const r = reconcile(bank, books);
    const matched = new Set(r.matches.map((m) => m.bank_txn_id));
    const left = bank.filter((t) => !matched.has(t.id)).map((t) => t.amount);
    expect(left).toEqual(expect.arrayContaining([12500, 590]));
  });

  it("does not match two same-amount receipts to one bank line", async () => {
    // Kaveri's and Orion's 1,00,000 payments are the same amount on different days: each bank credit takes one.
    const books = (await rowsOf(ledgerCsv(lines(zohoPayments)), "zoho.csv", "books")).map(toTxn("books"));
    const bank = (await rowsOf(bankStatement(), "bank.csv", "bank")).map(toTxn("bank"));
    const r = reconcile(bank, books);
    const bankIds = r.matches.map((m) => m.bank_txn_id);
    const bookIds = r.matches.flatMap((m) => m.book_txn_ids);
    expect(new Set(bankIds).size).toBe(bankIds.length);
    expect(new Set(bookIds).size).toBe(bookIds.length);
  });

  it("pairs two same-day, same-amount receipts by customer, not by order", async () => {
    const day = zohoPayments.map((p) => (p.payee.startsWith("Kaveri") || p.payee.startsWith("Orion") ? { ...p, transaction_date: "2026-09-19" } : p));
    // Books list Orion first; the bank lists Kaveri first.
    const ordered = [day[3]!, day[0]!];
    const books = (await rowsOf(ledgerCsv(lines(ordered)), "zoho.csv", "books")).map(toTxn("books"));
    const bankCsv = "Date,Narration,Chq./Ref.No.,Withdrawal Amt.,Deposit Amt.,Closing Balance\n19/09/26,NEFT CR-KAVERI TEXTILES PVT LTD-INV-2601,N1,,\"1,00,000.00\",\"1,00,000.00\"\n19/09/26,NEFT CR-ORION IT SERVICES PVT LTD-INV-2604,N2,,\"1,00,000.00\",\"2,00,000.00\"\n";
    const bank = (await rowsOf(bankCsv, "bank.csv", "bank")).map(toTxn("bank"));
    const r = reconcile(bank, books);
    expect(r.stats.matched).toBe(2);
    const bankName = (id: string) => bank.find((t) => t.id === id)?.description ?? "";
    const bookName = (id: string) => books.find((t) => t.id === id)?.description ?? "";
    for (const m of r.matches) expect(bankName(m.bank_txn_id).toUpperCase()).toContain(bookName(m.book_txn_ids[0]!).split(" ")[0]!.toUpperCase());
  });

  it("copes with Zoho's odd shapes: strings with commas, refunds as credits, nothing amount, bad dates", () => {
    expect(ledgerLine({ transaction_date: "2026-09-26", payee: "Mehta Foods LLP", transaction_type: "customer_refund", debit_amount: "0.00", credit_amount: "1,500.00" })).toMatchObject({ moneyOut: 1500, moneyIn: 0 });
    expect(ledgerLine({ transaction_date: "2026-09-26", debit_amount: 0, credit_amount: 0 })).toBeNull();
    expect(ledgerLine({ transaction_date: "26/09/2026", debit_amount: 10 })).toBeNull();
    expect(ledgerLine({ transaction_date: "2026-09-26T00:00:00+0530", debit_amount: 10 })?.date).toBe("2026-09-26");
    // A transfer between two of the firm's own accounts has no payee: still a usable line.
    expect(ledgerLine({ transaction_date: "2026-09-27", transaction_type: "transfer_fund", transaction_type_formatted: "Transfer Fund", credit_amount: 305000 })?.particulars).toBe("Transfer Fund");
  });

  it("keeps a customer name with a comma, quote or Unicode intact through the CSV", async () => {
    const odd = [{ transaction_date: "2026-09-12", payee: 'Sri "Lakshmi" Traders, Pune – ₹ & Sons', debit_amount: 4200, credit_amount: 0, reference_number: "R,1" }];
    const rows = await rowsOf(ledgerCsv(lines(odd)), "zoho.csv", "books");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.amount).toBe(4200);
    expect(JSON.stringify(rows[0])).toContain("Lakshmi");
  });
});
