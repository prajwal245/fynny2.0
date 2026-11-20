import { afterEach, describe, expect, it } from "vitest";
import { allowedByResidency, practiceLlm, residencyIndiaOnly } from "@/lib/practice/llm.server";

describe("India-only data residency", () => {
  afterEach(() => { for (const k of ["PRACTICE_DATA_RESIDENCY", "PRACTICE_AI_INDIA_HOSTS", "GEMINI_API_KEY", "GROQ_API_KEY"]) delete process.env[k]; });
  it("allows any provider when residency is not set", () => {
    expect(residencyIndiaOnly()).toBe(false);
    expect(allowedByResidency("https://generativelanguage.googleapis.com/v1beta")).toBe(true);
  });
  it("allows only an allow-listed Indian host when set to india", () => {
    process.env["PRACTICE_DATA_RESIDENCY"] = "india";
    expect(allowedByResidency("https://generativelanguage.googleapis.com/v1beta")).toBe(false);
    expect(allowedByResidency("https://api.groq.com/openai/v1/chat/completions")).toBe(false);
    expect(allowedByResidency("https://asia-south1-aiplatform.googleapis.com/v1/projects/p")).toBe(true);
    process.env["PRACTICE_AI_INDIA_HOSTS"] = "ai.example.in";
    expect(allowedByResidency("https://ai.example.in/v1")).toBe(true);
    expect(allowedByResidency("https://asia-south1-aiplatform.googleapis.com/v1")).toBe(false);
  });
  it("gives no AI client at all in India-only mode when only outside providers are configured, so reading uses rules", () => {
    process.env["GEMINI_API_KEY"] = "k";
    process.env["GROQ_API_KEY"] = "k";
    process.env["PRACTICE_DATA_RESIDENCY"] = "india";
    expect(practiceLlm()).toBeNull();
  });
});
