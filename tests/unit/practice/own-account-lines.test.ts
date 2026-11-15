/**
 * Lines that look the same on statements of two different bank accounts of one client are both real (a transfer between the
 * client's own accounts, or two equal payments). Only a repeat on the SAME account, from statements that overlap, is a duplicate.
 * Runs the real server code (`processExtraction`) on an in-memory database.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { memoryDb } from "../../helpers/memoryDb";

vi.mock("@/lib/practice/orchestrator.server", () => ({
  startRun: async () => "run1",
  finishRun: async () => undefined,
  afterExtraction: async () => ({ pipeline: [] }),
  loadMemories: async () => [],
  markMemoriesApplied: async () => undefined,
  teachFromReview: async () => undefined,
}));
vi.mock("@/lib/practice/llm.server", () => ({ practiceLlm: () => null, withinAiCap: async () => false }));
vi.mock("@/lib/practice/ocr.server", () => ({ practiceOcr: () => null }));

const FIRM = "f1";
const BUSINESS = "b1";

async function uploadAll(files: { name: string; bytes: Uint8Array }[], clientName: string) {
  const { db, tables } = memoryDb(
    {
      ca_document_extractions: files.map((f, i) => ({
        id: `d${i + 1}`,
        ca_firm_id: FIRM,
        business_id: BUSINESS,
        original_filename: f.name,
        storage_path: `${FIRM}/${BUSINESS}/${f.name}`,
        side: "bank",
        extract_status: null,
        extract_attempts: 0,
        extracted: { source: "Manual" },
        uploaded_by: "u1",
      })),
      ca_clients: [{ id: "row1", business_id: BUSINESS, ca_firm_id: FIRM, client_name: clientName }],
    },
    Object.fromEntries(files.map((f) => [`${FIRM}/${BUSINESS}/${f.name}`, f.bytes])),
  );
  const { processExtraction } = await import("@/lib/practice/documents.server");
  const results = [];
  for (let i = 0; i < files.length; i++) results.push(await processExtraction(db, `d${i + 1}`, { trigger: "user", userId: "u1" }));
  return { results, docs: tables["ca_document_extractions"]!, txns: tables["ca_txns"] ?? [], review: tables["ca_review_items"] ?? [] };
}

const csv = (account: string, lines: string[]) =>
  new TextEncoder().encode([`Account Number : ${account}`, "Date,Description,Debit,Credit,Balance", ...lines].join("\n"));

describe("the same-looking line on two accounts of one client", () => {
  const hdfc = csv("50200090622932", [
    "01/04/2025,OPENING DEPOSIT,,500000.00,500000.00",
    "02/04/2025,NEFT RENT APRIL LANDLORD,25000.00,,475000.00",
    "03/04/2025,CASH WDL,1000.00,,474000.00",
  ]);
  const icici = csv("110805501053", [
    "01/04/2025,OPENING DEPOSIT ICICI,,300000.00,300000.00",
    "02/04/2025,NEFT RENT APRIL LANDLORD,25000.00,,275000.00", // the same narration, date and amount, from another account
    "04/04/2025,UPI SALARY,5000.00,,270000.00",
  ]);
  // A later statement of the first account that repeats two of its lines.
  const hdfcAgain = csv("50200090622932", [
    "02/04/2025,NEFT RENT APRIL LANDLORD,25000.00,,475000.00",
    "03/04/2025,CASH WDL,1000.00,,474000.00",
    "05/04/2025,BANK CHARGES,59.00,,473941.00",
  ]);

  it("keeps both lines when they come from different accounts", async () => {
    const { txns, docs } = await uploadAll([{ name: "hdfc.csv", bytes: hdfc }, { name: "icici.csv", bytes: icici }], "Sri Logistics");
    expect(txns).toHaveLength(6);
    expect(txns.filter((t) => String(t["description"]).includes("RENT APRIL"))).toHaveLength(2);
    expect((docs[1]!["extracted"] as { account_no?: string }).account_no).toBe("110805501053");
  });

  it("still drops a true repeat: the same line from an overlapping statement of the same account", async () => {
    const { txns } = await uploadAll([{ name: "hdfc.csv", bytes: hdfc }, { name: "hdfc-later.csv", bytes: hdfcAgain }], "Sri Logistics");
    expect(txns).toHaveLength(4); // three, plus only the new bank charge
    expect(txns.filter((t) => String(t["description"]).includes("RENT APRIL"))).toHaveLength(1);
  });

  it("reading the second account's statement again files nothing twice", async () => {
    const { txns } = await uploadAll([{ name: "hdfc.csv", bytes: hdfc }, { name: "icici.csv", bytes: icici }, { name: "icici.csv", bytes: icici }], "Sri Logistics");
    expect(txns.filter((t) => String(t["description"]).includes("RENT APRIL"))).toHaveLength(2);
  });
});

const REAL = process.env["REAL_STATEMENTS"];
describe.skipIf(!REAL || !existsSync(REAL ?? ""))("the tester's real statements, all under one client (only when REAL_STATEMENTS points at them)", () => {
  it("files every line of HDFC and all four ICICI quarters: nothing is dropped as a duplicate of the other account", async () => {
    const names = readdirSync(REAL!).filter((f) => /^(hdfc|icici)/.test(f)).sort();
    const { results, docs, txns } = await uploadAll(names.map((n) => ({ name: n, bytes: new Uint8Array(readFileSync(`${REAL}/${n}`)) })), "SRI SATYANARAYANA SWAMY LOGISTICS");
    const per = docs.map((d, i) => `${d["original_filename"]}: ${results[i]!.status}, filed ${txns.filter((t) => t["extraction_id"] === d["id"]).length}, review ${results[i]!.review}, duplicates ${d["duplicate_count"]}`);
    console.log(per.join("\n"));
    const filed = (n: string) => txns.filter((t) => t["extraction_id"] === docs.find((d) => d["original_filename"] === n)!["id"]).length;
    expect(filed("hdfc.pdf")).toBe(161);
    expect(filed("icici-q1.pdf")).toBe(1464);
    expect(filed("icici-q2.pdf")).toBe(1461);
    expect(filed("icici-q3.pdf")).toBe(1293);
    expect(filed("icici-q4.pdf")).toBe(1610);
  }, 600_000);
});
