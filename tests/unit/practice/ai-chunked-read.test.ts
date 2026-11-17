import { describe, expect, it } from "vitest";
import { aiReadText, splitForAi, type AiCallRecord } from "@/lib/practice/extract/pipeline";
import type { ExtractDeps } from "@/lib/practice/extract/pipeline";

const statement = (n: number) =>
  Array.from({ length: n }, (_, i) => `${String((i % 28) + 1).padStart(2, "0")}-05-2025 NEFT PAYMENT TO SUPPLIER NUMBER ${i + 1} AGAINST INVOICE ${1000 + i} ${(1000 + i).toFixed(2)} ${(500000 - i).toFixed(2)}`).join("\n");

/** A stand-in model: reads every dated line of the part it is given, as a real one would. */
const fakeLlm = (opts: { failPart?: number } = {}) => {
  const seen: number[] = [];
  const llm = {
    json: async (req: { user: string }) => {
      const part = Number(/part (\d+) of/.exec(req.user)?.[1] ?? 1);
      seen.push(part);
      if (opts.failPart === part) throw new Error("model overloaded");
      const rows = req.user.split("\n").filter((l) => /^\d{2}-05-2025/.test(l)).map((l) => ({ date: l.slice(0, 10), description: l.slice(11, 60), amount: 1, balance: 1 }));
      return { data: { rows, document_kind: "bank_statement" }, provider: "fake", model: "fake", latency_ms: 1, raw: "{}", usage: { input_tokens: 10, output_tokens: 10 } };
    },
  };
  return { deps: { llm } as unknown as ExtractDeps, seen };
};

describe("reading a long statement with the model", () => {
  it("one call for a short document, parts for a long one", () => {
    expect(splitForAi("short text")).toHaveLength(1);
    const long = statement(1500);
    const parts = splitForAi(long);
    expect(parts.length).toBeGreaterThan(5);
    // Every line is in exactly one part, in order, and no part is oversize.
    expect(parts.join("\n")).toBe(long);
    expect(Math.max(...parts.map((p) => p.length))).toBeLessThan(12_000 * 1.45);
  });
  it("parts start at a dated line, so a transaction is not cut in two", () => {
    const parts = splitForAi(statement(800));
    for (const p of parts.slice(1)) expect(p).toMatch(/^\d{2}-05-2025/);
  });
  it("reads all 1,500 lines, in order, from the parts", async () => {
    const { deps } = fakeLlm();
    const calls: AiCallRecord[] = [];
    const read = await aiReadText(deps, calls, "extract_read_text", statement(1500));
    expect(read!.rows).toHaveLength(1500);
    expect(read!.kind).toBe("bank_statement");
    expect(calls.length).toBeGreaterThan(5);
    expect(calls.every((c) => c.status === "success")).toBe(true);
  });
  it("declines the whole read if any part fails, rather than return a statement with a part missing", async () => {
    const { deps } = fakeLlm({ failPart: 3 });
    expect(await aiReadText(deps, [], "extract_read_text", statement(1500))).toBeNull();
  });
  it("declines a document too long to read in parts", async () => {
    const { deps } = fakeLlm();
    expect(await aiReadText(deps, [], "extract_read_text", statement(15000))).toBeNull();
  });
  it("without a model it does nothing", async () => {
    expect(await aiReadText({} as ExtractDeps, [], "x", statement(100))).toBeNull();
  });
});
