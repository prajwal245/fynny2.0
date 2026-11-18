import { describe, expect, it } from "vitest";
import { memoryDb } from "../../helpers/memoryDb";

const ctx = { firmId: "f1", firmName: "F", firmEmail: null, userId: "u1", role: "owner" as const };
const bank = (id: string, o: Record<string, unknown> = {}) => ({ id, ca_firm_id: "f1", business_id: "b1", side: "bank", txn_date: "2026-09-10", match_status: "matched", recon_tag: null, ...o });
const match = (id: string, stage: string) => ({ id, ca_firm_id: "f1", business_id: "b1", period_start: "2026-09-01", period_end: "2026-09-30", match_stage: stage });
const exc = (id: string, o: Record<string, unknown> = {}) => ({ id, ca_firm_id: "f1", business_id: "b1", status: "open", work_status: "open", txn_id: id, txn_side: "bank", candidates: [], period_start: "2026-09-01", period_end: "2026-09-30", ...o });

describe("the month's value, from the database", () => {
  it("counts automatic and manual matches, set-asides and the decisions left", async () => {
    const { db } = memoryDb({
      ca_txns: [bank("t1"), bank("t2"), bank("t3"), bank("t4"), bank("t5", { match_status: "ignored", recon_tag: "own_account:t6" }), bank("t6", { match_status: "exception" }), bank("t7", { txn_date: "2026-08-30" })],
      ca_recon_matches: [match("m1", "exact"), match("m2", "fuzzy"), match("m3", "manual"), match("m4", "exact")],
      ca_exceptions: [exc("t6", { candidates: [{ txn_id: "k3" }] }), exc("x2", { work_status: "accepted_timing" }), exc("x3", { txn_side: "books", txn_id: "k3", candidates: [{ txn_id: "t6" }] })],
    });
    const { periodValue } = await import("@/lib/practice/value.server");
    const v = await periodValue(db, ctx, "September 2026");
    expect(v.bankLines).toBe(6); // the August line is not in September
    expect(v.setAside).toBe(1);
    expect(v.autoMatched).toBe(3);
    expect(v.manualMatched).toBe(1);
    // t6 and its book twin are one decision; x2 was accepted as timing, so it is explained.
    expect(v.decisionsLeft).toBe(1);
    expect(v.autoPct).toBe(60); // 3 of 5 work lines
  });
  it("one client's figures do not include another's", async () => {
    const { db } = memoryDb({
      ca_txns: [bank("t1"), bank("t2", { business_id: "b2" })],
      ca_recon_matches: [match("m1", "exact"), { ...match("m2", "exact"), business_id: "b2" }],
      ca_exceptions: [],
    });
    const { periodValue } = await import("@/lib/practice/value.server");
    const v = await periodValue(db, ctx, "September 2026", "b1");
    expect(v.bankLines).toBe(1);
    expect(v.autoMatched).toBe(1);
  });
});
