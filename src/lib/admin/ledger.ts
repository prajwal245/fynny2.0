/**
 * Turns stored billing events into ledger lines. Payments come from Razorpay
 * webhooks (subscription.charged, payment.captured, invoice.paid); refunds from
 * Razorpay's refund webhooks and from refunds FynHelp started itself. List
 * prices include 18% GST, so GST is the 18/118 share of each amount.
 */
export interface BillingEvent {
  id: string;
  event: string;
  ca_firm_id: string | null;
  received_at: string;
  payload: {
    payload?: {
      payment?: { entity?: { id?: string; amount?: number; method?: string } };
      refund?: { entity?: { id?: string; amount?: number; payment_id?: string } };
    };
    refund_id?: string;
    payment_id?: string;
    amount?: number;
  } | null;
}

export interface LedgerRow {
  id: string;
  at: string;
  firm: string;
  firmId: string | null;
  event: string;
  paymentId: string | null;
  method: string | null;
  amount: number;
  gst: number;
  net: number;
  refundId: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function gstInside(gross: number) {
  const gst = round2((gross * 18) / 118);
  return { gst, net: round2(gross - gst) };
}

export function ledgerRows(events: BillingEvent[], names: Map<string, string>): LedgerRow[] {
  const out: LedgerRow[] = [];
  for (const r of events) {
    const p = r.payload ?? {};
    const pay = p.payload?.payment?.entity;
    const ref = p.payload?.refund?.entity;
    let amount: number;
    let paymentId: string | null = null;
    let refundId: string | null = null;
    // Razorpay's own refund events, and refunds started from the admin panel. The
    // in-app 7-day refund also arrives as Razorpay's refund.processed, so it is not counted twice.
    if (ref?.amount || r.event === "admin.refund") {
      amount = -((ref?.amount ?? p.amount ?? 0) / 100);
      paymentId = ref?.payment_id ?? p.payment_id ?? null;
      refundId = ref?.id ?? p.refund_id ?? null;
    } else if (pay?.amount && /charged|captured|paid/.test(r.event)) {
      amount = pay.amount / 100;
      paymentId = pay.id ?? null;
    } else continue;
    if (!amount) continue;
    const { gst, net } = gstInside(amount);
    out.push({
      id: r.id,
      at: r.received_at,
      firm: names.get(r.ca_firm_id ?? "") ?? "—",
      firmId: r.ca_firm_id,
      event: r.event,
      paymentId,
      method: pay?.method ?? null,
      amount,
      gst,
      net,
      refundId,
    });
  }
  return out;
}
