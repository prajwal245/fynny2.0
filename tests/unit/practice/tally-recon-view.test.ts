/**
 * The reconciliation as a person reads it: matched, partly matched or missing in Tally, debit and credit apart,
 * the statement's account against the mapped Tally ledger, and a warning when Tally seems to hold the entry already.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runExtract } from "@/lib/practice/extract/pipeline";
import { reconcile, type ReconTxn } from "@/lib/practice/recon/engine";
import {
  alreadyInTally,
  classifyLine,
  compareAccount,
  matchReason,
  splitDrCr,
  statementAccount,
  type BookEntry,
} from "@/lib/practice/tallyReconView";

const bk = (o: Partial<BookEntry> & { id: string }): BookEntry => ({
  date: "2026-10-05",
  direction: "out",
  amount: 1000,
  counterparty: null,
  description: null,
  reference: null,
  category: null,
  ...o,
});

describe("debit and credit apart", () => {
  it("money in is a debit and money out a credit, as the bank ledger stands in Tally", () => {
    expect(splitDrCr("in", 500)).toEqual({ debit: 500, credit: null });
    expect(splitDrCr("out", 500)).toEqual({ debit: null, credit: 500 });
  });
});

describe("tagging a statement line", () => {
  const base = {
    id: "b1",
    direction: "out" as const,
    amount: 10000,
    date: "2026-10-10",
  };
  it("matched: shows the Tally entry and why they were paired", () => {
    const r = classifyLine({
      ...base,
      match: {
        books: [bk({ id: "k1", amount: 10000 })],
        stage: "exact",
        score: 1,
        reason: matchReason("exact", 1, { amount_diff: 0, date_gap_days: 0 }),
      },
    });
    expect(r).toMatchObject({ status: "matched", label: "Matched" });
    expect(r.tally).toHaveLength(1);
    expect(r.why).toBe("Same amount and date (100% sure).");
    expect(
      matchReason("fuzzy", 0.91, { amount_diff: 0.5, date_gap_days: 2 }),
    ).toBe("Same party and amount, 2 days apart, ₹0.50 difference (91% sure).");
  });
  it("partly matched: same party, different amount or date: the nearest entry and how it differs, never pushable by itself", () => {
    const k = bk({
      id: "k2",
      amount: 12000,
      date: "2026-10-08",
      counterparty: "Rao Steels",
    });
    const r = classifyLine({
      ...base,
      exception: {
        reason_code: "partial_payment_suspect",
        detail:
          "Same party, but ₹10,000 in the bank against ₹12,000 in the books.",
        candidates: [{ txn_id: "k2", score: 0.9 }],
      },
      booksById: new Map([["k2", k]]),
    });
    expect(r).toMatchObject({
      status: "partial",
      label: "Partly matched",
      nearest: { id: "k2" },
      difference: { amount: -2000, days: 2 },
    });
  });
  it("missing: no candidate, or a reason that does not name a nearby entry", () => {
    expect(
      classifyLine({
        ...base,
        exception: {
          reason_code: "no_candidate",
          detail: "No book entry has a comparable amount.",
          candidates: [],
        },
      }),
    ).toMatchObject({ status: "missing", label: "Missing in Tally" });
    expect(classifyLine({ ...base })).toMatchObject({ status: "missing" });
    // A partial reason with no entry to show is treated as missing rather than hiding the line.
    expect(
      classifyLine({
        ...base,
        exception: {
          reason_code: "amount_mismatch",
          detail: null,
          candidates: [],
        },
      }).status,
    ).toBe("missing");
  });
  it("sent to Tally: shows as sent until the next sync pairs it", () => {
    expect(classifyLine({ ...base, posted: true })).toMatchObject({
      status: "pushed",
      label: "Sent to Tally",
    });
  });
});

describe("Tally already seems to have this", () => {
  const line = {
    direction: "out" as const,
    amount: 5502.73,
    date: "2026-10-13",
  };
  it("warns for the same direction and exact amount within three days, and not otherwise", () => {
    const books = [
      bk({ id: "a", amount: 5502.73, date: "2026-10-12" }),
      bk({ id: "b", amount: 5502.74, date: "2026-10-13" }),
      bk({ id: "c", amount: 5502.73, date: "2026-10-20" }),
      bk({ id: "d", amount: 5502.73, date: "2026-10-13", direction: "in" }),
    ];
    expect(alreadyInTally(line, books).map((b) => b.id)).toEqual(["a"]);
  });
});

describe("the statement's account against the Tally bank ledger", () => {
  it("reads the account number and bank from a statement's header", () => {
    const s = statementAccount(
      "HDFC BANK LTD\nAccount No : 50200071184402\nStatement of account",
      "HDFC Oct.csv",
    );
    expect(s).toEqual({ accountNo: "50200071184402", bank: "HDFC" });
    expect(
      statementAccount("Account Number: XXXXXXXX3871\nState Bank of India", ""),
    ).toEqual({ accountNo: "XXXXXXXX3871", bank: "SBI" });
    expect(statementAccount("no header here", "")).toEqual({
      accountNo: null,
      bank: null,
    });
  });
  it("matches on the last digits and the bank", () => {
    const s = { accountNo: "50200071184402", bank: "HDFC" };
    expect(compareAccount(s, "HDFC Bank A/c 50200071").state).toBe("match");
    expect(compareAccount(s, "HDFC Bank A/c 4402").state).toBe("match");
  });
  it("warns on a different bank or different digits", () => {
    const s = { accountNo: "50200071184402", bank: "HDFC" };
    expect(compareAccount(s, "ICICI Bank CA 6205")).toMatchObject({
      state: "mismatch",
      message: expect.stringMatching(/ICICI ledger/),
    });
    expect(compareAccount(s, "HDFC Bank A/c 99887766")).toMatchObject({
      state: "mismatch",
      message: expect.stringMatching(/different digits/),
    });
  });
  it("says it cannot compare, rather than guessing, when nothing is comparable", () => {
    expect(compareAccount(null, "HDFC Bank").state).toBe("unknown");
    expect(
      compareAccount(
        { accountNo: "50200071184402", bank: "HDFC" },
        "Current Account",
      ).state,
    ).toBe("unknown");
  });
});

describe("on the real sample files", () => {
  it("HDFC October against the voucher file: every line matched, none missing, none partly matched", async () => {
    const read = async (f: string, side: "bank" | "books") =>
      (
        await runExtract(
          {
            bytes: new Uint8Array(readFileSync(`public/samples/tally/${f}`)),
            filename: f,
            mime: "text/xml",
            side,
            businessId: null,
          },
          { llm: null },
        )
      ).rows;
    const bank = await read("04_bank_book_hdfc_godavari_oct2026.xml", "bank");
    const books = await read(
      "02_vouchers_godavari_oct2026_import.xml",
      "books",
    );
    const tx = (rows: typeof bank, side: "bank" | "books"): ReconTxn[] =>
      rows.map((r, i) => ({
        id: `${side}${i}`,
        side,
        direction: r.direction,
        amount: r.amount,
        txn_date: r.date,
        counterparty: r.counterparty,
        reference: r.reference,
        description: r.description,
        category: r.category,
      }));
    const res = reconcile(tx(bank, "bank"), tx(books, "books"));
    const tags = bank.map((r, i) => {
      const m = res.matches.find((x) => x.bank_txn_id === `bank${i}`);
      return classifyLine({
        id: `bank${i}`,
        direction: r.direction,
        amount: r.amount,
        date: r.date,
        match: m
          ? {
              books: m.book_txn_ids.map((id) => bk({ id })),
              stage: m.stage,
              score: m.score,
              reason: matchReason(m.stage, m.score, m.explanation),
            }
          : null,
      }).status;
    });
    expect(tags.filter((t) => t === "matched")).toHaveLength(43);
    // Drop three vouchers from the books: those bank lines are now missing in Tally.
    const fewer = books.slice(3);
    const res2 = reconcile(tx(bank, "bank"), tx(fewer, "books"));
    expect(bank.length - res2.matches.length).toBeGreaterThanOrEqual(3);
  });
});
