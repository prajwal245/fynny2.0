import { describe, expect, it } from "vitest";
import {
  reconcile,
  nameScore,
  type ReconTxn,
} from "@/lib/practice/recon/engine";
import {
  computeFigures,
  ruleInsights,
  type NarrateTxn,
} from "@/lib/practice/narrate/calc";
import { validateInsights } from "@/lib/practice/narrate/insights";
import {
  decide,
  normalisePhone,
  renderEmail,
  whatsappLink,
  type ChaseState,
} from "@/lib/practice/chaser/rules";

const bank = (
  id: string,
  date: string,
  amount: number,
  direction: "in" | "out",
  description: string,
  reference: string | null = null,
  counterparty: string | null = null,
): ReconTxn => ({
  id,
  side: "bank",
  direction,
  amount,
  txn_date: date,
  description,
  reference,
  counterparty,
  category: null,
});
const book = (
  id: string,
  date: string,
  amount: number,
  direction: "in" | "out",
  description: string,
  reference: string | null = null,
  counterparty: string | null = null,
  category: string | null = null,
): ReconTxn => ({
  id,
  side: "books",
  direction,
  amount,
  txn_date: date,
  description,
  reference,
  counterparty,
  category,
});

describe("recon engine", () => {
  it("matches exact, fuzzy and rules stages and explains every exception", () => {
    const b = [
      bank(
        "b1",
        "2026-09-01",
        125000,
        "in",
        "NEFT SUNDARA TEXTILES",
        "UTR123",
        "SUNDARA TEXTILES PVT LTD",
      ),
      bank(
        "b2",
        "2026-09-03",
        15000,
        "out",
        "IMPS RAMESH KUMAR",
        null,
        "RAMESH KUMAR",
      ),
      bank("b3", "2026-09-05", 17.7, "out", "SMS CHGS FOR QTR"),
      bank(
        "b4",
        "2026-09-10",
        40000,
        "in",
        "NEFT VIREO FOODS",
        null,
        "VIREO FOODS",
      ),
      bank("b5", "2026-09-12", 999, "out", "POS CAFE"),
      bank("b6", "2026-09-20", 2499, "out", "AMAZON PAY", null, "AMAZON PAY"),
    ];
    const k = [
      book(
        "k1",
        "2026-09-01",
        125000,
        "in",
        "Receipt",
        "UTR123",
        "Sundara Textiles Pvt Ltd",
      ),
      book("k2", "2026-09-04", 15000, "out", "Payment", null, "Ramesh Kumar"),
      book(
        "k3",
        "2026-09-30",
        17.7,
        "out",
        "Bank charges for Sept",
        null,
        null,
        "bank_charge",
      ),
      book(
        "k4",
        "2026-09-09",
        50000,
        "in",
        "Receipt",
        null,
        "Vireo Foods and Beverages LLP",
      ),
      book(
        "k5",
        "2026-09-22",
        2499,
        "out",
        "Office supplies",
        null,
        "Amazon India",
      ),
    ];
    const out = reconcile(b, k, {
      aliases: [{ alias: "AMAZON PAY", canonical: "Amazon India" }],
    });
    const byBank = Object.fromEntries(
      out.matches.map((m) => [m.bank_txn_id, m]),
    );
    expect(byBank.b1.stage).toBe("exact");
    expect(byBank.b2.stage).toBe("fuzzy");
    expect(byBank.b2.explanation.date_gap_days).toBe(1);
    expect(byBank.b3).toMatchObject({ stage: "rules", book_txn_ids: ["k3"] });
    // The alias table lifts the party score to 1, so this is caught at the fuzzy stage.
    expect(byBank.b6).toMatchObject({ stage: "fuzzy", book_txn_ids: ["k5"] });
    expect(byBank.b6.explanation.counterparty_score).toBe(1);

    const ex = Object.fromEntries(out.exceptions.map((e) => [e.txn_id, e]));
    expect(ex.b4.reason_code).toBe("partial_payment_suspect");
    expect(ex.b4.candidates[0].txn_id).toBe("k4");
    expect(ex.k4.side).toBe("books");
    expect(ex.b5.reason_code).toBe("no_candidate");
    expect(out.stats).toMatchObject({
      bank_count: 6,
      book_count: 5,
      matched: 4,
      exceptions: 3,
    });
  });

  it("is deterministic and replayable", () => {
    const b = [
      bank("b1", "2026-09-01", 100, "in", "x"),
      bank("b2", "2026-09-01", 100, "in", "x"),
    ];
    const k = [
      book("k1", "2026-09-01", 100, "in", "x"),
      book("k2", "2026-09-01", 100, "in", "x"),
    ];
    const a1 = reconcile(b, k);
    const a2 = reconcile([...b].reverse(), [...k].reverse());
    expect(a1.matches).toEqual(a2.matches);
    expect(a1.matches).toHaveLength(2);
  });

  it("refuses to auto-match when two candidates are equally good", () => {
    const out = reconcile(
      [bank("b1", "2026-09-05", 10000, "out", "CHQ 000123")],
      [
        book("k1", "2026-09-04", 10000, "out", "Payment"),
        book("k2", "2026-09-06", 10000, "out", "Payment"),
      ],
    );
    expect(out.matches).toHaveLength(0);
    expect(out.exceptions.find((e) => e.txn_id === "b1")?.reason_code).toBe(
      "duplicate_suspect",
    );
  });

  it("flags date gaps and reference mismatches with specific codes", () => {
    const gap = reconcile(
      [bank("b1", "2026-09-01", 5000, "out", "Rent")],
      [book("k1", "2026-09-15", 5000, "out", "Rent")],
    );
    expect(gap.exceptions[0].reason_code).toBe("date_gap");
  });

  it("matches the only same-amount entry within 2 days even when references differ (QA P0-1)", () => {
    // A cheque number never equals a Tally voucher number.
    const out = reconcile(
      [
        bank("b1", "2026-08-05", 45000, "out", "CHQ 4521 RENT", "CHQ4521"),
        bank("b2", "2026-08-07", 18240, "out", "BILLDESK MSEB ELECTRICITY", "UTR8812"),
        bank("b3", "2026-08-28", 264180.5, "out", "NEFT STAFF SALARY AUG", "N2408"),
      ],
      [
        book("k1", "2026-08-05", 45000, "out", "Office rent August", "PAY-1126", "Shree Properties"),
        book("k2", "2026-08-08", 18240, "out", "Electricity charges", "PAY-1131", "Maharashtra State Electricity Board"),
        book("k3", "2026-08-28", 264180.5, "out", "Salary payable", "JV-77", "Salary"),
      ],
    );
    expect(out.matches.map((m) => [m.bank_txn_id, m.book_txn_ids[0]]).sort()).toEqual([["b1", "k1"], ["b2", "k2"], ["b3", "k3"]]);
    expect(out.matches.find((m) => m.bank_txn_id === "b1")?.stage).toBe("exact");
    expect(out.exceptions).toHaveLength(0);
  });

  it("does not pair same amounts when another line could be the match", () => {
    const out = reconcile(
      [bank("b1", "2026-09-01", 5000, "out", "zzz", "AAA111", "Alpha"), bank("b2", "2026-09-02", 5000, "out", "qqq", "CCC333", "Gamma")],
      [book("k1", "2026-09-01", 5000, "out", "yyy", "BBB222", "Omega")],
    );
    expect(out.matches).toHaveLength(0);
  });

  it("matches a book entry paid in two bank lines by the same party (QA P0-7)", () => {
    const out = reconcile(
      [
        bank("b1", "2026-10-03", 100000, "in", "NEFT CR KAVERI FASHIONS", "", "Kaveri Fashions"),
        bank("b2", "2026-10-17", 50000, "in", "NEFT CR KAVERI FASHIONS", "", "Kaveri Fashions"),
      ],
      [book("k1", "2026-10-02", 150000, "in", "Invoice 2231", "INV-2231", "Kaveri Fashions Pvt Ltd")],
    );
    expect(out.matches).toHaveLength(2);
    expect(new Set(out.matches.map((m) => m.explanation.group)).size).toBe(1);
    expect(out.exceptions).toHaveLength(0);
  });

  it("leaves a split unmatched when the party differs", () => {
    const out = reconcile(
      [bank("b1", "2026-10-03", 100000, "in", "NEFT CR RAVI TRADERS", "", "Ravi Traders"), bank("b2", "2026-10-17", 50000, "in", "NEFT CR ACME", "", "Acme")],
      [book("k1", "2026-10-02", 150000, "in", "Invoice 2231", "INV-2231", "Kaveri Fashions Pvt Ltd")],
    );
    expect(out.matches).toHaveLength(0);
  });

  it("handles 2,000 lines quickly", () => {
    const b: ReconTxn[] = [];
    const k: ReconTxn[] = [];
    for (let i = 0; i < 2000; i++) {
      const d = `2026-09-${String((i % 28) + 1).padStart(2, "0")}`;
      b.push(
        bank(
          `b${i}`,
          d,
          1000 + (i % 50) * 10,
          i % 2 ? "in" : "out",
          `party ${i % 97}`,
        ),
      );
      k.push(
        book(
          `k${i}`,
          d,
          1000 + (i % 50) * 10,
          i % 2 ? "in" : "out",
          `party ${i % 97}`,
        ),
      );
    }
    const t0 = Date.now();
    reconcile(b, k);
    expect(Date.now() - t0).toBeLessThan(10_000);
  });

  it("scores company name variants", () => {
    expect(
      nameScore("SUNDARA TEXTILES PVT LTD", "Sundara Textiles Private Limited"),
    ).toBe(1);
    expect(nameScore("AMAZON PAY", "Flipkart")).toBeLessThan(0.3);
  });
});

