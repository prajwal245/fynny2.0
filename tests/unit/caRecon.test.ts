import { describe, expect, it } from "vitest";
import { nameSimilarity, reconcile, type BankLine, type ExpenseLine, type InvoiceLine } from "@/lib/caRecon";

const bank = (o: Partial<BankLine> & { id: string; amount: number; date: string }): BankLine => ({
  description: null,
  type: "credit",
  reconciled: false,
  source_reference: null,
  ...o,
});

const invoice = (o: Partial<InvoiceLine> & { id: string; total_amount: number }): InvoiceLine => ({
  invoice_number: `INV-${o.id}`,
  invoice_date: "2026-01-01",
  outstanding_amount: o.total_amount,
  status: "unpaid",
  customer_name: "Acme Traders Private Limited",
  ...o,
});

const expense = (o: Partial<ExpenseLine> & { id: string; amount: number }): ExpenseLine => ({
  date: "2026-01-01",
  description: "Monthly retainer",
  payment_status: "unpaid",
  vendor_name: "Zenith Supplies",
  ...o,
});

describe("nameSimilarity", () => {
  it("scores full token overlap as 1", () => {
    expect(nameSimilarity("NEFT ACME TRADERS PVT", "Acme Traders")).toBe(1);
  });

  it("scores partial overlap between 0 and 1", () => {
    const s = nameSimilarity("NEFT ACME LOGISTICS", "Acme Traders");
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(1);
  });

  it("returns 0 for empty or too-short tokens", () => {
    expect(nameSimilarity(null, "Acme")).toBe(0);
    expect(nameSimilarity("a b c", "Acme")).toBe(0);
  });
});

describe("reconcile — exact pass", () => {
  it("matches same amount inside the window", () => {
    const { suggestions, unmatched } = reconcile(
      [bank({ id: "b1", amount: 10000, date: "2026-01-02", description: "NEFT ACME TRADERS" })],
      [invoice({ id: "i1", total_amount: 10000 })],
      [],
    );
    expect(unmatched).toHaveLength(0);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.pass).toBe("exact");
    expect(suggestions[0]!.counterpartId).toBe("i1");
    expect(suggestions[0]!.partial).toBe(false);
  });

  it("does not use the exact pass outside the date window", () => {
    const { suggestions } = reconcile(
      [bank({ id: "b1", amount: 10000, date: "2026-01-20", description: "NEFT ACME TRADERS" })],
      [invoice({ id: "i1", total_amount: 10000 })],
      [],
    );
    expect(suggestions[0]?.pass).not.toBe("exact");
  });

  it("flags two equally exact candidates as a duplicate instead of guessing", () => {
    const { suggestions, unmatched } = reconcile(
      [bank({ id: "b1", amount: 10000, date: "2026-01-02", description: "NEFT ACME TRADERS" })],
      [invoice({ id: "i1", total_amount: 10000 }), invoice({ id: "i2", total_amount: 10000 })],
      [],
    );
    expect(suggestions).toHaveLength(0);
    expect(unmatched[0]!.reason).toBe("duplicate_candidate");
  });

  it("honours a custom exact window", () => {
    const { suggestions } = reconcile(
      [bank({ id: "b1", amount: 10000, date: "2026-01-08", description: "NEFT ACME TRADERS" })],
      [invoice({ id: "i1", total_amount: 10000 })],
      [],
      { exactWindowDays: 10 },
    );
    expect(suggestions[0]!.pass).toBe("exact");
  });
});

