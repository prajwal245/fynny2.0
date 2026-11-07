import { describe, expect, it } from "vitest";
import { isInvoiceLike, reconStatusFor } from "@/lib/practice/reconScope";

describe("invoices and bills stay out of bank reconciliation", () => {
  it("a sales invoice or purchase bill is not a reconciliation line", () => {
    for (const k of ["invoice", "Bill", " bill ", "purchase bill"]) expect(reconStatusFor(k)).toEqual({ match_status: "ignored", recon_tag: "invoice" });
    expect(isInvoiceLike("invoice")).toBe(true);
  });
  it("statements, ledgers, receipts and unknown kinds reconcile as before", () => {
    for (const k of ["bank_statement", "ledger_export", "tally_export", "receipt", "other", "", null, undefined]) expect(reconStatusFor(k as never)).toEqual({ match_status: "unmatched", recon_tag: null });
  });
});
