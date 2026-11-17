import { afterEach, describe, expect, it } from "vitest";
import { withinAiCap } from "@/lib/practice/llm.server";

const fakeDb = (count: number) => ({
  from: () => ({ select: () => ({ eq: () => ({ gte: async () => ({ count, error: null }) }) }) }),
});

describe("daily AI cap", () => {
  afterEach(() => { delete process.env["PRACTICE_AI_DAILY_CAP"]; });
  it("is a safety valve, not a limit: heavy normal use is allowed, only a runaway stops", async () => {
    expect(await withinAiCap(fakeDb(10), "firm")).toBe(true);
    // Reading every page of long statements for a busy firm for a day stays well inside it.
    expect(await withinAiCap(fakeDb(5000), "firm")).toBe(true);
    expect(await withinAiCap(fakeDb(100_000), "firm")).toBe(false);
  });
  it("reads the cap from PRACTICE_AI_DAILY_CAP", async () => {
    process.env["PRACTICE_AI_DAILY_CAP"] = "5";
    expect(await withinAiCap(fakeDb(5), "firm")).toBe(false);
    expect(await withinAiCap(fakeDb(4), "firm")).toBe(true);
  });
});
