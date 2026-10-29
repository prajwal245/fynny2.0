import { describe, expect, it } from "vitest";
import { reconcile, type ReconTxn } from "@/lib/practice/recon/engine";

const t = (o: Partial<ReconTxn> & { id: string; side: "bank" | "books" }): ReconTxn => ({
  direction: "in", amount: 384020.59, txn_date: "2025-08-09", counterparty: null, reference: null, description: null, category: null, ...o,
});

describe("entries booked a few days late", () => {
  it("matches the same amount booked 3 days later when the party agrees", () => {
    const r = reconcile(
      [t({ id: "b", side: "bank", description: "RTGS-HARYANA STEEL FURNITURE-MST/25-26/017" })],
      [t({ id: "k", side: "books", txn_date: "2025-08-12", counterparty: "Haryana Steel Furniture", reference: "MST/25-26/017" })],
    );
    expect(r.stats.matched).toBe(1);
    expect(r.matches[0]?.explanation.note).toContain("Booked 3 days after");
  });

  it("matches a tax challan 3 days late when the reference agrees even with no party", () => {
    const r = reconcile(
      [t({ id: "b", side: "bank", direction: "out", amount: 29309.41, txn_date: "2025-08-24", reference: "CPIN 85139468156956", description: "GST CPIN 85139468156956" })],
      [t({ id: "k", side: "books", direction: "out", amount: 29309.41, txn_date: "2025-08-27", reference: "CPIN 85139468156956" })],
    );
    expect(r.stats.matched).toBe(1);
  });

  it("does not match when nothing but the amount agrees", () => {
    const r = reconcile(
      [t({ id: "b", side: "bank", description: "UPI RANDOM PERSON" })],
      [t({ id: "k", side: "books", txn_date: "2025-08-12", counterparty: "Haryana Steel Furniture" })],
    );
    expect(r.stats.matched).toBe(0);
  });

  it("does not match beyond five days, or when two bank lines compete for one entry", () => {
    const far = reconcile(
      [t({ id: "b", side: "bank", description: "HARYANA STEEL FURNITURE" })],
      [t({ id: "k", side: "books", txn_date: "2025-08-16", counterparty: "Haryana Steel Furniture" })],
    );
    expect(far.stats.matched).toBe(0);
    const two = reconcile(
      [t({ id: "b1", side: "bank", description: "HARYANA STEEL FURNITURE" }), t({ id: "b2", side: "bank", txn_date: "2025-08-10", description: "HARYANA STEEL FURNITURE" })],
      [t({ id: "k", side: "books", txn_date: "2025-08-13", counterparty: "Haryana Steel Furniture" })],
    );
    expect(two.stats.matched).toBe(0);
  });
});

describe("account-booked tax payments and uncleared cheques", () => {
  it("matches a GST challan to an entry booked to Tax Payable three days later", () => {
    const r = reconcile(
      [t({ id: "b", side: "bank", direction: "out", amount: 29309.41, txn_date: "2025-08-24", description: "GST CPIN 85139468156956" })],
      [t({ id: "k", side: "books", direction: "out", amount: 29309.41, txn_date: "2025-08-27", counterparty: "Tax Payable", description: "Tax Payable - GST challan" })],
    );
    expect(r.stats.matched).toBe(1);
  });

  it("calls an uncleared cheque in the books an outstanding cheque, not an amount mismatch", () => {
    const r = reconcile(
      [t({ id: "b", side: "bank", direction: "out", amount: 144755.72, txn_date: "2025-08-03", description: "RTGS-SHIVALIK ISPAT PVT LTD-SIP/511" })],
      [t({ id: "k", side: "books", direction: "out", amount: 90000, txn_date: "2025-08-29", counterparty: "Shivalik Ispat Pvt Ltd", description: "Shivalik Ispat Pvt Ltd - cheque issued, not yet cleared", reference: "CHQ 700123" })],
    );
    const e = r.exceptions.find((x) => x.side === "books");
    expect(e?.reason_code).toBe("no_candidate");
    expect(e?.detail).toContain("Cheque issued in the books");
    expect(e?.candidates).toHaveLength(0);
  });
});