const nt = (
  id: string,
  date: string,
  amount: number,
  direction: "in" | "out",
  counterparty: string | null,
  category: string | null = null,
  balance: number | null = null,
  row_index = 0,
): NarrateTxn => ({
  id,
  side: "bank",
  direction,
  amount,
  txn_date: date,
  counterparty,
  description: counterparty,
  category,
  reference: null,
  balance,
  row_index,
  extraction_id: "x",
});

describe("narrate", () => {
  const matched = [
    nt("t1", "2026-09-01", 125000, "in", "Sundara", null, 525000, 1),
    nt("t2", "2026-09-02", 25000, "in", "Vireo", null, 550000, 2),
    nt("t3", "2026-09-03", 15000, "out", "Ramesh", null, 535000, 3),
    nt("t4", "2026-09-05", 17.7, "out", null, "bank_charge", 534982.3, 4),
  ];
  const prior = [
    nt("p1", "2026-08-10", 100000, "in", "Sundara"),
    nt("p2", "2026-08-11", 10000, "out", "Ramesh"),
  ];

  it("computes every figure in code with its source ids", () => {
    const f = computeFigures(matched, prior, matched);
    expect(f.numbers.total_receipts).toMatchObject({
      value: 150000,
      txn_ids: ["t1", "t2"],
    });
    expect(f.numbers.total_payments.value).toBe(15017.7);
    expect(f.numbers.net_movement.value).toBe(134982.3);
    expect(f.numbers.opening_balance.value).toBe(400000);
    expect(f.numbers.closing_balance).toMatchObject({
      value: 534982.3,
      txn_ids: ["t4"],
    });
    expect(f.variances.find((v) => v.key === "receipts")?.change_pct).toBe(50);
    expect(
      ruleInsights(f, matched).every((i) => i.cited_transaction_ids.length > 0),
    ).toBe(true);
  });

  it("drops AI insights that cite unknown ids or invent figures", () => {
    const f = computeFigures(matched, prior, matched);
    const res = validateInsights(
      {
        insights: [
          {
            text: "Receipts rose 50% to ₹1,50,000, led by Sundara.",
            cited_transaction_ids: ["t1"],
            confidence: 0.9,
          },
          {
            text: "Sales to Omega were strong.",
            cited_transaction_ids: ["t999"],
          },
          {
            text: "Profit was ₹9,99,999 this month.",
            cited_transaction_ids: ["t1"],
          },
          { text: "No citations here." },
        ],
      },
      f,
      matched,
    );
    expect(res.accepted.map((i) => i.text)).toEqual([
      "Receipts rose 50% to ₹1,50,000, led by Sundara.",
    ]);
    expect(res.rejected).toHaveLength(3);
  });
});

