import { describe, expect, it } from "vitest";
import { suggestLedger } from "@/lib/practice/tallyLedgerSuggest";
import { PAGE_PACKS, pagesLeft } from "@/lib/practice/tallyPricing";

const ledgers = ["HDFC Bank", "Rao Steels", "Sundara Traders", "Sundara Textiles", "Bank Charges", "Cash"];

describe("ledger suggestion", () => {
  it("suggests an existing ledger when the payee clearly matches", () => {
    const s = suggestLedger({ counterparty: "RAO STEELS", description: "NEFT", reference: null }, ledgers, "HDFC Bank");
    expect(s).toMatchObject({ kind: "suggest", ledger: "Rao Steels" });
  });
  it("never suggests the bank itself or cash", () => {
    const s = suggestLedger({ counterparty: "HDFC Bank", description: "", reference: null }, ledgers, "HDFC Bank");
    expect(s.kind).not.toBe("suggest");
  });
  it("says none, not a guess, when nothing is close", () => {
    const s = suggestLedger({ counterparty: "Zenith Polymers", description: "UPI", reference: null }, ledgers);
    expect(s.kind).toBe("none");
    expect(s.kind === "none" && s.reason).toMatch(/new ledger/);
  });
  it("is uncertain when two ledgers are equally close", () => {
    const s = suggestLedger({ counterparty: "Sundara", description: "", reference: null }, ["Sundara Traders", "Sundara Textiles"]);
    expect(["uncertain", "none"]).toContain(s.kind);
    expect(s.kind).not.toBe("suggest");
  });
  it("handles empty input without throwing", () => {
    expect(suggestLedger({ counterparty: null, description: null, reference: null }, ledgers).kind).toBe("none");
    expect(suggestLedger({ counterparty: "X", description: null, reference: null }, []).kind).toBe("none");
  });
});

describe("page pack pricing: 15% below the reference", () => {
  it("prices match 85% of ₹2 and ₹1 per page", () => {
    const by = Object.fromEntries(PAGE_PACKS.map((p) => [p.key, p]));
    expect(by["regular-200"]).toMatchObject({ referencePrice: 400, price: 340, gst: 61.2, total: 401.2 });
    expect(by["regular-400"].price).toBe(680);
    expect(by["regular-600"].price).toBe(1020);
    expect(by["pro-3000"]).toMatchObject({ referencePrice: 3000, price: 2550, gst: 459, total: 3009 });
  });
  it("every pack is exactly 15% below its reference", () => {
    for (const p of PAGE_PACKS) expect(p.price).toBe(Math.round(p.referencePrice * 0.85));
  });
  it("pages left never goes below zero", () => {
    expect(pagesLeft(200, 250)).toBe(0);
    expect(pagesLeft(200, 50)).toBe(150);
    expect(pagesLeft(200, -5)).toBe(200);
  });
});
