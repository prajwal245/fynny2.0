import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { memoryDb } from "../../helpers/memoryDb";
vi.mock("@/lib/practice/orchestrator.server", () => ({
  startRun: async () => "r",
  finishRun: async () => undefined,
  afterExtraction: async () => ({ pipeline: [] }),
  afterRecon: async () => false,
  loadMemories: async () => [],
  markMemoriesApplied: async () => undefined,
  teachFromReview: async () => undefined,
}));
vi.mock("@/lib/practice/llm.server", () => ({
  practiceLlm: () => null,
  withinAiCap: async () => false,
}));
vi.mock("@/lib/practice/ocr.server", () => ({ practiceOcr: () => null }));
const REAL = process.env["REAL_STATEMENTS"];
const FILE = "Satkaarika||CC 6407563276 Mar.pdf";
describe.skipIf(!REAL || !existsSync(`${REAL}/${FILE}`))(
  "re-reading a statement (real file)",
  () => {
    it("does not add lines again when the stored narration differs and the lines are matched", async () => {
      const doc = {
        id: "d1",
        ca_firm_id: "f",
        business_id: "b",
        original_filename: FILE,
        storage_path: `f/b/${FILE}`,
        side: "bank",
        extract_status: null,
        extract_attempts: 0,
        extracted: { source: "Manual" },
        uploaded_by: "u",
      };
      const { db, tables } = memoryDb(
        {
          ca_document_extractions: [doc],
          ca_clients: [
            {
              id: "c",
              business_id: "b",
              ca_firm_id: "f",
              client_name: "Satkaarika",
            },
          ],
        },
        { [`f/b/${FILE}`]: new Uint8Array(readFileSync(`${REAL}/${FILE}`)) },
      );
      const { processExtraction } =
        await import("@/lib/practice/documents.server");
      await processExtraction(db, "d1", { trigger: "user", userId: "u" });
      const txns = () => (tables["ca_txns"] ?? []) as Record<string, unknown>[];
      const first = txns().length;
      expect(first).toBeGreaterThan(50);
      // As after a first read by a different reader: every line matched, with a differently worded narration.
      for (const t of txns()) {
        t["match_status"] = "matched";
        t["description"] = `ONLINE ${String(t["description"]).slice(0, 5)}`;
        t["dedupe_key"] = `old|${String(t["id"])}`;
      }
      await processExtraction(db, "d1", { trigger: "user", userId: "u" });
      expect(txns().length).toBe(first);
    }, 120_000);
  },
);
