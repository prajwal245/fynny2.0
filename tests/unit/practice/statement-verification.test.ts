import { describe, expect, it } from "vitest";
import { countsAsVerified, verificationOf } from "@/lib/practice/statementVerification";

describe("statement verification result", () => {
  it("is not available when nothing was recorded or there is no running balance", () => {
    expect(verificationOf(null).result).toBe("not_available");
    expect(verificationOf({ status: "unknown", headline: "No balances" }).result).toBe("not_available");
  });
  it("passes, and says when the bank prints no summary to compare", () => {
    const v = verificationOf({ status: "pass" });
    expect(v.result).toBe("passed");
    expect(v.summary).toBe("not_available");
    expect(v.reasons[0]).toMatch(/running balance/);
    expect(verificationOf({ status: "pass", bankTie: { tied: true, source: "HDFC" } }).summary).toBe("tied");
  });
  it("a failed statement is held, with the discrepancy, until a person accepts it", () => {
    const sc = { status: "fail", headline: "x", checks: [{ ok: false, label: "Transaction count", detail: "Read 160, the bank prints 161." }], bankTie: { tied: false, source: "HDFC" } };
    const v = verificationOf(sc);
    expect(v).toMatchObject({ result: "failed", held: true, summary: "not_tied" });
    expect(v.reasons).toEqual(["Read 160, the bank prints 161."]);
    expect(countsAsVerified(v)).toBe(false);
    const accepted = verificationOf({ ...sc, accepted: { by: "Asha", at: "2026-11-16", note: "Page 3 was blank" } });
    expect(accepted).toMatchObject({ held: false, label: "Failed, accepted", acceptedBy: "Asha" });
    expect(countsAsVerified(accepted)).toBe(true);
  });
});
