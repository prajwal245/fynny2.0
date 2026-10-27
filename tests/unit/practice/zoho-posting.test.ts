import { describe, expect, it } from "vitest";
import {
  accountKind,
  alreadyInZoho,
  BANK_CHARGE_LIMIT,
  duplicateWindow,
  expensePayload,
  idempotencyRef,
  invoiceHint,
  paymentPayload,
  pickChargeAccount,
  postable,
  postingAllowedFor,
  preview,
  zohoErrorMessage,
  type BankTxn,
  type OpenInvoice,
} from "@/lib/practice/zohoPosting";

// Open invoices exactly as the Zoho test organisation holds them.
const inv = (number: string, customer: string, balance: number, total = balance): OpenInvoice => ({ id: `id-${number}`, number, customerId: `c-${customer}`, customer, total, balance, dueDate: "2026-10-01", status: "overdue" });
const OPEN = [inv("INV-2601", "Kaveri", 18000, 118000), inv("INV-2602", "Mehta", 40800, 70800), inv("INV-2604", "Orion", 77000, 177000), inv("INV-26011", "Other", 500)];
const txn = (o: Partial<BankTxn>): BankTxn => ({ id: "11111111-2222-3333-4444-555555555555", date: "2026-09-30", amount: 590, direction: "out", description: "BANK CHARGES SEP 2026 INCL GST", ...o });

describe("Zoho accounts and errors", () => {
  it("labels bank, card and cash accounts", () => {
    expect(accountKind("bank")).toBe("bank");
    expect(accountKind("credit_card")).toBe("card");
    expect(accountKind("cash")).toBe("cash");
    expect(accountKind(undefined)).toBe("bank");
  });
  it("words Zoho's failures for a person", () => {
    expect(zohoErrorMessage(401, undefined, "x")).toMatch(/Reconnect/);
    expect(zohoErrorMessage(200, 57, "You are not authorized")).toMatch(/Reconnect/);
    expect(zohoErrorMessage(429, undefined, undefined)).toMatch(/limit/);
    expect(zohoErrorMessage(503, undefined, undefined)).toMatch(/not responding/);
    expect(zohoErrorMessage(400, 1001, "Invalid value passed for date")).toBe("Zoho Books: Invalid value passed for date");
  });
});

describe("which open invoice a narration names", () => {
  it("finds exactly one, whatever the punctuation", () => {
    expect(invoiceHint("NEFT CR-KAVERI TEXTILES PVT LTD-INV-2601", 18000, OPEN)?.invoice.number).toBe("INV-2601");
    expect(invoiceHint("neft cr kaveri inv 2601", 5000, OPEN)?.invoice.number).toBe("INV-2601");
    expect(invoiceHint("INV2602 part payment", 10000, OPEN)?.fits).toBe(true);
  });
  it("does not read INV-2601 inside INV-26011", () => {
    expect(invoiceHint("NEFT INV-26011", 500, OPEN)?.invoice.number).toBe("INV-26011");
  });
  it("gives nothing when no invoice or two invoices are named", () => {
    expect(invoiceHint("UPI CR WALK-IN CUSTOMER", 12500, OPEN)).toBeNull();
    expect(invoiceHint("NEFT INV-2601 INV-2602", 1000, OPEN)).toBeNull();
    expect(invoiceHint("", 1000, OPEN)).toBeNull();
  });
  it("says when the money is more than what is owed", () => {
    expect(invoiceHint("INV-2601", 20000, OPEN)?.fits).toBe(false);
  });
});

