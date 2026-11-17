/**
 * The demo pack (demo/sample-pack): a fictional client, "Sunrise Traders Private Limited". Every claim the demo script makes about
 * these files is asserted here, so the pack and the script cannot drift apart. Regenerate with demo/sample-pack/make_pack.py.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { memoryDb } from "../../helpers/memoryDb";

vi.mock("@/lib/practice/orchestrator.server", () => ({
  startRun: async () => "run1", finishRun: async () => undefined, afterExtraction: async () => ({ pipeline: [] }),
  afterRecon: async () => false, loadMemories: async () => [], markMemoriesApplied: async () => undefined, teachFromReview: async () => undefined,
}));
vi.mock("@/lib/practice/llm.server", () => ({ practiceLlm: () => null, withinAiCap: async () => false }));
vi.mock("@/lib/practice/ocr.server", () => ({ practiceOcr: () => null }));

const DIR = "demo/sample-pack";
const present = existsSync(`${DIR}/01_HDFC_Current_Sep2026.pdf`);
const FIRM = "f1";
const BUSINESS = "b1";
type Row = Record<string, unknown>;

async function run(files: { f: string; side: "bank" | "books" }[], reconcile = true) {
  const docs = files.map((x, i) => ({ id: `d${i + 1}`, ca_firm_id: FIRM, business_id: BUSINESS, original_filename: x.f, storage_path: `${FIRM}/${BUSINESS}/${i}-${x.f}`, side: x.side, extract_status: null, extract_attempts: 0, extracted: { source: x.side === "books" ? "Tally" : "Manual" }, uploaded_by: "u1" }));
  const blobs = Object.fromEntries(files.map((x, i) => [`${FIRM}/${BUSINESS}/${i}-${x.f}`, new Uint8Array(readFileSync(`${DIR}/${x.f}`))]));
  const { db, tables } = memoryDb({ ca_document_extractions: docs, ca_clients: [{ id: "row1", business_id: BUSINESS, ca_firm_id: FIRM, client_name: "Sunrise Traders Private Limited" }] }, blobs);
  const { processExtraction } = await import("@/lib/practice/documents.server");
  const results = [];
  for (const d of docs) results.push(await processExtraction(db, d.id, { trigger: "user", userId: "u1" }));
  let summary = null;
  if (reconcile) {
    const { runRecon } = await import("@/lib/practice/recon.server");
    summary = await runRecon(db, { firmId: FIRM, firmName: "Firm", firmEmail: null, userId: "u1", role: "owner" as const }, BUSINESS, "September 2026");
  }
  const txns = (tables["ca_txns"] ?? []) as Row[];
  const exceptions = (tables["ca_exceptions"] ?? []) as Row[];
  return { results, summary, txns, exceptions, docs: tables["ca_document_extractions"] as Row[], tables };
}
const check = (d: Row) => (d["extracted"] as { statement_check?: { status: string; lines: number; bankTie?: { tied: boolean | null; source: string }; headline: string; checks: { ok: boolean | null; label: string; detail: string }[] } }).statement_check!;

describe.skipIf(!present)("the demo pack", () => {
  it("HDFC statement is read, ties to the bank's own summary, and passes", async () => {
    const r = await run([{ f: "01_HDFC_Current_Sep2026.pdf", side: "bank" }], false);
    const c = check(r.docs[0]!);
    expect(r.results[0]!.status).toBe("parsed");
    expect(c.status).toBe("pass");
    expect(c.lines).toBe(26);
    expect(c.bankTie).toMatchObject({ tied: true });
  });

  it("the copy with one line missing is held, and says exactly what is short", async () => {
    const r = await run([{ f: "03_HDFC_Current_Sep2026_one_line_missing.pdf", side: "bank" }], false);
    const c = check(r.docs[0]!);
    expect(r.results[0]!.status).toBe("needs_review");
    expect(c.status).toBe("fail");
    expect(c.lines).toBe(25);
    expect(c.headline).toContain("The bank prints 14 debits and 12 credits. We read 13 and 12: 1 debit missing.");
    expect(c.checks.find((k) => k.label === "The bank's own totals")!.detail).toContain("₹3,10,000.00 short");
  });

  it("the loan statement is registered as a loan statement, not read as bank lines", async () => {
    const r = await run([{ f: "05_Axis_Loan_Account_Statement.pdf", side: "bank" }], false);
    expect(r.docs[0]!["classification"]).toBe("loan_statement");
    expect(r.txns.length).toBe(0);
  });

  it("two bank statements and the Day Book reconcile to exactly three decisions", async () => {
    const r = await run([{ f: "01_HDFC_Current_Sep2026.pdf", side: "bank" }, { f: "02_ICICI_Current_Sep2026.pdf", side: "bank" }, { f: "04_Tally_DayBook_Sep2026.xlsx", side: "books" }]);
    const bank = r.txns.filter((t) => t["side"] === "bank");
    expect(bank.length).toBe(32);
    expect(bank.filter((t) => t["match_status"] === "matched").length).toBe(26);
    // The own-account transfer and the reversal, two lines each, are set aside; so are the two contra legs in the books.
    expect(bank.filter((t) => t["match_status"] === "ignored").length).toBe(4);
    expect(r.txns.filter((t) => t["side"] === "books" && t["match_status"] === "ignored").length).toBe(2);
    expect(r.summary!.message).toContain("3 exceptions need a decision");
    const open = r.txns.filter((t) => t["match_status"] === "exception" || t["match_status"] === "unmatched");
    const amounts = open.map((t) => `${t["side"]}:${t["amount"]}`).sort();
    expect(amounts).toEqual(["bank:100000", "bank:25000", "books:30000", "books:98000"].sort());
  });

  it("the GST files tell the story: one invoice missing on the portal, one amount differs", async () => {
    const { readGstFile } = await import("@/lib/practice/gst/files");
    const { reconcileGstr2b } = await import("@/lib/practice/gst/reconcile");
    const file = (f: string) => new File([readFileSync(`${DIR}/${f}`)], f);
    const books = await readGstFile(file("06_Purchase_Register_Sep2026.xlsx"));
    const portal = await readGstFile(file("07_GSTR2B_Sep2026.json"));
    expect(books.invoices.length).toBe(6);
    expect(portal.invoices.length).toBe(5);
    const g = reconcileGstr2b(books.invoices, portal.invoices, { period: "2026-09" });
    console.log("GST:", g.matched.length, "matched", g.mismatched.length, "mismatch", g.missingInPortal.map((i) => `${i.party} ${i.taxable}`), "atRisk", g.totals.itcAtRisk, "diff", g.totals.mismatchTaxDiff, "unbooked", g.missingInBooks.length);
    expect(g.missingInPortal.length).toBe(1);
    expect(g.mismatched.length).toBe(1);
  });
});