describe("reconcile — fuzzy and rule passes", () => {
  it("matches a near amount with a strong name hit", () => {
    const { suggestions } = reconcile(
      [bank({ id: "b1", amount: 9990, date: "2026-01-05", description: "NEFT ACME TRADERS PVT LTD" })],
      [invoice({ id: "i1", total_amount: 10000 })],
      [],
    );
    expect(suggestions[0]!.pass).toBe("fuzzy");
    expect(suggestions[0]!.partial).toBe(true);
    expect(suggestions[0]!.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("does not fuzzy-match when the narration names nobody", () => {
    const { suggestions, unmatched } = reconcile(
      [bank({ id: "b1", amount: 9990, date: "2026-01-05", description: "CASH DEP" })],
      [invoice({ id: "i1", total_amount: 10000 })],
      [],
    );
    expect(suggestions).toHaveLength(0);
    expect(unmatched).toHaveLength(1);
  });

  it("recognises a part payment against a single open invoice", () => {
    const { suggestions } = reconcile(
      [bank({ id: "b1", amount: 4000, date: "2026-01-06", description: "RTGS ACME TRADERS PART PAYMENT" })],
      [invoice({ id: "i1", total_amount: 10000 })],
      [],
    );
    expect(suggestions[0]!.pass).toBe("rule");
    expect(suggestions[0]!.partial).toBe(true);
  });

  it("ignores dust below the part-payment floor", () => {
    const { suggestions, unmatched } = reconcile(
      [bank({ id: "b1", amount: 100, date: "2026-01-06", description: "RTGS ACME TRADERS" })],
      [invoice({ id: "i1", total_amount: 100000 })],
      [],
    );
    expect(suggestions).toHaveLength(0);
    expect(unmatched).toHaveLength(1);
  });
});

describe("reconcile — direction, reuse and exclusions", () => {
  it("routes debits to expenses, not invoices", () => {
    const { suggestions } = reconcile(
      [bank({ id: "b1", amount: 5000, date: "2026-01-02", type: "debit", description: "ZENITH SUPPLIES" })],
      [invoice({ id: "i1", total_amount: 5000 })],
      [expense({ id: "e1", amount: 5000 })],
    );
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.counterpartKind).toBe("expense");
    expect(suggestions[0]!.counterpartId).toBe("e1");
  });

  it("never proposes the same counterpart twice (many-to-one guard)", () => {
    const { suggestions, unmatched } = reconcile(
      [
        bank({ id: "b1", amount: 10000, date: "2026-01-02", description: "NEFT ACME TRADERS" }),
        bank({ id: "b2", amount: 10000, date: "2026-01-02", description: "NEFT ACME TRADERS" }),
      ],
      [invoice({ id: "i1", total_amount: 10000 })],
      [],
    );
    expect(suggestions).toHaveLength(1);
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0]!.bank.id).toBe("b2");
    expect(unmatched[0]!.reason).toBe("no_counterpart");
  });

  it("skips already-reconciled lines and lines stamped by a previous run", () => {
    const { suggestions, unmatched } = reconcile(
      [
        bank({ id: "b1", amount: 10000, date: "2026-01-02", reconciled: true }),
        bank({ id: "b2", amount: 10000, date: "2026-01-02", source_reference: "recon:invoice:i9" }),
      ],
      [invoice({ id: "i1", total_amount: 10000 })],
      [],
    );
    expect(suggestions).toHaveLength(0);
    expect(unmatched).toHaveLength(0);
  });

  it("ignores settled documents", () => {
    const { unmatched } = reconcile(
      [bank({ id: "b1", amount: 5000, date: "2026-01-02", type: "debit", description: "ZENITH SUPPLIES" })],
      [],
      [expense({ id: "e1", amount: 5000, payment_status: "paid" })],
    );
    expect(unmatched[0]!.reason).toBe("no_counterpart");
  });
});

describe("reconcile — reason codes and severity", () => {
  it("reports a thin narration", () => {
    const { unmatched } = reconcile(
      [bank({ id: "b1", amount: 7777, date: "2026-01-02", description: "" })],
      [invoice({ id: "i1", total_amount: 10000 })],
      [],
    );
    expect(unmatched[0]!.reason).toBe("missing_narration");
  });

  it("reports a date-window miss when nothing is in range", () => {
    const { unmatched } = reconcile(
      [bank({ id: "b1", amount: 7777, date: "2026-06-01", description: "NEFT ACME TRADERS" })],
      [invoice({ id: "i1", total_amount: 10000 })],
      [],
    );
    expect(unmatched[0]!.reason).toBe("date_out_of_window");
  });

  it("reports an amount mismatch when a candidate is in range but wrong", () => {
    const { unmatched } = reconcile(
      [bank({ id: "b1", amount: 250, date: "2026-01-05", description: "NEFT ACME TRADERS" })],
      [invoice({ id: "i1", total_amount: 100000 })],
      [],
    );
    expect(unmatched[0]!.reason).toBe("amount_mismatch");
  });

  it("escalates severity with value at risk", () => {
    const { unmatched } = reconcile(
      [
        bank({ id: "b1", amount: 500, date: "2026-01-05", description: "NEFT ACME TRADERS" }),
        bank({ id: "b2", amount: 50000, date: "2026-01-05", description: "NEFT ACME TRADERS" }),
        bank({ id: "b3", amount: 500000, date: "2026-01-05", description: "NEFT ACME TRADERS" }),
      ],
      [invoice({ id: "i1", total_amount: 9999999 })],
      [],
    );
    expect(unmatched.map((u) => u.severity)).toEqual(["low", "medium", "high"]);
  });
});
