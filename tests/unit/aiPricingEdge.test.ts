import { describe, expect, it } from "vitest";
import { rateFor, billedOutputTokens } from "@/lib/practice/aiPricing";
import * as edge from "../../supabase/functions/_shared/ai-pricing";

(globalThis as unknown as { Deno: unknown }).Deno = { env: { get: () => undefined } };

describe("edge pricing copy agrees with the app table", () => {
  const models = ["gemini-flash-latest", "gemini-flash-lite-latest", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-3.8-flash", "gemini-4-carbon", "gemini-3.1-pro", "google/gemini-2.5-flash", "llama-3.3-70b-versatile", "mystery"];
  const days = ["2026-11-12", "2026-12-01", "2027-01-02"];
  it("same rates for every model and day", () => {
    for (const m of models) for (const d of days) expect(edge.rateFor(m, new Date(d)), `${m} ${d}`).toEqual(rateFor(m, new Date(d)));
  });
  it("same billed output", () => {
    const u = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 40 };
    expect(edge.billedOutputTokens(u)).toBe(billedOutputTokens(u));
  });
});
