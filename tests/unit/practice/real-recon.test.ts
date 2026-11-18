/**
 * Reconciliation on real files: a client's bank statements against its Tally books. Only runs when REAL_STATEMENTS points at a
 * folder (nothing is committed). Names: bank files `Client||anything.pdf`; books files `Client||BOOKS||anything.xlsx`.
 * It reports how many bank lines stay unmatched although the books have an entry with the same date and amount, which is the
 * number a person doing the reconciliation by hand sees.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { memoryDb } from "../../helpers/memoryDb";

vi.mock("@/lib/practice/orchestrator.server", () => ({
  startRun: async () => "run1", finishRun: async () => undefined, afterExtraction: async () => ({ pipeline: [] }),
  afterRecon: async () => false, loadMemories: async () => [], markMemoriesApplied: async () => undefined, teachFromReview: async () => undefined,
}));
vi.mock("@/lib/practice/llm.server", () => ({ practiceLlm: () => null, withinAiCap: async () => false }));
vi.mock("@/lib/practice/ocr.server", () => ({ practiceOcr: () => null }));

const REAL = process.env["REAL_STATEMENTS"];
const FIRM = "f1";
const BUSINESS = "b1";
type Row = Record<string, unknown>;

export async function reconCase(client: string, bankFiles: string[], bookFiles: string[], range: { start: string; end: string }) {
  const all = [...bankFiles.map((f) => ({ f, side: "bank" })), ...bookFiles.map((f) => ({ f, side: "books" }))];
  const docs = all.map((x, i) => ({ id: `d${i + 1}`, ca_firm_id: FIRM, business_id: BUSINESS, original_filename: x.f, storage_path: `${FIRM}/${BUSINESS}/${i}-${x.f}`, side: x.side, extract_status: null, extract_attempts: 0, extracted: { source: x.side === "books" ? "Tally" : "Manual" }, uploaded_by: "u1" }));
  const blobs = Object.fromEntries(all.map((x, i) => [`${FIRM}/${BUSINESS}/${i}-${x.f}`, new Uint8Array(readFileSync(`${REAL}/${x.f}`))]));
  const { db, tables } = memoryDb({ ca_document_extractions: docs, ca_clients: [{ id: "row1", business_id: BUSINESS, ca_firm_id: FIRM, client_name: client }] }, blobs);
  const { processExtraction } = await import("@/lib/practice/documents.server");
  for (const d of docs) await processExtraction(db, d.id, { trigger: "user", userId: "u1" });
  const { runRecon } = await import("@/lib/practice/recon.server");
  const ctx = { firmId: FIRM, firmName: "Firm", firmEmail: null, userId: "u1", role: "owner" as const };
  const summary = await runRecon(db, ctx, BUSINESS, range);
  const txns = (tables["ca_txns"] ?? []) as Row[];
  // Only the month the run covered.
  const inRange = (t: Row) => String(t["txn_date"]).slice(0, 10) >= range.start && String(t["txn_date"]).slice(0, 10) <= range.end;
  const bank = txns.filter((t) => t["side"] === "bank" && inRange(t));
  const books = txns.filter((t) => t["side"] === "books" && inRange(t));
  const open = bank.filter((t) => t["match_status"] === "exception" || t["match_status"] === "unmatched");
  // Unmatched bank lines with an unmatched book entry of the same date, direction and amount: any one-to-one pairing is right.
  const bookKeys = new Map<string, number>();
  for (const b of books.filter((b) => b["match_status"] !== "matched" && b["match_status"] !== "ignored")) {
    const k = `${String(b["txn_date"]).slice(0, 10)}|${b["direction"]}|${Number(b["amount"]).toFixed(2)}`;
    bookKeys.set(k, (bookKeys.get(k) ?? 0) + 1);
  }
  let pairable = 0;
  for (const t of open) {
    const k = `${String(t["txn_date"]).slice(0, 10)}|${t["direction"]}|${Number(t["amount"]).toFixed(2)}`;
    if ((bookKeys.get(k) ?? 0) > 0) {
      pairable++;
      bookKeys.set(k, bookKeys.get(k)! - 1);
    }
  }
  const left = open.map((t) => `${String(t["txn_date"]).slice(0, 10)} ${t["direction"]} ${Number(t["amount"]).toFixed(2)} ${String(t["description"]).slice(0, 48)}`);
  const openBooks = books.filter((b) => b["match_status"] === "exception" || b["match_status"] === "unmatched");
  const byLedger = new Map<string, number>();
  for (const b of openBooks) { const m = /\(([^()]*\d{4}[^()]*)\)/.exec(String(b["description"])); const k = m ? m[1]! : "(no bank ledger)"; byLedger.set(k, (byLedger.get(k) ?? 0) + 1); }
  const bookLeft = [...byLedger.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${n} × ${k}`);
  const noLedger = openBooks.filter((b) => !/\(([^()]*\d{4}[^()]*)\)/.test(String(b["description"]))).slice(0, 6).map((b) => `${String(b["txn_date"]).slice(0, 10)} ${b["direction"]} ${Number(b["amount"]).toFixed(2)} ${String(b["description"]).slice(0, 70)}`);
  return { txns, noLedger, bookLeft, left, summary, bank: bank.length, books: books.length, matched: bank.filter((t) => t["match_status"] === "matched").length, open: open.length, pairable, ignored: bank.filter((t) => t["match_status"] === "ignored").length };
}

describe.skipIf(!REAL || !existsSync(REAL ?? ""))("reconciliation on real statements and Tally books", { timeout: 600_000 }, () => {
  const has = (re: RegExp) => (REAL ? readdirSync(REAL).find((f) => re.test(f)) : undefined);
  it("Satkaarika: Indian Bank CA 7856871247 against the Day Book", async () => {
    const bank = has(/Satkaarika.*\|\|IndianBank_7856/);
    const books = has(/Satkaarika.*\|\|BOOKS\|\|.*DayBook/);
    if (!bank || !books) return;
    const r = await reconCase("Satkaarika Enterprises", [bank], [books], { start: "2025-04-01", end: "2026-03-31" });
    console.log(`   Satkaarika: bank ${r.bank}, books ${r.books}, matched ${r.matched}, open ${r.open}, ignored ${r.ignored}, open with an identical book entry ${r.pairable}`);
    console.log(`   run: ${r.summary.message}`);
    for (const l of r.left) console.log(`   open: ${l}`);
    for (const n of r.noLedger) console.log(`   no-ledger: ${n}`);
    console.log(`   open book entries by bank ledger: ${r.bookLeft.join(" | ")}`);
    expect(r.pairable).toBeLessThanOrEqual(0);
  });
  it("SSSL: ICICI 1053 and HDFC 2932 against a Day Book that covers five banks, for May 2025", async () => {
    const icici = has(/Sri Satyanarayana.*\|\|ICICI_1053_AprJun25/);
    const hdfc = has(/Sri Satyanarayana.*\|\|HDFC_2932/);
    const books = has(/Sri Satyanarayana.*\|\|BOOKS\|\|/);
    if (!icici || !hdfc || !books) return;
    const r = await reconCase("Sri Satyanarayana Swamy Logistics", [icici, hdfc], [books], { start: "2025-05-01", end: "2025-05-31" });
    console.log(`   SSSL May: bank ${r.bank}, matched ${r.matched}, open ${r.open}, open with an identical book entry ${r.pairable}`);
    console.log(`   run: ${r.summary.message}`);
    console.log(`   open book entries by bank ledger: ${r.bookLeft.join(" | ")}`);
    for (const l of r.left.slice(0, 14)) console.log(`   open: ${l}`);
    expect(r.pairable).toBeLessThanOrEqual(2);
  });
  it("SSSL as a bank-only client: statements alone for May, no books", async () => {
    const icici = has(/Sri Satyanarayana.*\|\|ICICI_1053_AprJun25/);
    const hdfc = has(/Sri Satyanarayana.*\|\|HDFC_2932/);
    if (!icici || !hdfc) return;
    const r = await reconCase("Sri Satyanarayana Swamy Logistics", [icici, hdfc], [], { start: "2025-05-01", end: "2025-05-31" });
    console.log(`   bank-only May: ${r.summary.message}`);
    expect(r.summary.bank_only).toBe(true);
    expect(r.summary.exceptions).toBe(0);
    expect(r.summary.run_id).toBeTruthy();
  });
});
