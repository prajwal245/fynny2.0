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
  return { results, summary, txns, exceptions, docs: tables["ca_document_extractions"] as Row[], tables, db };
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

describe.skipIf(!present)("the demo pack: the whole 20-minute script, in order", () => {
  it("statements, recon, handling, close ticks and the activity trail", async () => {
    const r = await run([{ f: "01_HDFC_Current_Sep2026.pdf", side: "bank" }, { f: "02_ICICI_Current_Sep2026.pdf", side: "bank" }, { f: "04_Tally_DayBook_Sep2026.xlsx", side: "books" }]);
    const { clientClose } = await import("@/lib/practice/close/close.server");
    const { setWorkStatus } = await import("@/lib/practice/exceptionWork.server");
    const ctx = { firmId: FIRM, firmName: "Firm", firmEmail: null, userId: "u1", role: "owner" as const };
    const db = (r as unknown as { db: never }).db;
    const step = (c: Awaited<ReturnType<typeof clientClose>>, k: string) => c!.steps.find((s) => s.key === k)!;

    const before = await clientClose(db, ctx, BUSINESS, "2026-09");
    expect(step(before, "docs_received").status).toBe("done");
    expect(step(before, "statements_verified").status).toBe("done");
    expect(step(before, "recon_done").status).toBe("done");
    expect(step(before, "exceptions_explained")).toMatchObject({ status: "pending", detail: "3 exceptions still need a decision." });

    // The value card agrees with a hand count of the demo month: 32 bank lines, 4 set aside, 26 matched of the 28 that were real work, 3 decisions.
    const { periodValue } = await import("@/lib/practice/value.server");
    const value = await periodValue(db, ctx, "September 2026");
    expect(value).toMatchObject({ bankLines: 32, setAside: 4, workLines: 28, autoMatched: 26, manualMatched: 0, decisionsLeft: 3, autoPct: 92.9 });
    expect(value.sentence).toContain("92.9% of 28 bank lines matched automatically (26)");

    // The three decisions, each explained by a person with a reason.
    const open = (r.tables["ca_exceptions"] as Row[]).filter((e) => e["status"] === "open");
    expect(open.length).toBe(4); // Kaveri's bank line and book entry are one decision
    for (const e of open) await setWorkStatus(db, ctx, String(e["id"]), "accepted_timing", "Cheque issued, not yet presented: clears 3 Oct");

    const after = await clientClose(db, ctx, BUSINESS, "2026-09");
    expect(step(after, "exceptions_explained").status).toBe("done");
    expect(after!.steps.filter((s) => s.kind === "auto" && s.status === "done").length).toBe(4);
    expect(after!.state).toBe("bank_books_closed");

    const log = (r.tables["ca_activity_log"] ?? []) as Row[];
    expect(log.some((l) => /moved an exception from "Open" to "Accepted as timing": Cheque issued, not yet presented/.test(String(l["description"])))).toBe(true);
  });
  it("a held statement blocks 'statements verified' until a person accepts it", async () => {
    const r = await run([{ f: "03_HDFC_Current_Sep2026_one_line_missing.pdf", side: "bank" }], false);
    const { clientClose } = await import("@/lib/practice/close/close.server");
    const ctx = { firmId: FIRM, firmName: "Firm", firmEmail: null, userId: "u1", role: "owner" as const };
    const c = await clientClose((r as unknown as { db: never }).db, ctx, BUSINESS, "2026-09");
    expect(c!.steps.find((s) => s.key === "statements_verified")).toMatchObject({ status: "blocked" });
  });
});

describe.skipIf(!present)("the demo pack: GST files saved as the client's documents", () => {
  it("the GSTR-2B JSON and the purchase register are kept as registers, so they survive a reload", async () => {
    const r = await run([{ f: "06_Purchase_Register_Sep2026.xlsx", side: "books" }, { f: "07_GSTR2B_Sep2026.json", side: "books" }], false);
    const kinds = r.docs.map((d) => (d["extracted"] as { register?: { kind: string; entries: number } }).register);
    expect(kinds[0]).toMatchObject({ kind: "gst_purchase_register", entries: 6 });
    expect(kinds[1]).toMatchObject({ kind: "gstr2b", entries: 5 });
    expect(r.txns.length).toBe(0);
  });
});
