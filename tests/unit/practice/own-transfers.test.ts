import { describe, expect, it } from "vitest";
import { pairOwnTransfers, referenceTokens, type TransferLeg } from "@/lib/practice/recon/ownTransfers";

const leg = (o: Partial<TransferLeg>): TransferLeg => ({ id: "x", extractionId: "A", direction: "out", amount: 50000, date: "2026-09-10", reference: null, description: "", ...o });

describe("own-account transfer pairing", () => {
  it("pairs equal and opposite legs on different statements that share a UTR", () => {
    const out = leg({ id: "o", extractionId: "A", direction: "out", description: "NEFT UTR HDFCN52026091012345 TO ICICI" });
    const inn = leg({ id: "i", extractionId: "B", direction: "in", date: "2026-09-11", description: "NEFT CR HDFCN52026091012345 HDFC" });
    const p = pairOwnTransfers([out, inn]);
    expect(p).toHaveLength(1);
    expect(p[0]!.out.id).toBe("o");
    expect(p[0]!.evidence).toMatch(/reference HDFCN52026091012345/);
  });
  it("pairs when a narration names the other account, and not when it names some other account", () => {
    const inn = leg({ id: "i", extractionId: "B", direction: "in", accountTail: "004455", description: "IMPS FROM 778899" });
    expect(pairOwnTransfers([leg({ id: "o", description: "IMPS TO A/C 004455" }), inn])).toHaveLength(1);
    expect(pairOwnTransfers([leg({ id: "o", description: "IMPS TO A/C 998877" }), inn])).toHaveLength(0);
  });
  it("does not pair without evidence, however well the amounts agree", () => {
    expect(pairOwnTransfers([leg({ id: "o" }), leg({ id: "i", extractionId: "B", direction: "in" })])).toHaveLength(0);
  });
  it("does not pair legs from the same statement, more than two days apart, or of different amounts", () => {
    const ref = "UTR9988776655";
    const o = leg({ id: "o", reference: ref });
    expect(pairOwnTransfers([o, leg({ id: "i", extractionId: "A", direction: "in", reference: ref })])).toHaveLength(0);
    expect(pairOwnTransfers([o, leg({ id: "i", extractionId: "B", direction: "in", reference: ref, date: "2026-09-14" })])).toHaveLength(0);
    expect(pairOwnTransfers([o, leg({ id: "i", extractionId: "B", direction: "in", reference: ref, amount: 49999 })])).toHaveLength(0);
  });
  it("leaves an ambiguous leg alone", () => {
    const ref = "UTR9988776655";
    const o = leg({ id: "o", reference: ref });
    const ins = [leg({ id: "i1", extractionId: "B", direction: "in", reference: ref }), leg({ id: "i2", extractionId: "C", direction: "in", reference: ref })];
    expect(pairOwnTransfers([o, ...ins])).toHaveLength(0);
  });
  it("SBI: pairs the bank's own transfer entries (WDL TFR / DEP TFR) with no account number printed, when the partner is unique", () => {
    const out = leg({ id: "o", amount: 150000, description: "WDL TFR TRANSFER TO" });
    const inn = leg({ id: "i", extractionId: "B", direction: "in", amount: 150000, description: "DEP TFR TRANSFER FROM" });
    const p = pairOwnTransfers([out, inn]);
    expect(p).toHaveLength(1);
    expect(p[0]!.evidence).toMatch(/bank's own transfer entries/);
  });
  it("two identical transfers out and two in on one day are paired in order, since any pairing gives the same result", () => {
    const o = (id: string) => leg({ id, amount: 800000, description: "WDL TFR INB Transfer" });
    const i = (id: string) => leg({ id, extractionId: "B", direction: "in", amount: 800000, description: "DEP TFR INB Transfer" });
    const p = pairOwnTransfers([o("o1"), o("o2"), i("i1"), i("i2")]);
    expect(p.map((x) => [x.out.id, x.in.id])).toEqual([["o1", "i1"], ["o2", "i2"]]);
    expect(p[0]!.evidence).toMatch(/2 identical transfers/);
    // The same amount on another day, unpaired, does not stop the group being recognised.
    const other = leg({ id: "far", amount: 800000, date: "2026-03-20", description: "WDL TFR INB Transfer" });
    expect(pairOwnTransfers([o("o1"), o("o2"), i("i1"), i("i2"), other])).toHaveLength(2);
    // Unequal numbers are not guessed.
    expect(pairOwnTransfers([o("o1"), o("o2"), i("i1")])).toHaveLength(0);
  });
  it("two equal transfers with two possible partners are left to a person", () => {
    const out = leg({ id: "o", amount: 150000, description: "WDL TFR TRANSFER TO" });
    const ins = ["i1", "i2"].map((id, n) => leg({ id, extractionId: n ? "C" : "B", direction: "in", amount: 150000, description: "DEP TFR TRANSFER FROM" }));
    expect(pairOwnTransfers([out, ...ins])).toHaveLength(0);
  });
  it("a transfer to a third party is not paired with an ordinary credit", () => {
    const out = leg({ id: "o", amount: 150000, description: "WDL TFR TRANSFER TO" });
    const inn = leg({ id: "i", extractionId: "B", direction: "in", amount: 150000, description: "UPI/CR/RAMESH" });
    expect(pairOwnTransfers([out, inn])).toHaveLength(0);
  });
  it("a one-sided transfer stays unpaired", () => {
    expect(pairOwnTransfers([leg({ id: "o", reference: "UTR9988776655" })])).toHaveLength(0);
  });
  it("a reference needs digits: a long word is not one", () => {
    expect(referenceTokens({ description: "TRANSFERBETWEENACCOUNTS UTR 1234567890" })).toEqual(["1234567890"]);
  });
});
