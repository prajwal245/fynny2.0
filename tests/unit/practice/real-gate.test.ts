/**
 * The real-file regression gate. Runs only when REAL_STATEMENTS points at a folder of real client files (never committed), and
 * compares what the product does with them against tests/real-gate-expected.json, which holds COUNTS ONLY, never data.
 * A count that drops fails the gate. After an intended improvement, run with GATE_UPDATE=1 to record the new counts.
 *
 *   REAL_STATEMENTS=/path/to/folder npm run real:gate
 *   GATE_UPDATE=1 REAL_STATEMENTS=/path/to/folder npm run real:gate     (record new baselines)
 *
 * File names in the folder (the client is the part before "||"):
 *   Satkaarika||CA 7856871247.pdf, Satkaarika||BOOKS||Day Book.xlsx, Satkaarika||CA 8088091704.pdf, Satkaarika||CC 6407563276 Mar.pdf,
 *   Satkaarika||GECL loan.pdf, Satkaarika||Term loan.pdf, Satkaarika||Vehicle loan.pdf,
 *   SSSL||ICICI_1053_AprJun25.pdf, SSSL||HDFC_2932.pdf, SSSL||UBI_1967.pdf, SSSL||Kotak_3368.pdf, SSSL||BOOKS||DayBook.xlsx
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { memoryDb } from "../../helpers/memoryDb";
import { reconCase } from "./real-recon.test";

vi.mock("@/lib/practice/orchestrator.server", () => ({
  startRun: async () => "r", finishRun: async () => undefined, afterExtraction: async () => ({ pipeline: [] }),
  afterRecon: async () => false, loadMemories: async () => [], markMemoriesApplied: async () => undefined, teachFromReview: async () => undefined,
}));
vi.mock("@/lib/practice/llm.server", () => ({ practiceLlm: () => null, withinAiCap: async () => false }));
vi.mock("@/lib/practice/ocr.server", () => ({ practiceOcr: () => null }));

const REAL = process.env["REAL_STATEMENTS"];
const UPDATE = process.env["GATE_UPDATE"] === "1";
const EXPECTED = "tests/real-gate-expected.json";
type Counts = Record<string, Record<string, number | string | boolean>>;
const expected: Counts = existsSync(EXPECTED) ? JSON.parse(readFileSync(EXPECTED, "utf8")) : {};
const measured: Counts = {};
const has = (f: string) => Boolean(REAL && existsSync(`${REAL}/${f}`));

/** Reads one file alone, as a firm's upload would, with no AI. */
async function readOne(file: string) {
  const doc = { id: "d1", ca_firm_id: "f", business_id: "b", original_filename: file, storage_path: `f/b/${file}`, side: "bank", extract_status: null, extract_attempts: 0, extracted: { source: "Manual" }, uploaded_by: "u" };
  const { db, tables } = memoryDb({ ca_document_extractions: [doc], ca_clients: [{ id: "c", business_id: "b", ca_firm_id: "f", client_name: file.split("||")[0] }] }, { [`f/b/${file}`]: new Uint8Array(readFileSync(`${REAL}/${file}`)) });
  const { processExtraction } = await import("@/lib/practice/documents.server");
  const r = await processExtraction(db, "d1", { trigger: "user", userId: "u" });
  const d = (tables["ca_document_extractions"] as Record<string, unknown>[])[0]!;
  const ex = d["extracted"] as { statement_check?: { status: string; lines: number }; register?: { kind: string } };
  return { status: r.status, kind: String(d["classification"] ?? ""), lines: ex.statement_check?.lines ?? 0, check: ex.statement_check?.status ?? "none", register: ex.register?.kind ?? "" };
}

function record(key: string, got: Record<string, number | string | boolean>, floors: string[] = [], ceilings: string[] = [], equals: string[] = []) {
  measured[key] = got;
  if (UPDATE) return;
  const want = expected[key];
  expect(want, `no baseline for "${key}": run with GATE_UPDATE=1 once`).toBeTruthy();
  for (const k of floors) expect(got[k], `${key}.${k} dropped`).toBeGreaterThanOrEqual(want![k] as number);
  for (const k of ceilings) expect(got[k], `${key}.${k} rose`).toBeLessThanOrEqual(want![k] as number);
  for (const k of equals) expect(got[k], `${key}.${k} changed`).toBe(want![k]);
}

