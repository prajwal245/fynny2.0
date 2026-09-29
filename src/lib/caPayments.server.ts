/**
 * Razorpay payment-link helpers for CA invoices.
 *
 * Pure-ish server module: no Supabase, no React. If the Razorpay credentials
 * are not configured the caller gets `configured: false` and the UI falls back
 * to UPI / manual payment instead of pretending a link exists.
 */

export interface PaymentLinkRequest {
  amount: number; // rupees
  invoiceNumber: string;
  description: string;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  callbackUrl?: string;
  notes?: Record<string, string>;
}

export interface PaymentLinkResult {
  configured: boolean;
  linkId?: string;
  paymentUrl?: string;
  error?: string;
}

const RAZORPAY_API = "https://api.razorpay.com/v1/payment_links";

export function razorpayCredentials(): { keyId: string; keySecret: string } | null {
  const keyId = process.env["RAZORPAY_KEY_ID"];
  const keySecret = process.env["RAZORPAY_KEY_SECRET"];
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret };
}

/** Paise, rounded, with sanity bounds (Rs 1 – Rs 50,00,000). */
export function toPaise(amountRupees: number): number {
  const n = Math.round(Number(amountRupees) * 100);
  if (!Number.isFinite(n) || n < 100) throw new Error("Amount too small to collect");
  if (n > 5_000_000_00) throw new Error("Amount exceeds the payment limit");
  return n;
}

export async function createPaymentLink(req: PaymentLinkRequest): Promise<PaymentLinkResult> {
  const creds = razorpayCredentials();
  if (!creds) return { configured: false };

  const body = {
    amount: toPaise(req.amount),
    currency: "INR",
    accept_partial: false,
    description: req.description.slice(0, 200),
    reference_id: req.invoiceNumber,
    customer: {
      name: req.customerName ?? undefined,
      email: req.customerEmail ?? undefined,
      contact: req.customerPhone ?? undefined,
    },
    notify: { sms: false, email: Boolean(req.customerEmail) },
    reminder_enable: true,
    callback_url: req.callbackUrl,
    callback_method: req.callbackUrl ? "get" : undefined,
    notes: req.notes ?? {},
  };

  const auth = btoa(`${creds.keyId}:${creds.keySecret}`);
  const res = await fetch(RAZORPAY_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
    body: JSON.stringify(body),
  });

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = (json?.["error"] as { description?: string } | undefined)?.description;
    return { configured: true, error: err ?? `Razorpay returned ${res.status}` };
  }
  return {
    configured: true,
    linkId: String(json["id"] ?? ""),
    paymentUrl: String(json["short_url"] ?? ""),
  };
}

/** UPI intent URI for the static QR fallback. */
export function upiIntentUri(vpa: string, payeeName: string, amount: number, note: string): string {
  const p = new URLSearchParams({
    pa: vpa,
    pn: payeeName,
    am: amount.toFixed(2),
    cu: "INR",
    tn: note.slice(0, 50),
  });
  return `upi://pay?${p.toString()}`;
}
