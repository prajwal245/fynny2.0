// @vitest-environment node
/**
 * Pulling a month of a Zoho bank account again must leave the books exactly as Zoho holds them now: an entry deleted in Zoho is
 * gone here too, matched or not. This is the 13 / 14 Nov retest sequence (pull, add a Rs 123 expense, pull, delete it, pull),
 * run through the real pull and the real upload code on an in-memory database.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
const ctx = { firmId: FIRM, firmName: "Rao & Co", firmEmail: null, userId: "u1", role: "partner" } as never;

type Entry = Record<string, unknown>;
const base: Entry[] = [
  { transaction_date: "2026-10-03", payee: "Anand Retail", description: "Receipt INV-2601", debit_amount: 23800, credit_amount: 0, transaction_type: "customer_payment", reference_number: "RCT-1" },
  { transaction_date: "2026-10-06", payee: "Mahesh Suppliers", description: "Bill payment", debit_amount: 0, credit_amount: 9099.25, transaction_type: "vendor_payment", reference_number: "PAY-1" },
  { transaction_date: "2026-10-09", payee: "Orion IT", description: "Receipt INV-2604", debit_amount: 41000, credit_amount: 0, transaction_type: "customer_payment", reference_number: "RCT-2" },
  { transaction_date: "2026-10-12", payee: "", description: "Bank charges", debit_amount: 0, credit_amount: 590, transaction_type: "expense", reference_number: "EXP-1" },
  { transaction_date: "2026-10-20", payee: "Sundar Auto", description: "Receipt INV-2603", debit_amount: 15500, credit_amount: 0, transaction_type: "customer_payment", reference_number: "RCT-3" },
];
const expense123: Entry = { transaction_date: "2026-10-15", payee: "", description: "Test expense Bank Fees", debit_amount: 0, credit_amount: 123, transaction_type: "expense", reference_number: "EXP-123" };

let zohoEntries: Entry[] = base;

async function setup() {
  const enc = await (await import("@/lib/caGmail.server")).encryptToken("tok");
  return memoryDb({
    ca_zoho_connections: [{ id: "c1", ca_firm_id: FIRM, accounts_server: "https://accounts.zoho.in", api_domain: "https://www.zohoapis.in", refresh_token_enc: enc, access_token_enc: enc, access_expires_at: new Date(Date.now() + 3.6e6).toISOString(), status: "connected" }],
    ca_zoho_links: [{ id: "l1", ca_firm_id: FIRM, business_id: "b1", organization_id: "org1", organization_name: "Rao Test", account_id: "a1", account_name: "HDFC Bank A/c 4417", posting_enabled: false }],
    ca_clients: [{ id: "row1", business_id: "b1", ca_firm_id: FIRM, client_name: "Sahyadri" }],
  });
}

beforeEach(() => {
  process.env["GMAIL_ENCRYPTION_KEY"] = "k";
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ code: 0, transactions: zohoEntries, page_context: { has_more_page: false } })));
});
afterEach(() => vi.unstubAllGlobals());

const booksOf = (tables: Record<string, Record<string, unknown>[]>) => (tables["ca_txns"] ?? []).filter((t) => t["side"] === "books");
const amounts = (tables: Record<string, Record<string, unknown>[]>) => booksOf(tables).map((t) => Number(t["amount"])).sort((a, b) => a - b);

describe("pulling a Zoho month again", () => {
  it("an expense added and then deleted in Zoho is gone after the next pull (the 14 Nov retest sequence)", async () => {
    const { db, tables } = await setup();
    const zoho = await import("@/lib/practice/zoho.server");

    zohoEntries = base;
    const first = await zoho.sync(db as never, ctx, "l1", "2026-10");
    expect(first.status).toBe("synced");
    expect(booksOf(tables)).toHaveLength(5);

    zohoEntries = [...base, expense123];
    const second = await zoho.sync(db as never, ctx, "l1", "2026-10");
    expect(second.status).toBe("synced");
    expect(amounts(tables)).toContain(123);
    expect(booksOf(tables)).toHaveLength(6);

    zohoEntries = base; // the expense is deleted in Zoho
    const third = await zoho.sync(db as never, ctx, "l1", "2026-10");
    expect(third.status).toBe("synced");
    expect(amounts(tables)).not.toContain(123);
    expect(booksOf(tables)).toHaveLength(5);
    // One document for the month, not a second copy beside the first.
    expect((tables["ca_document_extractions"] ?? []).filter((d) => d["side"] === "books")).toHaveLength(1);
  });

  it("an entry deleted in Zoho also un-matches the bank line it was matched to, and removes its exception", async () => {
    const { db, tables } = await setup();
    const zoho = await import("@/lib/practice/zoho.server");
    zohoEntries = [...base, expense123];
    await zoho.sync(db as never, ctx, "l1", "2026-10");
    const book = booksOf(tables).find((t) => Number(t["amount"]) === 123)!;
    // A bank line of Rs 123 that was matched to that entry.
    (tables["ca_txns"] ??= []).push({ id: "bank1", ca_firm_id: FIRM, business_id: "b1", side: "bank", amount: 123, direction: "out", txn_date: "2026-10-15", match_status: "matched" });
    (tables["ca_recon_matches"] ??= []).push({ id: "m1", ca_firm_id: FIRM, bank_txn_id: "bank1", book_txn_ids: [book["id"]], status: "active" });

    zohoEntries = base;
    await zoho.sync(db as never, ctx, "l1", "2026-10");
    expect(amounts(tables)).not.toContain(123);
    expect(tables["ca_txns"]!.find((t) => t["id"] === "bank1")!["match_status"]).toBe("unmatched");
    expect(tables["ca_recon_matches"]![0]!["status"]).toBe("reversed");
  });

  it("an earlier copy of the same month filed under another file path is replaced, not kept beside the new one", async () => {
    const { db, tables } = await setup();
    const zoho = await import("@/lib/practice/zoho.server");
    zohoEntries = [...base, expense123];
    await zoho.sync(db as never, ctx, "l1", "2026-10");
    // Simulate a copy made by an older version that used a different path.
    const doc = tables["ca_document_extractions"]![0]!;
    const oldPath = `${FIRM}/b1/zoho/old-style-2026-10.csv`;
    doc["storage_path"] = oldPath;

    zohoEntries = base;
    await zoho.sync(db as never, ctx, "l1", "2026-10");
    expect(amounts(tables)).not.toContain(123);
    expect(booksOf(tables)).toHaveLength(5);
  });
});
