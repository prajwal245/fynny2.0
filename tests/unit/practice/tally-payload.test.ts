import { describe, expect, it } from "vitest";
import { createLimiter, isOlder, LATEST_AGENT_VERSION } from "@/lib/practice/tally/limits";
// @ts-expect-error plain ESM script shipped to client PCs
import { AGENT_VERSION } from "../../../tools/tally-agent/lib.mjs";
import { fyStartOf, ingestPayload, newAgentToken, newPairingCode, normaliseCode, normaliseSnapshot, sha256, snapshotPayload } from "@/lib/practice/tally/payload";

const snap = {
  kind: "snapshot" as const,
  company: "Kaveri Traders",
  fyStart: "2026-04-01",
  asOn: "2026-09-30",
  groups: [{ name: "Sundry Debtors", parent: "Current Assets" }, { name: "sundry debtors", parent: "Current Assets" }],
  ledgers: [
    { name: "Kaveri Fashions", parent: "Sundry Debtors", closing: -200000 }, // Tally: debit is negative
    { name: "Web Sales", parent: "Sales Accounts", closing: 900000.5 },
    { name: "Web Sales", parent: "Sales Accounts", closing: 100 }, // same ledger twice in one export
  ],
};

describe("Tally agent payload", () => {
  it("flips Tally's signs and merges repeated ledgers", () => {
    const n = normaliseSnapshot(snapshotPayload.parse(snap));
    expect(n.groups).toHaveLength(1);
    expect(n.ledgers.find((l) => l.name === "Kaveri Fashions")!.closing).toBe(200000);
    expect(n.ledgers.find((l) => l.name === "Web Sales")!.closing).toBe(-900100.5);
  });

  it("rejects bad shapes before they reach the database", () => {
    expect(ingestPayload.safeParse({ ...snap, asOn: "30/09/2026" }).success).toBe(false);
    expect(ingestPayload.safeParse({ ...snap, ledgers: [{ name: "", parent: "x", closing: 1 }] }).success).toBe(false);
    expect(ingestPayload.safeParse({ ...snap, ledgers: [{ name: "x", parent: "y", closing: Number.NaN }] }).success).toBe(false);
    expect(ingestPayload.safeParse({ kind: "other" }).success).toBe(false);
    expect(ingestPayload.safeParse({ kind: "companies", companies: [{ name: "A" }] }).success).toBe(true);
  });

  it("makes codes that are easy to read out, and compares them without punctuation or case", () => {
    const code = newPairingCode();
    expect(code).toMatch(/^FYN-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
    expect(normaliseCode(" fyn-7k3q-9xpa ")).toBe("FYN7K3Q9XPA");
  });

  it("hashes tokens and never repeats them", async () => {
    const a = newAgentToken();
    expect(a).toMatch(/^fhta_[0-9a-f]{64}$/);
    expect(a).not.toBe(newAgentToken());
    expect(await sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("flips the sign of group values too, which is how Stock-in-Hand arrives", () => {
    const n = normaliseSnapshot(snapshotPayload.parse({ ...snap, groups: [{ name: "Stock-in-Hand", parent: "Current Assets", opening: -100000, closing: -150000 }, { name: "Plain", parent: "Current Assets" }] }));
    expect(n.groups.find((g) => g.name === "Stock-in-Hand")).toMatchObject({ opening: 100000, closing: 150000 });
    expect(n.groups.find((g) => g.name === "Plain")).toEqual({ name: "Plain", parent: "Current Assets" });
  });

  it("limits attempts per key within a window, then lets them through again", () => {
    const l = createLimiter({ max: 3, windowMs: 1000 });
    expect([1, 2, 3, 4].map(() => l.hit("a", 0))).toEqual([true, true, true, false]);
    expect(l.hit("b", 0)).toBe(true); // another caller is unaffected
    expect(l.hit("a", 1001)).toBe(true);
  });

  it("knows which agent versions are old", () => {
    expect(isOlder("0.1.0", "0.2.0")).toBe(true);
    expect(isOlder("0.2.0", "0.2.0")).toBe(false);
    expect(isOlder("0.10.0", "0.9.0")).toBe(false);
    expect(isOlder(null, "0.2.0")).toBe(true);
    expect(isOlder("beta", "0.2.0")).toBe(true);
  });

  it("keeps the server's idea of the newest agent in step with the agent itself", () => {
    expect(LATEST_AGENT_VERSION).toBe(AGENT_VERSION);
  });

  it("finds the April to March year", () => {
    expect(fyStartOf("2026-03-31")).toBe("2025-04-01");
    expect(fyStartOf("2026-04-01")).toBe("2026-04-01");
    expect(fyStartOf("2026-12-31")).toBe("2026-04-01");
  });
});
