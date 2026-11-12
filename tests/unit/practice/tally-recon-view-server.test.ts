// @vitest-environment node
/** The reconciliation view and the approval holds on an in-memory database. */
import { describe, expect, it } from "vitest";
import type { Db, FirmContext } from "@/lib/practice/db.server";
import { approvalHolds, reconView } from "@/lib/practice/tallyReconView.server";

type Row = Record<string, unknown>;
function fakeDb(tables: Record<string, Row[]>) {
  const builder = (name: string) => {
    let rows = tables[name] ?? [];
    const q: Record<string, unknown> = {};
    q["select"] = () => q;
    q["eq"] = (k: string, v: unknown) => (
      (rows = rows.filter((r) => r[k] === v)),
      q
    );
    q["in"] = (k: string, vs: unknown[]) => (
      (rows = rows.filter((r) => vs.includes(r[k]))),
      q
    );
    q["gte"] = (k: string, v: string) => (
      (rows = rows.filter((r) => String(r[k]) >= v)),
      q
    );
    q["lte"] = (k: string, v: string) => (
      (rows = rows.filter((r) => String(r[k]) <= v)),
      q
    );
    q["order"] = () => q;
    q["limit"] = () => q;
    q["then"] = (res: (v: unknown) => unknown) =>
      res({ data: rows, error: null });
    return q;
  };
  return { from: builder } as unknown as Db;
}
const ctx: FirmContext = {
  firmId: "f1",
  firmName: "Rao & Co",
  firmEmail: null,
  userId: "u1",
  role: "partner",
};
const bank = (id: string, o: Row) => ({
  id,
  ca_firm_id: "f1",
  business_id: "b1",
  side: "bank",
  extraction_id: "d1",
  match_status: "unmatched",
  direction: "out",
  counterparty: null,
  description: null,
  reference: null,
  ...o,
});
const books = (id: string, o: Row) => ({
  id,
  ca_firm_id: "f1",
  business_id: "b1",
  side: "books",
  match_status: "unmatched",
  direction: "out",
  counterparty: null,
  description: null,
  reference: null,
  category: null,
  ...o,
});

const world = () =>
  fakeDb({
    ca_txns: [
      bank("t1", {
        txn_date: "2026-10-05",
        amount: 1000,
        counterparty: "Rao Steels",
        match_status: "matched",
      }),
      bank("t2", {
        txn_date: "2026-10-10",
        amount: 10000,
        counterparty: "Kerala Pepper",
        match_status: "exception",
      }),
      bank("t3", {
        txn_date: "2026-10-13",
        amount: 5502.73,
        counterparty: "Cash office",
        match_status: "exception",
      }),
      bank("t4", {
        txn_date: "2026-10-20",
        amount: 900,
        direction: "in",
        counterparty: "Krishna Kitchen",
        match_status: "exception",
      }),
      books("k1", {
        txn_date: "2026-10-05",
        amount: 1000,
        counterparty: "Rao Steels",
        match_status: "matched",
      }),
      books("k2", {
        txn_date: "2026-10-08",
        amount: 12000,
        counterparty: "Kerala Pepper",
      }),
      // Typed into Tally after the last sync, same amount and a day apart from t3, never paired with it.
      books("k3", {
        txn_date: "2026-10-12",
        amount: 5502.73,
        description: "Staff welfare paid",
      }),
    ],
    ca_recon_matches: [
      {
        bank_txn_id: "t1",
        book_txn_ids: ["k1"],
        match_stage: "exact",
        match_score: 1,
        explanation: { amount_diff: 0, date_gap_days: 0 },
        ca_firm_id: "f1",
        status: "active",
      },
    ],
    ca_exceptions: [
      {
        txn_id: "t2",
        ca_firm_id: "f1",
        status: "open",
        reason_code: "partial_payment_suspect",
        detail: "Same party, ₹10,000 against ₹12,000.",
        candidates: [{ txn_id: "k2", score: 0.9 }],
      },
      {
        txn_id: "t3",
        ca_firm_id: "f1",
        status: "open",
        reason_code: "no_candidate",
        detail: "No entry.",
        candidates: [],
      },
      {
        txn_id: "t4",
        ca_firm_id: "f1",
        status: "open",
        reason_code: "no_candidate",
        detail: "No entry.",
        candidates: [],
      },
    ],
    ca_document_extractions: [
      {
        id: "d1",
        ca_firm_id: "f1",
        business_id: "b1",
        side: "bank",
        original_filename: "HDFC Oct.csv",
        created_at: "2026-11-01",
        extracted: {
          text_preview: "HDFC BANK LTD\nAccount No : 50200071184402\n",
        },
      },
    ],
  });

