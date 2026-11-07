/**
 * Which documents take part in bank reconciliation. A sales invoice or a purchase bill is a document that a payment will
 * LATER settle: it is not a bank movement, so on the books side it would sit unmatched and raise an exception (a month of invoices
 * would flood the queue). Their lines are kept and shown in the document, but are marked "ignored" for reconciliation.
 */
export const isInvoiceLike = (documentKind: string | null | undefined): boolean => /^(invoice|bill|purchase bill|sales invoice)$/i.test((documentKind ?? "").trim());

export function reconStatusFor(documentKind: string | null | undefined): { match_status: "unmatched" | "ignored"; recon_tag: string | null } {
  return isInvoiceLike(documentKind) ? { match_status: "ignored", recon_tag: "invoice" } : { match_status: "unmatched", recon_tag: null };
}
