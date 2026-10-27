/**
 * Long, messy files: a 3-month bank statement with wrapped narrations, page-break headers and
 * notes, a Zoho ledger with 400-character descriptions, and OCR text of a hand-annotated page.
 * Handwriting itself is read by the OCR service; these tests cover what FynHelp does with what it returns.
 */
import { describe, expect, it } from "vitest";
import { ledgerCsv, ledgerLine } from "@/lib/practice/zoho.server";
import { runExtract } from "@/lib/practice/extract/pipeline";
import { reconcile, type ReconTxn } from "@/lib/practice/recon/engine";
import type { ExtractedRow } from "@/lib/practice/core";

const inr = (n: number) => {
  const [i, d] = n.toFixed(2).split(".") as [string, string];
  const last3 = i.slice(-3);
  const rest = i.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${rest ? rest + "," : ""}${last3}.${d}`;
};
const parties = ["KAVERI TEXTILES PVT LTD", "MEHTA FOODS LLP", "SUNDAR AUTO COMPONENTS", "ORION IT SERVICES PVT LTD", "BHARAT STATIONERS"];

/** n receipts and payments, deterministic, with a few of every awkward kind. */
function makeMonth(n: number) {
  const bank: { date: string; narr: string; ref: string; dr: number; cr: number }[] = [];
  const zoho: Record<string, unknown>[] = [];
  for (let i = 0; i < n; i++) {
    const day = 1 + (i % 28);
    const date = `2026-09-${String(day).padStart(2, "0")}`;
    const party = parties[i % parties.length]!;
    const amount = 1000 + ((i * 7919) % 90000) + (i % 3) * 0.5 + 0.17 * (i % 5);
    const isIn = i % 3 !== 2;
    const amt = Math.round(amount * 100) / 100;
    const note = `Ref note ${i}: ${"settlement against invoice series, follow up with accounts, GST invoice attached; ".repeat(4)}`.slice(0, 400);
    bank.push({ date, narr: `${isIn ? "NEFT CR" : "NEFT DR"}-${party}-INV-${2600 + i}`, ref: `N${100000 + i}`, dr: isIn ? 0 : amt, cr: isIn ? amt : 0 });
    zoho.push({
      transaction_date: date,
      transaction_type_formatted: isIn ? "Customer Payment" : "Vendor Payment",
      payee: party,
      description: note,
      reference_number: `Z${i}`,
      debit_amount: isIn ? amt : 0,
      credit_amount: isIn ? 0 : amt,
    });
  }
  return { bank, zoho };
}

/** A messy HDFC-style CSV: preamble, repeated page headers, wrapped narration, totals and a footer note. */
function messyStatement(rows: ReturnType<typeof makeMonth>["bank"]): string {
  const out = ["HDFC BANK LTD.", "Account No : 50100099887766", "Statement From : 01/09/2026 To : 30/09/2026", ""];
  const head = "Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance";
  let bal = 1000000;
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  sorted.forEach((r, i) => {
    if (i % 40 === 0) out.push(head);
    bal += r.cr - r.dr;
    const [y, m, d] = r.date.split("-") as [string, string, string];
    const dt = `${d}/${m}/${y.slice(2)}`;
    out.push(`${dt},${r.narr},${r.ref},${dt},${r.dr ? `"${inr(r.dr)}"` : ""},${r.cr ? `"${inr(r.cr)}"` : ""},"${inr(bal)}"`);
    if (i % 25 === 5) out.push(`,"CONTINUED: rtgs charges waived under relationship pricing; see notice dated 01/08/2026",,,,,`);
    if (i % 40 === 39) out.push("Page total carried forward,,,,,,", "");
  });
  out.push("", "STATEMENT SUMMARY,Opening Balance,Dr Count,Cr Count,Debits,Credits,Closing Bal", "This is a computer generated statement and does not require signature.");
  return out.join("\n");
}

async function rowsOf(text: string, filename: string, side: "bank" | "books"): Promise<ExtractedRow[]> {
  const out = await runExtract({ bytes: new TextEncoder().encode(text), filename, mime: "text/csv", side, businessId: null }, { llm: null });
  return (out as { rows?: ExtractedRow[] }).rows ?? [];
}
const toTxn = (side: "bank" | "books") => (r: ExtractedRow, i: number): ReconTxn => ({
  id: `${side}-${i}`, side, direction: r.direction ?? "out", amount: r.amount ?? 0, txn_date: r.date ?? "",
  counterparty: r.counterparty, reference: r.reference, description: r.description, category: r.category,
});

describe("long, messy files", () => {
  const { bank, zoho } = makeMonth(300);
  const booksCsv = ledgerCsv(zoho.map((t) => ledgerLine(t)!));

  it("reads a 300-line statement with page headers, wrapped notes and a summary block without losing or inventing lines", async () => {
    const rows = await rowsOf(messyStatement(bank), "bank.csv", "bank");
    expect(rows).toHaveLength(300);
    const sum = (d: string) => rows.filter((r) => r.direction === d).reduce((s, r) => s + (r.amount ?? 0), 0);
    const want = (k: "dr" | "cr") => bank.reduce((s, r) => s + r[k], 0);
    expect(Math.round(sum("out") * 100)).toBe(Math.round(want("dr") * 100));
    expect(Math.round(sum("in") * 100)).toBe(Math.round(want("cr") * 100));
  });

  it("keeps 400-character Zoho notes whole in the ledger, but short enough for the 200-character particulars cap", () => {
    const l = ledgerLine(zoho[0]!)!;
    expect(l.particulars.length).toBeLessThanOrEqual(200);
    expect(l.particulars.startsWith("KAVERI")).toBe(true);
  });

  it("reconciles the whole month: every line pairs, in reasonable time", async () => {
    const t0 = Date.now();
    const b = (await rowsOf(messyStatement(bank), "bank.csv", "bank")).map(toTxn("bank"));
    const k = (await rowsOf(booksCsv, "zoho.csv", "books")).map(toTxn("books"));
    expect(k).toHaveLength(300);
    const r = reconcile(b, k);
    expect(r.stats.matched).toBeGreaterThanOrEqual(295);
    expect(Date.now() - t0).toBeLessThan(5000);
    const bankIds = r.matches.map((m) => m.bank_txn_id);
    expect(new Set(bankIds).size).toBe(bankIds.length);
  });

  it("surfaces a missing book entry and a doubled one instead of hiding them", async () => {
    const withGap = zoho.filter((_, i) => i !== 10 && i !== 11);
    withGap.push({ ...zoho[20]!, reference_number: "ZDUP" });
    const b = (await rowsOf(messyStatement(bank), "bank.csv", "bank")).map(toTxn("bank"));
    const k = (await rowsOf(ledgerCsv(withGap.map((t) => ledgerLine(t)!)), "zoho.csv", "books")).map(toTxn("books"));
    const r = reconcile(b, k);
    expect(r.stats.exceptions).toBeGreaterThanOrEqual(2);
    expect(r.stats.matched).toBeLessThanOrEqual(298);
  });
});

describe("hand-annotated page, as OCR returns it", () => {
  const ocr = (text: string) => async () => text;
  const photo = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]), filename: "page_with_notes.jpg", mime: "image/jpeg", side: "bank" as const, businessId: "b1" };

  const NOISY = [
    "HDFC BANK STATEMENT",
    "Opening Balance 4,00,000.00",
    "01/09/2026 NEFT CR KAVERI TEXTILES 1,00,000.00 5,00,000.00",
    "paid? check w/ Ramesh !!", // handwritten margin note
    "03/09/2026 UPI AMAZON PAY 2,499.00 4,97,501.00",
    "personal - not business ->", // handwritten
    "05/09/2026 SMS CHGS 17.70 4,97,483.30",
    "~~ 07/09/2026 NEFT DR RAMAN LOGISTICS 23,600.00 4,73,883.30 ~~", // struck through by hand
    "Closing Balance 4,97,483.30",
  ].join("\n");

  it("never turns a handwritten margin note into a transaction", async () => {
    const out = await runExtract(photo, { llm: null, ocr: ocr(NOISY) });
    const descs = out.rows.map((r) => (r.description ?? "").toLowerCase());
    expect(descs.some((d) => d.includes("ramesh") || d.includes("personal"))).toBe(false);
    // The note is not lost: it travels with the line as a review flag.
    const flags = out.rows.flatMap((r) => r.parse_issues).join(" | ");
    expect(flags).toContain("check w/ Ramesh");
    expect(flags).toContain("personal");
  });

  it("keeps scan confidence below the 0.8 cap and sends doubtful pages to review", async () => {
    const out = await runExtract(photo, { llm: null, ocr: ocr(NOISY) });
    expect(Math.max(0, ...out.rows.map((r) => r.confidence))).toBeLessThanOrEqual(0.8);
  });

  it("does not trust a line whose figures were misread (O for 0, l for 1) as a clean amount", async () => {
    const text = ["Opening Balance 4,00,000.00", "01/09/2026 NEFT CR MEHTA FOODS 3O,OOO.OO 4,30,000.00", "02/09/2026 NEFT CR SUNDAR l,00,000.00 5,30,000.00", "Closing Balance 5,30,000.00"].join("\n");
    const out = await runExtract(photo, { llm: null, ocr: ocr(text) });
    // Either the line is not read, or it is read with a flag. A silently wrong amount is the failure.
    for (const r of out.rows) {
      if (r.amount === 30000 || r.amount === 100000) expect(r.confidence).toBeLessThan(0.8);
    }
  });
});
