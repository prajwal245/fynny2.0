import { describe, expect, it } from "vitest";
import { belongsTo, gapLooksLikeGst, isExplained, kindOf, nextStatuses, EXCEPTION_KINDS, KIND_LABEL } from "@/lib/practice/exceptionKinds";

const base = { side: "bank" as const, amount: 10000, narration: "NEFT-ACME LTD" };

describe("exception kinds", () => {
  it("has a label for each of the seven kinds", () => {
    expect(EXCEPTION_KINDS).toHaveLength(7);
    for (const k of EXCEPTION_KINDS) expect(KIND_LABEL[k]).toBeTruthy();
  });
  it("a line nothing matches is unidentified, with its reason", () => {
    const r = kindOf({ ...base, reasonCode: "no_candidate" });
    expect(r.kind).toBe("unidentified");
    expect(r.why).toMatch(/No book entry/);
    expect(kindOf({ ...base, side: "books", reasonCode: "no_candidate" }).why).toMatch(/No bank line/);
  });
  it("different amounts are an amount difference, ₹10,000 against ₹9,800", () => {
    expect(kindOf({ ...base, reasonCode: "amount_mismatch", candidateAmount: 9800 }).kind).toBe("amount_difference");
  });
  it("a gap that GST explains is a GST mismatch, whichever side carries the tax", () => {
    expect(gapLooksLikeGst(11800, 10000)).toBe(true);
    expect(gapLooksLikeGst(10000, 11800)).toBe(true);
    expect(gapLooksLikeGst(10000, 9800)).toBe(false);
    expect(kindOf({ ...base, amount: 11800, reasonCode: "amount_mismatch", candidateAmount: 10000 }).kind).toBe("gst_mismatch");
  });
  it("a date gap, and a book cheque that has not cleared, are timing differences", () => {
    expect(kindOf({ ...base, reasonCode: "date_gap" }).kind).toBe("timing_difference");
    expect(kindOf({ side: "books", amount: 5000, narration: "Cheque 004512 to Sharma", reasonCode: "no_candidate" }).kind).toBe("timing_difference");
    // The same cheque on the bank side is a line nobody explained.
    expect(kindOf({ side: "bank", amount: 5000, narration: "CHQ 004512", reasonCode: "no_candidate" }).kind).toBe("unidentified");
  });
  it("duplicates are named as suspects, never decided", () => {
    const r = kindOf({ ...base, reasonCode: "duplicate_suspect" });
    expect(r.kind).toBe("duplicate");
    expect(r.why).toMatch(/more than once/);
  });
  it("cash and own-account transfers are recognised from the narration", () => {
    expect(kindOf({ ...base, narration: "CASH DEPOSIT CDM MUMBAI", reasonCode: "no_candidate" }).kind).toBe("cash");
    expect(kindOf({ ...base, narration: "ATM WDL 00123", reasonCode: "no_candidate" }).kind).toBe("cash");
    expect(kindOf({ ...base, narration: "TRF TO OWN A/C 00991", reasonCode: "no_candidate" }).kind).toBe("own_account");
    expect(kindOf({ ...base, narration: "x", category: "transfer", reasonCode: "no_candidate" }).kind).toBe("own_account");
  });
  it("does not call an ordinary word cash", () => {
    expect(kindOf({ ...base, narration: "UPI-CASHFREE PAYMENTS", reasonCode: "no_candidate" }).kind).toBe("unidentified");
  });
});

describe("handling status", () => {
  it("only moves through the allowed steps", () => {
    expect(nextStatuses("open")).toContain("query_sent");
    expect(nextStatuses("query_sent")).toContain("answered");
    expect(nextStatuses("resolved")).toEqual([]);
    expect(isExplained("accepted_timing")).toBe(true);
    expect(isExplained("answered")).toBe(false);
  });
  it("sorts into My, Unassigned and All", () => {
    expect(belongsTo({ ownerId: "me" }, "me", "mine")).toBe(true);
    expect(belongsTo({ ownerId: "x" }, "me", "mine")).toBe(false);
    expect(belongsTo({ ownerId: null }, "me", "unassigned")).toBe(true);
    expect(belongsTo({ ownerId: "x" }, "me", "all")).toBe(true);
  });
});
