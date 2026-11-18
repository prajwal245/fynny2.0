import { describe, expect, it } from "vitest";
import { openExceptions } from "@/v2/lib/exceptions";

const ex = (id: string, o: Record<string, unknown> = {}) => ({ id, status: "open", side: "bank", workStatus: "open", ...o });

describe("what counts as an open exception", () => {
  it("leaves out a decision accepted as timing, so the queue, the client tab and the recon card agree with Close", () => {
    const all = [ex("a"), ex("b", { workStatus: "accepted_timing" }), ex("c", { workStatus: "query_sent" })];
    expect(openExceptions(all).map((e) => e.id)).toEqual(["a", "c"]);
  });
  it("a bank line and its book entry are one decision: accepting the bank line settles the pair", () => {
    const bank = ex("b1", { txnId: "T1", candidateIds: ["K1"], workStatus: "accepted_timing" });
    const book = ex("k1", { side: "books", txnId: "K1", candidateIds: ["T1"] });
    expect(openExceptions([bank, book])).toHaveLength(0);
    expect(openExceptions([{ ...bank, workStatus: "open" }, book])).toHaveLength(1);
  });
  it("a resolved exception is not open either, and a closed one never was", () => {
    expect(openExceptions([ex("a", { workStatus: "resolved" }), ex("b", { status: "resolved" })])).toHaveLength(0);
  });
});