describe("chaser", () => {
  const base: ChaseState = {
    status: "open",
    created_at: "2026-09-01T04:00:00.000Z",
    chaser_count: 0,
    max_follow_ups: 2,
    schedule_days: [0, 3, 7],
    escalated_at: null,
    last_chased_at: null,
    next_follow_up_at: null,
    do_not_disturb: false,
    contact_email: "a@b.in",
  };
  it("sends on schedule, then escalates after two unanswered nudges", () => {
    const d0 = decide(base, new Date("2026-09-01T05:00:00Z"));
    expect(d0).toMatchObject({ action: "send", follow_up_number: 1 });
    const s1 = {
      ...base,
      chaser_count: 1,
      last_chased_at: "2026-09-01T05:00:00Z",
      next_follow_up_at: (d0 as { next_follow_up_at: string })
        .next_follow_up_at,
    };
    expect(decide(s1, new Date("2026-09-02T05:00:00Z"))).toMatchObject({
      action: "skip",
      reason: "not due",
    });
    expect(decide(s1, new Date("2026-09-04T05:00:00Z"))).toMatchObject({
      action: "send",
      follow_up_number: 2,
    });
    const s2 = {
      ...s1,
      chaser_count: 2,
      last_chased_at: "2026-09-04T05:00:00Z",
      next_follow_up_at: "2026-09-08T04:00:00.000Z",
    };
    expect(decide(s2, new Date("2026-09-08T05:00:00Z"))).toEqual({
      action: "escalate",
    });
  });

  it("never sends after resolution, twice a day, or to do-not-disturb clients", () => {
    const now = new Date("2026-09-01T05:00:00Z");
    expect(decide({ ...base, status: "fulfilled" }, now).action).toBe("skip");
    expect(decide({ ...base, do_not_disturb: true }, now).action).toBe("skip");
    expect(
      decide({ ...base, last_chased_at: "2026-09-01T01:00:00Z" }, now),
    ).toMatchObject({ reason: "already chased today" });
  });

  it("builds polite templates and valid WhatsApp links", () => {
    const t = {
      contactName: "Ramesh",
      clientName: "Sundara Textiles",
      firmName: "Rao & Co",
      item: "Bank statement",
      period: "September 2026",
      dueDate: null,
    };
    expect(renderEmail(1, t).subject).toBe(
      "Gentle reminder – Bank statement for September 2026",
    );
    expect(renderEmail(2, t).template_id).toBe("chase_email_followup");
    expect(normalisePhone("+91 98450 12345")).toBe("919845012345");
    expect(normalisePhone("098450 12345")).toBe("919845012345");
    expect(whatsappLink("12345", "hi").url).toBeNull();
    expect(whatsappLink("9845012345", "Hi & thanks").url).toBe(
      "https://wa.me/919845012345?text=Hi%20%26%20thanks",
    );
  });
});

