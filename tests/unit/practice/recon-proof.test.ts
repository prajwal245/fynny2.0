import { describe, expect, it } from "vitest";
import { proveReconciliation, type ProofMatch, type ProofTxn } from "@/lib/practice/recon/proof";

const T = (id: string, side: "bank" | "books", amount: number, date: string, direction: "in" | "out" = "out", status = "matched"): ProofTxn => ({ id, side, direction, amount, txn_date: date, match_status: status });
const R = { start: "2025-05-01", end: "2025-05-31" };

describe("post-match proof (RC-6)", () => {
  const txns = [T("b1", "bank", 500, "2025-05-03"), T("k1", "books", 500, "2025-05-03"), T("b2", "bank", 500, "2025-05-03"), T("k2", "books", 500, "2025-05-03")];
  const good: ProofMatch[] = [{ bank_txn_id: "b1", book_txn_ids: ["k1"] }, { bank_txn_id: "b2", book_txn_ids: ["k2"] }];
  it("passes when every line is used once and every match nets to zero", () => {
    const p = proveReconciliation(txns, good, R);
    expect(p.ok).toBe(true);
    expect(p.checks.map((c) => c.id)).toEqual(["RC-6a", "RC-6b", "RC-6c", "RC-6d", "RC-6e"]);
  });
  it("catches a line used twice (the SSSL 779 to 670 failure)", () => {
    const p = proveReconciliation(txns, [good[0]!, { bank_txn_id: "b2", book_txn_ids: ["k1"] }], R);
    expect(p.ok).toBe(false);
    expect(p.checks[0]!.offenders).toEqual(["k1"]);
    expect(p.checks[0]!.detail).toMatch(/used in more than one match/);
  });
  it("catches a match that does not net to zero unless it states the difference", () => {
    const off = [T("b1", "bank", 500, "2025-05-03"), T("k1", "books", 480, "2025-05-03")];
    expect(proveReconciliation(off, [{ bank_txn_id: "b1", book_txn_ids: ["k1"] }], R).checks[1]!.ok).toBe(false);
    expect(proveReconciliation(off, [{ bank_txn_id: "b1", book_txn_ids: ["k1"], explanation: { amount_diff: 20 } }], R).checks[1]!.ok).toBe(true);
  });
  it("adds several book entries against one bank line (a split) to the same total", () => {
    const s = [T("b1", "bank", 500, "2025-05-03"), T("k1", "books", 300, "2025-05-03"), T("k2", "books", 200, "2025-05-04")];
    expect(proveReconciliation(s, [{ bank_txn_id: "b1", book_txn_ids: ["k1", "k2"] }], R).ok).toBe(true);
  });
  it("catches money in matched with money out, and a bank line outside the period", () => {
    const w = [T("b1", "bank", 100, "2025-05-03", "in"), T("k1", "books", 100, "2025-05-03", "out")];
    expect(proveReconciliation(w, [{ bank_txn_id: "b1", book_txn_ids: ["k1"] }], R).checks[2]!.ok).toBe(false);
    const o = [T("b1", "bank", 100, "2025-06-03"), T("k1", "books", 100, "2025-06-03")];
    expect(proveReconciliation(o, [{ bank_txn_id: "b1", book_txn_ids: ["k1"] }], R).checks[3]!.ok).toBe(false);
  });
  it("catches a counter that disagrees with the lists", () => {
    const c = [...txns, T("b3", "bank", 9, "2025-05-09", "out", "matched")];
    const p = proveReconciliation(c, good, R);
    expect(p.checks[4]!.ok).toBe(false);
    expect(p.checks[4]!.offenders).toContain("b3");
  });
  it("is deterministic", () => {
    expect(JSON.stringify(proveReconciliation(txns, good, R))).toBe(JSON.stringify(proveReconciliation(txns, good, R)));
  });
});
