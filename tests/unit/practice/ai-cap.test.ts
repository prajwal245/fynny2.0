import { afterEach, describe, expect, it } from "vitest";
import { withinAiCap } from "@/lib/practice/llm.server";

const fakeDb = (count: number) => ({
  from: () => ({ select: () => ({ eq: () => ({ gte: async () => ({ count, error: null }) }) }) }),
});

describe("daily AI cap", () => {
  afterEach(() => { delete process.env["PRACTICE_AI_DAILY_CAP"]; });
  it("allows AI under the cap and stops at it", async () => {
    expect(await withinAiCap(fakeDb(10), "firm")).toBe(true);
    expect(await withinAiCap(fakeDb(1500), "firm")).toBe(false);
  });
  it("reads the cap from PRACTICE_AI_DAILY_CAP", async () => {
    process.env["PRACTICE_AI_DAILY_CAP"] = "5";
    expect(await withinAiCap(fakeDb(5), "firm")).toBe(false);
    expect(await withinAiCap(fakeDb(4), "firm")).toBe(true);
  });
});
