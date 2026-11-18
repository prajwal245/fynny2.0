/**
 * Live check of the AI reader on a scan. Runs only with AI_LIVE_FILE=<image-only PDF> and a working GEMINI_API_KEY, and spends a few
 * cents of Gemini credit. The expected figures are those of demo/sample-pack/01_HDFC_Current_Sep2026.pdf (26 lines, closing 3,76,052.79).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { memoryDb } from "../../helpers/memoryDb";

vi.mock("@/lib/practice/orchestrator.server", () => ({
  startRun: async () => "r", finishRun: async () => undefined, afterExtraction: async () => ({ pipeline: [] }),
  afterRecon: async () => false, loadMemories: async () => [], markMemoriesApplied: async () => undefined, teachFromReview: async () => undefined,
}));
vi.mock("@/lib/practice/ocr.server", () => ({ practiceOcr: () => null }));
vi.mock("@/lib/practice/llm.server", async (orig) => ({ ...(await orig<typeof import("@/lib/practice/llm.server")>()), withinAiCap: async () => true }));

const FILE = process.env["AI_LIVE_FILE"];
describe.skipIf(!FILE)("AI reader on a scanned statement", { timeout: 300_000 }, () => {
  it("reads the scan, and the result is held to the same tie-out as a text statement", async () => {
    const name = "scan.pdf";
    const doc = { id: "d1", ca_firm_id: "f", business_id: "b", original_filename: name, storage_path: `f/b/${name}`, side: "bank", extract_status: null, extract_attempts: 0, extracted: { source: "Manual" }, uploaded_by: "u" };
    const { db, tables } = memoryDb({ ca_document_extractions: [doc], ca_clients: [{ id: "c", business_id: "b", ca_firm_id: "f", client_name: "Sunrise Traders Private Limited" }] }, { [`f/b/${name}`]: new Uint8Array(readFileSync(FILE!)) });
    const { processExtraction } = await import("@/lib/practice/documents.server");
    const r = await processExtraction(db, "d1", { trigger: "user", userId: "u" });
    const d = (tables["ca_document_extractions"] as Record<string, unknown>[])[0]!;
    const sc = (d["extracted"] as { statement_check?: { status: string; lines: number; closing: number | null; headline: string; checks: { ok: boolean | null; label: string; detail: string }[] } }).statement_check;
    const calls = (tables["ca_ai_calls"] ?? []) as Record<string, unknown>[];
    console.log("LIVE", r.status, "lines", sc?.lines, "closing", sc?.closing, sc?.status, "|", String(r.error ?? sc?.headline ?? "").slice(0, 200));
    for (const c of sc?.checks ?? []) console.log("LIVE  check", c.ok, c.label, "|", c.detail.slice(0, 120));
    for (const c of calls) console.log("LIVE  call", c["purpose"], c["provider"], c["model"], c["status"], String(c["error"] ?? "").slice(0, 120));
    const tx = ((tables["ca_txns"] ?? []) as Record<string, unknown>[]).filter((t) => t["extraction_id"] === "d1");
    const sum = (dir: string) => Math.round(tx.filter((t) => t["direction"] === dir).reduce((n, t) => n + Number(t["amount"]), 0) * 100) / 100;
    console.log("LIVE  totals in", sum("in"), "out", sum("out"), "n", tx.length, "(truth: in 1350832.00, out 2224779.21)");
    expect(r.status === "parsed" || r.status === "needs_review").toBe(true);
  });
});
