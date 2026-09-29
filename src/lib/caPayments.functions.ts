import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Client-portal invoice payment.
 *
 * `startInvoicePayment` creates a Razorpay payment link for a CA invoice the
 * signed-in user is allowed to see (RLS decides that). When Razorpay is not
 * configured yet it returns `configured: false` so the UI can show the UPI /
 * manual path instead of a broken button.
 */
export const startInvoicePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ invoiceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: invoice, error } = await supabase
      .from("ca_invoices")
      .select("id, ca_firm_id, business_id, invoice_number, total, status, period")
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!invoice) throw new Error("Invoice not found");
    if (invoice.status === "paid") return { configured: true, alreadyPaid: true as const };

    const { createPaymentLink } = await import("./caPayments.server");

    const link = await createPaymentLink({
      amount: Number(invoice.total ?? 0),
      invoiceNumber: invoice.invoice_number ?? invoice.id.slice(0, 8),
      description: `CA invoice ${invoice.invoice_number ?? ""} ${invoice.period ?? ""}`.trim(),
      notes: { invoice_id: invoice.id, business_id: String(invoice.business_id ?? "") },
    });

    if (!link.configured) {
      return { configured: false as const, alreadyPaid: false as const };
    }
    if (link.error) throw new Error(link.error);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("ca_invoice_payments").insert({
      ca_firm_id: invoice.ca_firm_id,
      business_id: invoice.business_id,
      invoice_id: invoice.id,
      provider: "razorpay",
      provider_link_id: link.linkId ?? null,
      payment_url: link.paymentUrl ?? null,
      amount: Number(invoice.total ?? 0),
      status: "created",
      raw: { created_by: userId },
    });

    return { configured: true as const, alreadyPaid: false as const, paymentUrl: link.paymentUrl };
  });

/** Client tells the CA they paid outside the app (UPI / bank transfer). */
export const reportManualPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      invoiceId: z.string().uuid(),
      reference: z.string().trim().min(3).max(120),
      method: z.string().trim().max(40).default("upi"),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: invoice, error } = await supabase
      .from("ca_invoices")
      .select("id, ca_firm_id, business_id, total")
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!invoice) throw new Error("Invoice not found");

    // The caller passed RLS on the invoice read above, which is the access
    // check. Client-portal users cannot write payment rows directly.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: insErr } = await supabaseAdmin.from("ca_invoice_payments").insert({
      ca_firm_id: invoice.ca_firm_id,
      business_id: invoice.business_id,
      invoice_id: invoice.id,
      provider: "manual",
      amount: Number(invoice.total ?? 0),
      method: data.method,
      status: "client_reported",
      raw: { reference: data.reference, reported_by: userId },
    });
    if (insErr) throw new Error(insErr.message);
    return { ok: true as const };
  });
