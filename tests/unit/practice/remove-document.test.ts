import { describe, expect, it } from "vitest";
import type { FirmContext } from "@/lib/practice/db.server";
import { memoryDb } from "../../helpers/memoryDb";
import { removeDocument } from "@/lib/practice/documents.server";

const ctx = (role: FirmContext["role"]): FirmContext => ({ firmId: "f1", firmName: "Rao & Co", firmEmail: null, userId: "u1", role });
const seed = () => ({
  ca_document_extractions: [
    { id: "dBooks", ca_firm_id: "f1", business_id: "b1", original_filename: "daybook.xlsx", side: "books" },
    { id: "dBank", ca_firm_id: "f1", business_id: "b1", original_filename: "ICICI.pdf", side: "bank" },
  ],
  ca_txns: [
    { id: "k1", extraction_id: "dBooks", side: "books", match_status: "matched" },
    { id: "k2", extraction_id: "dBooks", side: "books", match_status: "unmatched" },
    { id: "t1", extraction_id: "dBank", side: "bank", match_status: "matched" },
    { id: "t2", extraction_id: "dBank", side: "bank", match_status: "unmatched" },
  ],
  ca_recon_matches: [{ id: "m1", status: "active", bank_txn_id: "t1", book_txn_ids: ["k1"] }],
  ca_review_items: [{ id: "r1", extraction_id: "dBooks", status: "open" }],
  ca_activity_log: [],
});

describe("removing an uploaded file", () => {
  it("removes a books file, reverses the match that used it, and opens the bank line again", async () => {
    const { db, tables } = memoryDb(seed());
    const r = await removeDocument(db, ctx("junior"), "dBooks");
    expect(r).toMatchObject({ filename: "daybook.xlsx", lines: 2, matchesReversed: 1 });
    expect(tables["ca_txns"]!.map((t) => t["id"]).sort()).toEqual(["t1", "t2"]);
    expect(tables["ca_txns"]!.find((t) => t["id"] === "t1")!["match_status"]).toBe("unmatched");
    expect(tables["ca_recon_matches"]![0]).toMatchObject({ status: "reversed", reversed_by: "u1" });
    expect(tables["ca_document_extractions"]!.map((d) => d["id"])).toEqual(["dBank"]);
    expect(tables["ca_review_items"]).toHaveLength(0);
    expect(String(tables["ca_activity_log"]!.at(-1)!["description"])).toMatch(/daybook.xlsx was removed.*1 match reversed.*original file is kept/);
  });
  it("a bank statement can be removed only by a partner, and its matched books come back open", async () => {
    const { db, tables } = memoryDb(seed());
    await expect(removeDocument(db, ctx("junior"), "dBank")).rejects.toThrow(/Only a partner/);
    expect(tables["ca_document_extractions"]).toHaveLength(2);
    await removeDocument(db, ctx("partner"), "dBank");
    expect(tables["ca_txns"]!.find((t) => t["id"] === "k1")!["match_status"]).toBe("unmatched");
    expect(tables["ca_txns"]!.some((t) => String(t["id"]).startsWith("t"))).toBe(false);
  });
  it("refuses a file that is not this firm's", async () => {
    const { db } = memoryDb(seed());
    await expect(removeDocument(db, { ...ctx("partner"), firmId: "other" }, "dBooks")).rejects.toThrow(/not found/);
  });
});
