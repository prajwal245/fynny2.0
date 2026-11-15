import { afterEach, describe, expect, it, vi } from "vitest";
import { billedOutputTokens, rateKnown, usdInr, ocrCostUsd, rateFor, tokenCostUsd, usageFields } from "@/lib/practice/aiPricing";

afterEach(() => vi.unstubAllEnvs());

describe("ai pricing", () => {
  it("prices flash-lite before flash", () => {
    expect(rateFor("gemini-flash-lite-latest")).toEqual([0.3, 2.5]);
    expect(rateFor("gemini-2.5-flash-lite", new Date("2026-11-12"))).toEqual([0.1, 0.4]);
    expect(rateFor("gemini-flash-latest", new Date("2026-11-12"))).toEqual([0.75, 3.75]);
  });
  it("computes cost from tokens", () => {
    expect(tokenCostUsd("gemini-flash-latest", 1_000_000, 100_000)).toBeCloseTo(0.75 + 0.375, 6);
    expect(tokenCostUsd("x", null, null)).toBeNull();
  });
  it("lets AI_PRICING_JSON override a rate", () => {
    vi.stubEnv("AI_PRICING_JSON", '{"flash":[1,2]}');
    expect(rateFor("gemini-flash-latest")).toEqual([1, 2]);
    vi.stubEnv("AI_PRICING_JSON", "not json");
    expect(rateFor("gemini-flash-latest", new Date("2026-11-12"))).toEqual([0.75, 3.75]);
  });
  it("turns provider usage into log fields", () => {
    expect(usageFields({ model: "llama-3.3-70b-versatile", usage: { input_tokens: 1000, output_tokens: 500 } })).toEqual({ input_tokens: 1000, output_tokens: 500, cost_usd: 0.000985 });
    expect(usageFields({ model: "m" }).cost_usd).toBeNull();
  });
  it("OCR cost is zero unless configured", () => {
    expect(ocrCostUsd()).toBe(0);
    vi.stubEnv("OCR_SPACE_COST_USD_PER_CALL", "0.002");
    expect(ocrCostUsd()).toBe(0.002);
  });
  it("bills thinking tokens as output", () => {
    expect(billedOutputTokens({ prompt_tokens: 1000, completion_tokens: 200, total_tokens: 1900 })).toBe(900);
    expect(billedOutputTokens({ prompt_tokens: 1000, completion_tokens: 200 })).toBe(200);
    expect(billedOutputTokens(null)).toBeNull();
  });
  it("applies the rate in force on the day, and routes retired models", () => {
    expect(rateFor("gemini-4-carbon", new Date("2026-11-30"))).toEqual([2, 10]);
    expect(rateFor("gemini-4-carbon", new Date("2026-12-01"))).toEqual([4, 20]);
    expect(rateFor("gemini-2.5-flash", new Date("2026-12-02"))).toEqual([0.3, 2.5]);
    expect(rateFor("gemini-3.1-pro", new Date("2026-11-12"), 300_000)).toEqual([4, 18]);
  });
  it("prices an unknown model high, and says so", () => {
    expect(rateKnown("mystery-1")).toBe(false);
    expect(rateFor("mystery-1")).toEqual([0.75, 3.75]);
  });
  it("has a default exchange rate", () => {
    expect(usdInr()).toBe(88);
  });
});
