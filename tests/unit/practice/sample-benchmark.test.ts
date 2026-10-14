/**
 * The figures on the home page come from this test: the public sample files
 * (/samples) run through the real extract → recon → MIS code, no AI, timed.
 * If the numbers drift, the home page claims must be updated with them.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runExtract } from "@/lib/practice/extract/pipeline";
import { reconcile, type ReconTxn } from "@/lib/practice/recon/engine";
import { computeFigures, type NarrateTxn } from "@/lib/practice/narrate/calc";
import type { ExtractedRow } from "@/lib/practice/core";

async function rows(path: string, side: "bank" | "books"): Promise<ExtractedRow[]> {
  const bytes = new Uint8Array(readFileSync(`public/samples/${path}`));
  const out = await runExtract({ bytes, filename: path.split("/").pop()!, mime: null, side, businessId: null }, { llm: null });
  return (out as { rows?: ExtractedRow[] }).rows ?? [];
}

const toTxn = (side: "bank" | "books") => (r: ExtractedRow, i: number): ReconTxn => ({
  id: `${side}-${i}`,
  side,
  direction: r.direction ?? "out",
  amount: r.amount ?? 0,
  txn_date: r.date ?? "",
  counterparty: r.counterparty,
  reference: r.reference,
  description: r.description,
  category: r.category,
});

const PAIRS: [string, string][] = [
  ["hdfc_statement_sep2026.csv", "tally_daybook_sep2026.xml"],
  ["retest/R01_hdfc_bank_statement_jul2026.csv", "retest/R02_bank_ledger_tally_jul2026.csv"],
  ["retest/R12_hdfc_bank_statement_aug2026.csv", "retest/R13_tally_ledger_aug2026.csv"],
];

describe("sample-file benchmark", () => {
  it("reconciles and drafts the MIS for each sample client-month in under a second", async () => {
    let bankLines = 0;
    let matched = 0;
    const times: number[] = [];
    for (const [b, k] of PAIRS) {
      const t0 = performance.now();
      const bank = (await rows(b, "bank")).map(toTxn("bank"));
      const books = (await rows(k, "books")).map(toTxn("books"));
      const r = reconcile(bank, books);
      const ids = new Set(r.matches.map((m) => m.bank_txn_id));
      const matchedTxns = bank.filter((t) => ids.has(t.id)) as unknown as NarrateTxn[];
      computeFigures(matchedTxns, [], bank as unknown as NarrateTxn[]);
      times.push(performance.now() - t0);
      bankLines += r.stats.bank_count;
      matched += r.stats.matched;
      console.log(`[bench] ${b}: ${r.stats.bank_count} bank lines, ${r.stats.matched} matched, ${r.stats.exceptions} exceptions, ${Math.round(times.at(-1)!)} ms`);
    }
    const rate = matched / bankLines;
    console.log(`[bench] total ${bankLines} bank lines, ${matched} auto-matched (${Math.round(rate * 100)}%), slowest month ${Math.round(Math.max(...times))} ms`);
    // The samples carry deliberate problems (returned cheque, unknown payer), so many lines are meant to be exceptions.
    expect(rate).toBeGreaterThan(0.6);
    expect(Math.max(...times)).toBeLessThan(1000);
  });
});
