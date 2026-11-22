import { describe, expect, it } from "vitest";
import { guardedJson, mapLimit, redact } from "@/lib/practice/agents/ai";
import {
  aiSuggestLedger,
  interpretReplyAi,
} from "@/lib/practice/agents/aiAssist";
import { z } from "zod";
import type { LlmClient } from "@/lib/practice/extract/pipeline";

const fake = (data: unknown | (() => never), delay = 0): LlmClient =>
  ({
    json: async () => {
      if (delay) await new Promise((r) => setTimeout(r, delay));
      if (typeof data === "function") return (data as () => never)();
      return { data, model: "fake" };
    },
  }) as unknown as LlmClient;
const NOW = new Date("2026-11-22T10:00:00Z");

describe("guardedJson", () => {
  const s = z.object({ a: z.number() });
  it("never throws", async () => {
    expect(
      (await guardedJson(null, { purpose: "t", system: "", user: "" }, s)).ok,
    ).toBe(false);
    const boom = fake(() => {
      throw new Error("503");
    });
    expect(
      await guardedJson(boom, { purpose: "t", system: "", user: "" }, s),
    ).toMatchObject({ ok: false, reason: "error" });
    expect(
      await guardedJson(
        fake({ a: "x" }),
        { purpose: "t", system: "", user: "" },
        s,
      ),
    ).toMatchObject({ ok: false, reason: "invalid" });
    expect(
      await guardedJson(
        fake({ a: 1 }, 50),
        { purpose: "t", system: "", user: "" },
        s,
        { timeoutMs: 5 },
      ),
    ).toMatchObject({ ok: false, reason: "timeout" });
    expect(
      await guardedJson(
        fake({ a: 1 }),
        { purpose: "t", system: "", user: "" },
        s,
      ),
    ).toMatchObject({ ok: true, data: { a: 1 } });
  });
  it("masks identifiers", () => {
    const r = redact(
      "pay ravi@x.com PAN ABCDE1234F ph 9876543210 acct 123456789012 https://a.b/c",
    );
    expect(r).not.toMatch(/ravi|ABCDE|9876|123456789012|https/);
  });
  it("limits concurrency and keeps order", async () => {
    let live = 0,
      peak = 0;
    const out = await mapLimit([1, 2, 3, 4, 5, 6], 2, async (n) => {
      live++;
      peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 5));
      live--;
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10, 12]);
    expect(peak).toBeLessThanOrEqual(2);
  });
});

describe("interpretReplyAi", () => {
  it("does not call the model when rules are sure, and never downgrades a stop", async () => {
    const llm = fake(() => {
      throw new Error("must not be called");
    });
    expect((await interpretReplyAi("STOP", NOW, llm)).kind).toBe("stop");
  });
  it("uses the model for free wording and validates the date", async () => {
    const ok = await interpretReplyAi(
      "arre bhai ye sab mere CA ke paas hai, wo Monday tak bhej denge zaroor",
      NOW,
      fake({ kind: "promise", promisedDate: "2026-11-23", confidence: 0.99 }),
    );
    expect(ok).toMatchObject({
      source: "ai",
      kind: "promise",
      promisedDate: "2026-11-23",
      requiresConfirmation: true,
    });
    expect(ok.confidence).toBeLessThanOrEqual(0.9);
  });
  it("demotes an impossible date to an answer", async () => {
    const r = await interpretReplyAi(
      "will do it after some more time passes etc",
      NOW,
      fake({ kind: "promise", promisedDate: "2024-01-01", confidence: 0.9 }),
    );
    expect(r).toMatchObject({ kind: "answer", promisedDate: null });
  });
  it("falls back to the rules on failure", async () => {
    const r = await interpretReplyAi(
      "hmm ok then maybe",
      NOW,
      fake(() => {
        throw new Error("x");
      }),
    );
    expect(r.source).toBe("rules");
  });
});

describe("aiSuggestLedger", () => {
  const ledgers = ["Office Rent", "Telephone", "Salary"];
  it("accepts only a listed ledger, ignoring case", async () => {
    expect(
      await aiSuggestLedger(
        "AIRTEL POSTPAID",
        ledgers,
        fake({ ledger: "telephone", confidence: 0.95 }),
      ),
    ).toMatchObject({ ledger: "Telephone", requiresConfirmation: true });
  });
  it("rejects an invented ledger", async () => {
    expect(
      await aiSuggestLedger(
        "X",
        ledgers,
        fake({ ledger: "Crypto Mining", confidence: 0.99 }),
      ),
    ).toMatchObject({ ledger: null, confidence: 0 });
  });
  it("returns null with no client or on failure", async () => {
    expect(await aiSuggestLedger("X", ledgers, null)).toBeNull();
    expect(await aiSuggestLedger("X", [], fake({}))).toBeNull();
  });
});
