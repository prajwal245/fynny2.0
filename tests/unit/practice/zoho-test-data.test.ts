import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain script, no types
import { buildDataset, render } from "../../../scripts/zoho-test-data.mjs";
import { runExtract } from "@/lib/practice/extract/pipeline";
import { reconcile, type ReconTxn } from "@/lib/practice/recon/engine";
import { validGstin } from "@/lib/practice/india";
import type { ExtractedRow } from "@/lib/practice/core";

const d = buildDataset();

async function rows(file: string, side: "bank" | "books"): Promise<ExtractedRow[]> {
  const bytes = new Uint8Array(readFileSync(`public/samples/zoho-test/${file}`));
  const out = await runExtract({ bytes, filename: file, mime: null, side, businessId: null }, { llm: null });
  return (out as { rows?: ExtractedRow[] }).rows ?? [];
}
const toTxn = (side: "bank" | "books") => (r: ExtractedRow, i: number): ReconTxn => ({ id: `${side}-${i}`, side, direction: r.direction ?? "out", amount: r.amount ?? 0, txn_date: r.date ?? "", counterparty: r.counterparty, reference: r.reference, description: r.description, category: r.category });

describe("Zoho test data", () => {
  it("has the requested shape", () => {
    expect(d.customers).toHaveLength(5);
    expect(d.invoices).toHaveLength(10);
    expect(d.invoices.filter((i: { status: string }) => i.status === "Unpaid")).toHaveLength(5);
    expect(d.invoices.filter((i: { status: string }) => i.status === "Partially paid")).toHaveLength(5);
    expect(d.bills).toHaveLength(5);
    expect(d.bank).toHaveLength(10);
  });

  it("uses GSTINs that pass the check-character test", () => {
    for (const p of [...d.customers, ...d.vendors]) expect(validGstin(p.gstin), p.name).toBe(true);
  });

  it("is internally consistent: totals, balances and the bank's running balance", () => {
    for (const i of d.invoices) {
      expect(Math.round((i.taxable + i.tax) * 100)).toBe(Math.round(i.total * 100));
      expect(Math.round((i.total - i.paid) * 100)).toBe(Math.round(i.balance * 100));
    }
    const net = d.bank.reduce((n: number, e: { dir: string; amount: number }) => n + (e.dir === "in" ? e.amount : -e.amount), d.opening);
    expect(Math.round(net * 100)).toBe(Math.round(d.closing * 100));
  });

  it("is what is written to the sample folder", () => {
    for (const [name, text] of Object.entries(render(d))) expect(readFileSync(`public/samples/zoho-test/${name}`, "utf8"), name).toBe(text);
  });

  it("reconciles in FynHelp: 8 matched, 2 exceptions (the unrecorded receipt and the bank charge)", async () => {
    const bank = (await rows("bank_statement_sep2026.csv", "bank")).map(toTxn("bank"));
    const books = (await rows("books_bank_ledger_sep2026.csv", "books")).map(toTxn("books"));
    expect(bank).toHaveLength(10);
    expect(books).toHaveLength(8);
    const r = reconcile(bank, books);
    expect(r.stats.matched).toBe(8);
    expect(r.stats.exceptions).toBe(2);
    const matched = new Set(r.matches.map((m) => m.bank_txn_id));
    const left = bank.filter((t) => !matched.has(t.id)).map((t) => t.amount).sort((a, b) => a - b);
    expect(left).toEqual([590, 12500]);
  });
});