describe.skipIf(!REAL || !existsSync(REAL ?? ""))("real-file gate", { timeout: 900_000 }, () => {
  it.skipIf(!has("Satkaarika||CA 7856871247.pdf") || !has("Satkaarika||BOOKS||Day Book.xlsx"))("Satkaarika: Indian Bank CA 7856871247 against the Day Book, full year", async () => {
    const r = await reconCase("Satkaarika Enterprises", ["Satkaarika||CA 7856871247.pdf"], ["Satkaarika||BOOKS||Day Book.xlsx"], { start: "2025-04-01", end: "2026-03-31" });
    record("satkaarika_fy", { bank: r.bank, matched: r.matched, open: r.open }, ["matched"], ["open"], ["bank"]);
  });
  it.skipIf(!has("SSSL||UBI_1967.pdf") || !has("SSSL||BOOKS||DayBook.xlsx"))("RC-6 and determinism on SSSL May: the proof passes, and Start over gives the same matches", async () => {
    const r = await reconCase("Sri Satyanarayana Swamy Logistics", ["SSSL||ICICI_1053_AprJun25.pdf", "SSSL||HDFC_2932.pdf", "SSSL||UBI_1967.pdf", "SSSL||Kotak_3368.pdf"], ["SSSL||BOOKS||DayBook.xlsx"], { start: "2025-05-01", end: "2025-05-31" }, { startOver: true });
    console.log(`   RC-6 SSSL May: proof ${r.proofOk ? "passes" : "FAILS"}; start over ${r.restart?.first} then ${r.restart?.second} matched`, r.proofFailed);
    expect(r.proofOk, r.proofFailed.join(" | ")).toBe(true);
    expect(r.restart?.same, `start over changed the matches: ${r.restart?.first} then ${r.restart?.second}`).toBe(true);
    expect(r.restart?.proofOk).toBe(true);
  });
  it.skipIf(!has("Satkaarika||BOOKS||Day Book.xlsx") || !has("SSSL||BOOKS||DayBook.xlsx"))("review checks read both real Day Books in full and find the blueprint's own examples", async () => {
    const XLSX = await import("xlsx");
    const { readDayBookVouchers } = await import("@/lib/practice/review/dayBook");
    const { reviewCash } = await import("@/lib/practice/review/cash");
    const { adjustmentRegister } = await import("@/lib/practice/review/adjustments");
    const { nearDuplicates } = await import("@/lib/practice/review/ledgerMap");
    const load = (f: string) => { const wb = XLSX.read(readFileSync(`${REAL}/${f}`), { type: "buffer", raw: false }); return readDayBookVouchers(XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]!]!, { header: 1, raw: false, defval: "" })); };
    const sat = load("Satkaarika||BOOKS||Day Book.xlsx");
    const sssl = load("SSSL||BOOKS||DayBook.xlsx");
    // Every voucher is read, and each balances: debits equal credits.
    for (const v of [...sat, ...sssl]) expect(Math.abs(v.legs.reduce((n, l) => n + l.debit - l.credit, 0)), `${v.type} ${v.no} does not balance`).toBeLessThan(1);
    expect(sat.length).toBe(4290);
    expect(sssl.length).toBe(10724);
    expect(reviewCash(sat).days.length).toBeGreaterThan(20);
    const adj = adjustmentRegister(sat);
    expect(adj.length).toBeGreaterThan(0);
    expect(adj.length, "the register should be a short list, not every journal").toBeLessThan(sat.filter((v) => /journal|contra/i.test(v.type)).length / 2);
    const names = [...new Set(sat.flatMap((v) => v.legs.map((l) => l.ledger)))];
    expect(nearDuplicates(names).some(([a, b]) => /SUB ?CONTRACTOR SERVICES/i.test(a) && /SUBCONTRACTOR SERVICESS/i.test(b))).toBe(true);
  });
  it.skipIf(!has("Satkaarika||CA 7856871247.pdf") || !has("Satkaarika||BOOKS||Day Book.xlsx"))("RC-6 and determinism on Satkaarika, full year", async () => {
    const r = await reconCase("Satkaarika Enterprises", ["Satkaarika||CA 7856871247.pdf", "Satkaarika||CC 6407563276 Mar.pdf", "Satkaarika||CA 8088091704.pdf"], ["Satkaarika||BOOKS||Day Book.xlsx"], { start: "2025-04-01", end: "2026-03-31" }, { startOver: true });
    console.log(`   RC-6 Satkaarika: proof ${r.proofOk ? "passes" : "FAILS"}; start over ${r.restart?.first} then ${r.restart?.second} matched`, r.proofFailed);
    expect(r.proofOk, r.proofFailed.join(" | ")).toBe(true);
    expect(r.restart?.same, `start over changed the matches: ${r.restart?.first} then ${r.restart?.second}`).toBe(true);
  });
  it.skipIf(!has("Satkaarika||CC 6407563276 Mar.pdf") || !has("Satkaarika||CA 8088091704.pdf") || !has("Satkaarika||GECL loan.pdf"))("Satkaarika: with the CC statement, a second CA account and the loan statements", async () => {
    const r = await reconCase("Satkaarika Enterprises", ["Satkaarika||CA 7856871247.pdf", "Satkaarika||CC 6407563276 Mar.pdf", "Satkaarika||GECL loan.pdf", "Satkaarika||Term loan.pdf", "Satkaarika||Vehicle loan.pdf", "Satkaarika||CA 8088091704.pdf"], ["Satkaarika||BOOKS||Day Book.xlsx"], { start: "2025-04-01", end: "2026-03-31" });
    record("satkaarika_all", { bank: r.bank, matched: r.matched, open: r.open }, ["matched"], ["open"], ["bank"]);
  });
  it.skipIf(!has("SSSL||UBI_1967.pdf") || !has("SSSL||BOOKS||DayBook.xlsx"))("SSSL: four banks against a Day Book that covers five, May 2025", async () => {
    const r = await reconCase("Sri Satyanarayana Swamy Logistics", ["SSSL||ICICI_1053_AprJun25.pdf", "SSSL||HDFC_2932.pdf", "SSSL||UBI_1967.pdf", "SSSL||Kotak_3368.pdf"], ["SSSL||BOOKS||DayBook.xlsx"], { start: "2025-05-01", end: "2025-05-31" });
    record("sssl_may", { bank: r.bank, matched: r.matched, open: r.open, pairable: r.pairable }, ["matched"], ["open", "pairable"]);
  });
  it.skipIf(!has("SSSL||Kotak_3368.pdf"))("Kotak 3368 reads in full without AI and its balances tie", async () => {
    const o = await readOne("SSSL||Kotak_3368.pdf");
    record("kotak_3368", { lines: o.lines, parsed: o.status === "parsed", failedCheck: o.check === "fail" }, ["lines"], [], ["parsed", "failedCheck"]);
  });
  it.each([["GECL loan", "Satkaarika||GECL loan.pdf"], ["Term loan", "Satkaarika||Term loan.pdf"], ["Vehicle loan", "Satkaarika||Vehicle loan.pdf"]])("%s is recognised as a loan statement", async (name, file) => {
    if (!has(file)) return;
    const o = await readOne(file);
    record(`loan_${name.split(" ")[0]!.toLowerCase()}`, { isLoan: o.register === "loan_statement", bankLines: o.lines }, [], ["bankLines"], ["isLoan"]);
  });
  it("the CC statement is not mistaken for a loan", async () => {
    if (!has("Satkaarika||CC 6407563276 Mar.pdf")) return;
    const o = await readOne("Satkaarika||CC 6407563276 Mar.pdf");
    record("cc_not_loan", { isLoan: o.register === "loan_statement" }, [], [], ["isLoan"]);
  });
  it("writes the baseline when asked", () => {
    if (!UPDATE) return;
    writeFileSync(EXPECTED, JSON.stringify({ ...expected, ...measured }, null, 2) + "\n");
  });
});
