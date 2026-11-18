import { describe, expect, it } from "vitest";
import { memoryDb } from "../../helpers/memoryDb";
import { applyLearned, ledgerPattern, learnChoice } from "@/lib/practice/ledgerLearning";
import type { Suggestion } from "@/lib/practice/tallyLedgerSuggest";

const none: Suggestion = { kind: "none", reason: "No match." };
const line = { direction: "out" as const, counterparty: null, description: "UPI/512383420328/Mess supplies Ramesh Stores/7780185646@axl" };

describe("what a line is remembered by", () => {
  it("is the narration without references, and the same for the next month's line", () => {
    const a = ledgerPattern(line);
    const b = ledgerPattern({ ...line, description: "UPI/612999111222/Mess supplies Ramesh Stores/9990001111@axl" });
    expect(a).toBeTruthy();
    expect(a).toBe(b);
    expect(a.startsWith("ledger:out:")).toBe(true);
  });
  it("separates receipts from payments and ignores narrations too generic to learn from", () => {
    expect(ledgerPattern({ ...line, direction: "in" })).not.toBe(ledgerPattern(line));
    expect(ledgerPattern({ direction: "out", description: "payment" })).toBe("");
    expect(ledgerPattern({ direction: "out", description: "NEFT 123456789" })).toBe("");
  });
});

describe("choosing and re-choosing", () => {
  it("counts repeats of the same ledger", () => {
    expect(learnChoice(null, "Mess Expenses")).toEqual({ ledger: "Mess Expenses", taught: 1 });
    expect(learnChoice({ ledger: "Mess Expenses", taught: 2 }, "mess expenses")).toMatchObject({ ledger: "Mess Expenses", taught: 3 });
  });
  it("a single different choice does not replace a habit, a repeated one does", () => {
    let r = learnChoice({ ledger: "Mess Expenses", taught: 3 }, "Site Expenses");
    expect(r).toMatchObject({ ledger: "Mess Expenses", taught: 3 });
    r = learnChoice(r, "Site Expenses");
    r = learnChoice(r, "Site Expenses");
    expect(r).toMatchObject({ ledger: "Site Expenses", taught: 3 });
  });
});

describe("using what was learned", () => {
  const ledgers = ["Mess Expenses", "Site Expenses", "HDFC Bank"];
  it("puts the learned ledger first, with the reason in words, only when it is still in Tally", () => {
    const s = applyLearned(none, { pattern: "p", ledger: "mess expenses", taught: 3 }, ledgers);
    expect(s).toMatchObject({ kind: "suggest", ledger: "Mess Expenses" });
    expect((s as { reason: string }).reason).toMatch(/3 similar lines before/);
    expect(applyLearned(none, { pattern: "p", ledger: "Deleted Ledger", taught: 5 }, ledgers)).toBe(none);
    expect(applyLearned(none, undefined, ledgers)).toBe(none);
  });
  it("overrides an uncertain guess and agrees with a matching one", () => {
    const uncertain: Suggestion = { kind: "uncertain", candidates: [{ ledger: "Site Expenses", confidence: 0.8 }], reason: "Two close." };
    expect(applyLearned(uncertain, { pattern: "p", ledger: "Mess Expenses", taught: 1 }, ledgers)).toMatchObject({ kind: "suggest", ledger: "Mess Expenses" });
    const same: Suggestion = { kind: "suggest", ledger: "Mess Expenses", confidence: 0.8, reason: "Name matches." };
    expect(applyLearned(same, { pattern: "p", ledger: "Mess Expenses", taught: 2 }, ledgers)).toMatchObject({ confidence: 0.95 });
  });
});

describe("storing the choice", () => {
  it("teaches on the first approval and strengthens on the next", async () => {
    const { db, tables } = memoryDb({ ca_agent_memory: [] });
    const { teachLedger } = await import("@/lib/practice/tallyPosting.server");
    const ctx = { firmId: "f1", firmName: "F", firmEmail: null, userId: "u1", role: "owner" as const };
    await teachLedger(db, ctx, "b1", line, "Mess Expenses");
    await teachLedger(db, ctx, "b1", { ...line, description: "UPI/999/Mess supplies Ramesh Stores/1@axl" }, "Mess Expenses");
    const rows = tables["ca_agent_memory"] as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "ledger_choice", times_taught: 2 });
    expect((rows[0]!["lesson"] as { ledger: string }).ledger).toBe("Mess Expenses");
  });
});
