import { afterEach, describe, expect, it, vi } from "vitest";
import { ocrCostUsd, rateFor, tokenCostUsd, usageFields } from "@/lib/practice/aiPricing";

afterEach(() => vi.unstubAllEnvs());

describe("ai pricing", () => {
  it("prices flash-lite before flash", () => {
    expect(rateFor("gemini-flash-lite-latest")).toEqual([0.1, 0.4]);
    expect(rateFor("gemini-flash-latest")).toEqual([0.3, 2.5]);
  });
  it("computes cost from tokens", () => {
    expect(tokenCostUsd("gemini-flash-latest", 1_000_000, 100_000)).toBeCloseTo(0.3 + 0.25, 6);
    expect(tokenCostUsd("x", null, null)).toBeNull();
  });
  it("lets AI_PRICING_JSON override a rate", () => {
    vi.stubEnv("AI_PRICING_JSON", '{"flash":[1,2]}');
    expect(rateFor("gemini-flash-latest")).toEqual([1, 2]);
    vi.stubEnv("AI_PRICING_JSON", "not json");
    expect(rateFor("gemini-flash-latest")).toEqual([0.3, 2.5]);
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
});