describe("what FynHelp may post", () => {
  it("posts a small bank charge", () => {
    expect(postable(txn({}), []).kind).toBe("bank_charge");
    expect(postable(txn({ description: "SMS CHGS", amount: 17.7 }), []).kind).toBe("bank_charge");
  });
  it("refuses a large charge and any other payment", () => {
    expect(postable(txn({ amount: BANK_CHARGE_LIMIT + 1 }), []).kind).toBe("none");
    expect(postable(txn({ description: "NEFT DR-RAMAN LOGISTICS-BILL-401", amount: 23600 }), []).kind).toBe("none");
  });
  it("posts a receipt only when it names one invoice and fits", () => {
    expect(postable(txn({ direction: "in", description: "NEFT CR-MEHTA FOODS LLP-INV-2602", amount: 30000 }), OPEN).kind).toBe("receipt");
    expect(postable(txn({ direction: "in", description: "UPI CR WALK-IN CUSTOMER UPI", amount: 12500 }), OPEN).kind).toBe("none");
    expect(postable(txn({ direction: "in", description: "NEFT CR INV-2601", amount: 118000 }), OPEN).kind).toBe("none");
  });
});

describe("payloads", () => {
  it("builds a tagged expense with a stable reference", () => {
    const p = expensePayload(txn({}), "exp1", "bank1");
    expect(p).toMatchObject({ account_id: "exp1", paid_through_account_id: "bank1", amount: 590, date: "2026-09-30", reference_number: idempotencyRef(txn({}).id) });
    expect(p.description.startsWith("Created by FynHelp")).toBe(true);
    expect(idempotencyRef("11111111-2222-3333-4444-555555555555")).toBe("FH-111111112222");
  });
  it("applies a receipt to the named invoice and customer", () => {
    const t = txn({ direction: "in", amount: 30000, description: "INV-2602" });
    const p = paymentPayload(t, OPEN[1]!, "bank1");
    expect(p.customer_id).toBe("c-Mehta");
    expect(p.invoices).toEqual([{ invoice_id: "id-INV-2602", amount_applied: 30000 }]);
  });
  it("previews what will be created, including what is left due", () => {
    const t = txn({ direction: "in", amount: 30000, description: "INV-2602" });
    const v = preview(t, { kind: "receipt", invoice: OPEN[1]! }, "HDFC Current");
    expect(v.title).toContain("INV-2602");
    expect(v.lines.find(([k]) => k === "Applied to")![1]).toContain("10,800.00 after");
  });
  it("picks Zoho's bank-charges expense account, and none when there is none", () => {
    expect(pickChargeAccount([{ account_id: "1", account_name: "Office Supplies" }, { account_id: "2", account_name: "Bank Fees and Charges" }])?.id).toBe("2");
    expect(pickChargeAccount([{ account_id: "1", account_name: "Office Supplies" }])).toBeNull();
  });
});

describe("is it already in Zoho", () => {
  it("looks three days either side", () => {
    expect(duplicateWindow("2026-09-30")).toEqual({ start: "2026-09-27", end: "2026-10-03" });
    expect(duplicateWindow("2026-03-01")).toEqual({ start: "2026-02-26", end: "2026-03-04" });
  });
  it("calls it recorded only for the same amount within the window", () => {
    const t = txn({ amount: 590, date: "2026-09-30" });
    expect(alreadyInZoho(t, [{ date: "2026-09-28", amount: 590 }])).not.toBeNull();
    expect(alreadyInZoho(t, [{ date: "2026-09-28", amount: 591 }])).toBeNull();
    expect(alreadyInZoho(t, [{ date: "2026-09-20", amount: 590 }])).toBeNull();
    expect(alreadyInZoho(t, [])).toBeNull();
  });
});

describe("posting is opt-in per firm", () => {
  it("is off for everyone unless a firm is listed", () => {
    expect(postingAllowedFor(undefined, "f1")).toBe(false);
    expect(postingAllowedFor("", "f1")).toBe(false);
    expect(postingAllowedFor("on", "f1")).toBe(false);
    expect(postingAllowedFor("f2, f3", "f1")).toBe(false);
  });
  it("lets in only the listed firms, and only * means everybody", () => {
    expect(postingAllowedFor("f1", "f1")).toBe(true);
    expect(postingAllowedFor("f2,f1 f3", "f1")).toBe(true);
    expect(postingAllowedFor("f1", "f10")).toBe(false);
    expect(postingAllowedFor("*", "anyone")).toBe(true);
  });
});