describe("reason codes (retest N11)", () => {
  it("a bank charge is not an amount mismatch against another party's bill", () => {
    const out = reconcile(
      [bank("b1", "2026-07-20", 590, "out", "BANK CHARGES GST ON CHG")],
      [book("k1", "2026-07-18", 4450, "out", "Office Mart stationery", null, "Office Mart")],
    );
    const ex = out.exceptions.find((e) => e.txn_id === "b1")!;
    expect(ex.reason_code).toBe("no_candidate");
    expect(ex.candidates).toEqual([]);
  });

  it("an overpayment is not labelled a part payment", () => {
    const out = reconcile(
      [bank("b1", "2026-07-10", 4750, "out", "NEFT OFFICE MART", null, "Office Mart")],
      [book("k1", "2026-07-10", 4450, "out", "Office Mart stationery", null, "Office Mart")],
    );
    const ex = out.exceptions.find((e) => e.txn_id === "b1")!;
    expect(ex.reason_code).toBe("amount_mismatch");
    expect(ex.detail).toContain("more than the books");
  });
});

describe("retest round 4: money in the right bucket", () => {
  it("pairs a returned cheque with its deposit (not the return charges)", async () => {
    const { returnedChequePairs, isChequeReturn } = await import("@/lib/practice/narrate/flows");
    const lines = [
      bank("dep", "2026-07-04", 50000, "in", "CHQ DEP 123456 KAVERI FASHIONS"),
      bank("ret", "2026-07-08", 50000, "out", "CHQ RET 123456 INSUFF FUNDS"),
      bank("chg", "2026-07-08", 590, "out", "CHQ RETURN CHARGES INCL GST"),
      bank("other", "2026-07-09", 50000, "in", "CHQ DEP 654321 OTHER PARTY"),
    ];
    expect(isChequeReturn(lines[2])).toBe(false);
    expect(returnedChequePairs(lines)).toEqual([{ deposit: "dep", ret: "ret", cheque: "123456", amount: 50000 }]);
  });

  it("explains a returned cheque in Recon instead of 'no candidate'", () => {
    const res = reconcile(
      [bank("dep", "2026-07-04", 50000, "in", "CHQ DEP 123456 KAVERI FASHIONS"), bank("ret", "2026-07-08", 50000, "out", "CHQ RET 123456 INSUFF FUNDS")],
      [book("r1", "2026-07-04", 50000, "in", "Receipt", null, "Kaveri Fashions")],
    );
    const e = res.exceptions.find((x) => x.txn_id === "ret")!;
    expect(e.detail).toMatch(/Cheque 123456 returned/);
    expect(e.detail).toMatch(/reverse it/);
  });

  it("still explains the return when its deposit was matched in an earlier run", () => {
    const res = reconcile(
      [bank("ret", "2026-07-08", 50000, "out", "CHQ RET 123456 INSUFF FUNDS")],
      [],
      { pairContext: [bank("dep", "2026-07-04", 50000, "in", "CHQ DEP 123456 KAVERI FASHIONS")] },
    );
    expect(res.exceptions.find((x) => x.txn_id === "ret")!.detail).toMatch(/Cheque 123456 returned \(deposited 2026-07-04/);
  });

  it("keeps receipts booked to Suspense out of revenue", async () => {
    const { misBucket } = await import("@/lib/practice/narrate/flows");
    expect(misBucket({ direction: "in", category: null, description: "UPI CR 99887766 Suspense A/c", counterparty: null })).toBe("unidentified");
    expect(misBucket({ direction: "in", category: null, description: "NEFT CR SALES", counterparty: "Kaveri Fashions" })).toBe("revenue");
    expect(misBucket({ direction: "in", category: null, description: "Director loan received", counterparty: null })).toBe("loan_capital");
  });

  it("cleans bank party text", async () => {
    const { cleanParty } = await import("@/lib/practice/narrate/flows");
    expect(cleanParty("DEP 123456 SUNRISE TRADERS")).toBe("SUNRISE TRADERS");
    expect(cleanParty("CHQ DEP 123456 KAVERI FASHIONS")).toBe("KAVERI FASHIONS");
    expect(cleanParty("NEFT CR-BIG CLIENT LTD")).toBe("BIG CLIENT LTD");
    expect(cleanParty("Office Mart")).toBe("Office Mart");
  });

  it("measures concentration against revenue, not loans", () => {
    const sale = (id: string, amt: number, party: string): NarrateTxn => ({ id, side: "bank", direction: "in", amount: amt, txn_date: "2026-07-05", counterparty: party, description: "NEFT CR", category: null, reference: null, balance: null, row_index: 1, extraction_id: null });
    const matched = [sale("s1", 60000, "Kaveri"), sale("s2", 40000, "Sunrise"), sale("l1", 900000, "Director Loan")];
    const f = computeFigures(matched, [], matched);
    const text = ruleInsights(f, matched, matched.slice(0, 2)).map((i) => i.text).join(" ");
    expect(text).toMatch(/Kaveri accounts for 60% of revenue/);
  });

  it("tags charges Extract recognised even with unusual wording", () => {
    const res = reconcile([{ ...bank("c", "2026-07-08", 590, "out", "CHQ RETURN CHARGES INCL GST"), category: "bank_charge" }], []);
    expect(res.exceptions[0].detail).toMatch(/Tagged as bank charge/);
  });
});
