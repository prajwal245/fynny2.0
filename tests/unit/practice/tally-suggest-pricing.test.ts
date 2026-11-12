import { describe, expect, it } from "vitest";
import { suggestLedger } from "@/lib/practice/tallyLedgerSuggest";
import { PAGE_PACKS, pagesLeft } from "@/lib/practice/tallyPricing";

const ledgers = [
  "HDFC Bank",
  "Rao Steels",
  "Sundara Traders",
  "Sundara Textiles",
  "Bank Charges",
  "Cash",
];

describe("ledger suggestion", () => {
  it("suggests an existing ledger when the payee clearly matches", () => {
    const s = suggestLedger(
      { counterparty: "RAO STEELS", description: "NEFT", reference: null },
      ledgers,
      "HDFC Bank",
    );
    expect(s).toMatchObject({ kind: "suggest", ledger: "Rao Steels" });
  });
  it("never suggests the bank itself or cash", () => {
    const s = suggestLedger(
      { counterparty: "HDFC Bank", description: "", reference: null },
      ledgers,
      "HDFC Bank",
    );
    expect(s.kind).not.toBe("suggest");
  });
  it("says none, not a guess, when nothing is close", () => {
    const s = suggestLedger(
      { counterparty: "Zenith Polymers", description: "UPI", reference: null },
      ledgers,
    );
    expect(s.kind).toBe("none");
    expect(s.kind === "none" && s.reason).toMatch(/new ledger/);
  });
  it("is uncertain when two ledgers are equally close", () => {
    const s = suggestLedger(
      { counterparty: "Sundara", description: "", reference: null },
      ["Sundara Traders", "Sundara Textiles"],
    );
    expect(["uncertain", "none"]).toContain(s.kind);
    expect(s.kind).not.toBe("suggest");
  });
  it("handles empty input without throwing", () => {
    expect(
      suggestLedger(
        { counterparty: null, description: null, reference: null },
        ledgers,
      ).kind,
    ).toBe("none");
    expect(
      suggestLedger(
        { counterparty: "X", description: null, reference: null },
        [],
      ).kind,
    ).toBe("none");
  });
});

describe("page pack pricing: 15% below the reference", () => {
  it("prices match 85% of ₹2 and ₹1 per page", () => {
    const by = Object.fromEntries(PAGE_PACKS.map((p) => [p.key, p]));
    expect(by["regular-200"]).toMatchObject({
      referencePrice: 400,
      price: 340,
      gst: 61.2,
      total: 401.2,
    });
    expect(by["regular-400"].price).toBe(680);
    expect(by["regular-600"].price).toBe(1020);
    expect(by["pro-3000"]).toMatchObject({
      referencePrice: 3000,
      price: 2550,
      gst: 459,
      total: 3009,
    });
  });
  it("every pack is exactly 15% below its reference", () => {
    for (const p of PAGE_PACKS)
      expect(p.price).toBe(Math.round(p.referencePrice * 0.85));
  });
  it("pages left never goes below zero", () => {
    expect(pagesLeft(200, 250)).toBe(0);
    expect(pagesLeft(200, 50)).toBe(150);
    expect(pagesLeft(200, -5)).toBe(200);
  });
});

describe("the standard items on every bank statement", () => {
  const L = [
    "HDFC Bank",
    "Bank Charges",
    "Interest Received",
    "Interest Paid on Loan",
    "Cash",
    "Rao Steels",
  ];
  const ask = (description: string, direction: "in" | "out", ledgers = L) =>
    suggestLedger(
      { counterparty: null, description, reference: null, direction },
      ledgers,
      "HDFC Bank",
    );
  it("bank charges go to the Bank Charges ledger, only when money went out", () => {
    expect(ask("SMS CHGS 01-10-26 TO 31-10-26", "out")).toMatchObject({
      kind: "suggest",
      ledger: "Bank Charges",
    });
    expect(ask("SMS CHGS", "in").kind).not.toBe("suggest");
  });
  it("interest credited and interest charged go to different ledgers", () => {
    expect(ask("INT.PD:01-08-2026 to 31-10-2026", "in")).toMatchObject({
      kind: "suggest",
      ledger: "Interest Received",
    });
    expect(ask("INT.COLL LOAN 4455", "out")).toMatchObject({
      kind: "suggest",
      ledger: "Interest Paid on Loan",
    });
  });
  it("is silent when the ledger does not exist or two fit, never inventing one", () => {
    expect(ask("SMS CHGS", "out", ["HDFC Bank", "Rao Steels"]).kind).toBe(
      "none",
    );
    expect(ask("SMS CHGS", "out", ["Bank Charges", "Bank Fees"]).kind).not.toBe(
      "suggest",
    );
  });
  it("a cash withdrawal is guided to a Contra, not given a ledger", () => {
    const s = ask("ATM WDL SELF 00231", "out");
    expect(s.kind).toBe("none");
    expect(s.kind === "none" && s.reason).toMatch(/Transfer between my own/);
    expect(s.kind === "none" && s.reason).toMatch(/"Cash"/);
  });
  it("a payee that is a real ledger still wins its normal match", () => {
    expect(ask("NEFT-RAO STEELS-INV 9", "out")).toMatchObject({
      kind: "suggest",
      ledger: "Rao Steels",
    });
  });
});
