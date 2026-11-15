import { describe, expect, it } from "vitest";
import { chatCost, dayOf, rowCost } from "@/lib/admin/apiUsage.server";

describe("admin api usage", () => {
  it("recomputes document cost from tokens at that day's rate", () => {
    const c = rowCost({ provider: "gemini", model: "gemini-flash-latest", input_tokens: 1_000_000, output_tokens: 1_000_000, cost_usd: 0.01, created_at: "2026-11-12T10:00:00Z" });
    expect(c).toBeCloseTo(0.75 + 3.75, 6);
  });
  it("keeps the stored figure when a row has no tokens, and for OCR", () => {
    expect(rowCost({ provider: "gemini", model: "m", cost_usd: 0.5, created_at: "2026-11-12T10:00:00Z" })).toBe(0.5);
    expect(rowCost({ provider: "ocr.space", cost_usd: 0.002, input_tokens: 5 })).toBe(0.002);
  });
  it("estimates chat from the token total", () => {
    expect(chatCost({ model: "gemini-flash-latest", tokens_used: 1_000_000, created_at: "2026-11-12T10:00:00Z" })).toBeCloseTo(0.8 * 0.75 + 0.2 * 3.75, 5);
    expect(chatCost({ model: "x", tokens_used: null, cost_usd: 0 })).toBe(0);
  });
  it("puts a late-evening India call on the next IST day but the same Pacific day", () => {
    const t = "2026-11-12T20:00:00Z"; // 01:30 IST on the 13th, 12:00 Pacific on the 12th
    expect(dayOf(t, "ist")).toBe("2026-11-13");
    expect(dayOf(t, "pacific")).toBe("2026-11-12");
  });
});
