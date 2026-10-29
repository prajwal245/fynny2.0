/** Recon must stay near-linear: a big client's month cannot time out a serverless call. */
import { describe, expect, it } from "vitest";
import { reconcile, type ReconTxn } from "@/lib/practice/recon/engine";

const parties = ["KAVERI TEXTILES", "MEHTA FOODS", "SUNDAR AUTO", "ORION IT", "BHARAT STATIONERS", "RAMAN LOGISTICS", "GILL AGRO", "SHIVALIK ISPAT"];
function month(n: number) {
  const bank: ReconTxn[] = [];
  const books: ReconTxn[] = [];
  for (let i = 0; i < n; i++) {
    const date = `2026-09-${String(1 + (i % 28)).padStart(2, "0")}`;
    const amount = Math.round((1000 + ((i * 7919) % 90000) + (i % 7) * 0.37) * 100) / 100;
    const p = parties[i % parties.length]!;
    const direction = i % 3 ? "in" : "out";
    bank.push({ id: `b${i}`, side: "bank", direction, amount, txn_date: date, counterparty: null, reference: `N${i}`, description: `NEFT ${p} INV-${i}`, category: null });
    if (i % 10 !== 0) books.push({ id: `k${i}`, side: "books", direction, amount, txn_date: date, counterparty: p, reference: `Z${i}`, description: p, category: null });
  }
  return { bank, books };
}

describe("recon speed", () => {
  it("settles 8,000 bank lines against 7,200 book entries in a few seconds, with the same answer", () => {
    const { bank, books } = month(8000);
    const t0 = Date.now();
    const r = reconcile(bank, books);
    expect(Date.now() - t0).toBeLessThan(4000); // was ~10 s before indexing
    expect(r.stats.matched).toBe(7200);
    expect(r.stats.exceptions).toBe(800);
  });
});