describe("the view of a statement", () => {
  it("tags every line, splits debit and credit, and compares the account with each bank ledger", async () => {
    const v = await reconView(world(), ctx, "b1", {
      documentId: "d1",
      bankLedgers: ["HDFC Bank A/c 50200071", "ICICI Bank CA 6205"],
      postedByTxn: new Map(),
    });
    const by = Object.fromEntries(v.rows.map((r) => [r.txn_id, r]));
    expect(by.t1).toMatchObject({
      status: "matched",
      debit: null,
      credit: 1000,
    });
    expect(by.t1!.tally).toHaveLength(1);
    expect(by.t2).toMatchObject({
      status: "partial",
      nearest: { id: "k2", amount: 12000 },
      difference: { amount: -2000, days: 2 },
    });
    expect(by.t3).toMatchObject({ status: "missing", credit: 5502.73 });
    expect(by.t4).toMatchObject({
      status: "missing",
      debit: 900,
      credit: null,
    });
    expect(v.counts).toEqual({ matched: 1, partial: 1, missing: 2, pushed: 0 });
    expect(v.statement).toEqual({ accountNo: "50200071184402", bank: "HDFC" });
    expect(v.accountChecks["HDFC Bank A/c 50200071"]!.state).toBe("match");
    expect(v.accountChecks["ICICI Bank CA 6205"]!.state).toBe("mismatch");
  });
  it("a line Tally seems to hold already is flagged; one that is not is not", async () => {
    const v = await reconView(world(), ctx, "b1", {
      documentId: "d1",
      bankLedgers: [],
      postedByTxn: new Map(),
    });
    const by = Object.fromEntries(v.rows.map((r) => [r.txn_id, r]));
    expect(by.t3!.looksInTally).toHaveLength(1);
    expect(by.t3!.looksInTally[0]!.warning).toMatch(
      /already has a payment of ₹5,502\.73 on 2026-10-12: Staff welfare paid/,
    );
    expect(by.t4!.looksInTally).toEqual([]);
  });
  it("a line already written to Tally shows as sent until the next sync", async () => {
    const v = await reconView(world(), ctx, "b1", {
      documentId: "d1",
      bankLedgers: [],
      postedByTxn: new Map([["t4", "posted"]]),
    });
    expect(v.rows.find((r) => r.txn_id === "t4")!.status).toBe("pushed");
  });
});

describe("what stops an approval until a person confirms", () => {
  const t3 = {
    business_id: "b1",
    extraction_id: "d1",
    direction: "out" as const,
    amount: 5502.73,
    txn_date: "2026-10-13",
  };
  const t4 = {
    business_id: "b1",
    extraction_id: "d1",
    direction: "in" as const,
    amount: 900,
    txn_date: "2026-10-20",
  };
  it("a statement that belongs to another bank needs the bank confirmed", async () => {
    const h = await approvalHolds(world(), ctx, t4, "ICICI Bank CA 6205", {});
    expect(h).toMatchObject({ code: "bank_mismatch" });
    expect(
      await approvalHolds(world(), ctx, t4, "ICICI Bank CA 6205", {
        bank: true,
      }),
    ).toBeNull();
  });
  it("an entry Tally seems to hold already needs a person to say it is different", async () => {
    const h = await approvalHolds(
      world(),
      ctx,
      t3,
      "HDFC Bank A/c 50200071",
      {},
    );
    expect(h).toMatchObject({ code: "looks_duplicate" });
    expect(
      await approvalHolds(world(), ctx, t3, "HDFC Bank A/c 50200071", {
        notDuplicate: true,
      }),
    ).toBeNull();
  });
  it("a clean line passes with no confirmation", async () => {
    expect(
      await approvalHolds(world(), ctx, t4, "HDFC Bank A/c 50200071", {}),
    ).toBeNull();
  });
});
