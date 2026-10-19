import { describe, expect, it } from "vitest";
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

  it("finds the April to March year", () => {
    expect(fyStartOf("2026-03-31")).toBe("2025-04-01");
    expect(fyStartOf("2026-04-01")).toBe("2026-04-01");
    expect(fyStartOf("2026-12-31")).toBe("2026-04-01");
  });
});
