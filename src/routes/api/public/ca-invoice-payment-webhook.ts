import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Razorpay webhook for CA invoice payments.
 * Signature-verified, idempotent on the provider payment id.
 */
export const Route = createFileRoute("/api/public/ca-invoice-payment-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["RAZORPAY_WEBHOOK_SECRET"];
        if (!secret) return new Response("Webhook not configured", { status: 503 });

        const body = await request.text();
        const signature = request.headers.get("x-razorpay-signature") ?? "";
        const expected = createHmac("sha256", secret).update(body).digest("hex");
        const a = Buffer.from(signature);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: any;
        try { payload = JSON.parse(body); } catch { return new Response("Bad payload", { status: 400 }); }

        const event = String(payload?.event ?? "");
        const entity =
          payload?.payload?.payment_link?.entity ??
          payload?.payload?.payment?.entity ??
          null;
        if (!entity) return new Response("ok");

        const paymentId = String(
          payload?.payload?.payment?.entity?.id ?? entity?.id ?? "",
        );
        const linkId = String(payload?.payload?.payment_link?.entity?.id ?? entity?.order_id ?? "");
        const invoiceId = String(entity?.notes?.invoice_id ?? "");
        const paid = event.includes("paid") || event === "payment.captured";
        if (!paid || !paymentId) return new Response("ok");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Idempotency: the unique (provider, provider_payment_id) index makes a
        // replayed webhook a no-op.
        const { data: existing } = await supabaseAdmin
          .from("ca_invoice_payments")
          .select("id, invoice_id, ca_firm_id, business_id")
          .eq("provider", "razorpay")
          .eq("provider_payment_id", paymentId)
          .maybeSingle();
        if (existing) return new Response("ok");

        const { data: pending } = await supabaseAdmin
          .from("ca_invoice_payments")
          .select("id, invoice_id, ca_firm_id, business_id")
          .eq("provider", "razorpay")
          .eq(linkId ? "provider_link_id" : "invoice_id", linkId || invoiceId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const targetInvoice = pending?.invoice_id ?? invoiceId;
        if (!targetInvoice) return new Response("ok");

        const amount = Number(entity?.amount ?? 0) / 100;

        if (pending) {
          await supabaseAdmin
            .from("ca_invoice_payments")
            .update({
              provider_payment_id: paymentId,
              status: "paid",
              amount,
              paid_at: new Date().toISOString(),
              raw: payload,
            })
            .eq("id", pending.id);
        } else {
          const { data: inv } = await supabaseAdmin
            .from("ca_invoices")
            .select("ca_firm_id, business_id")
            .eq("id", targetInvoice)
            .maybeSingle();
          if (!inv) return new Response("ok");
          await supabaseAdmin.from("ca_invoice_payments").insert({
            ca_firm_id: inv.ca_firm_id,
            business_id: inv.business_id,
            invoice_id: targetInvoice,
            provider: "razorpay",
            provider_payment_id: paymentId,
            provider_link_id: linkId || null,
            amount,
            status: "paid",
            paid_at: new Date().toISOString(),
            raw: payload,
          });
        }

        await supabaseAdmin
          .from("ca_invoices")
          .update({ status: "paid", paid_at: new Date().toISOString(), payment_ref: paymentId })
          .eq("id", targetInvoice);

        const firmId = pending?.ca_firm_id ?? null;
        if (firmId) {
          await supabaseAdmin.from("ca_audit_events").insert({
            ca_firm_id: firmId,
            business_id: pending?.business_id ?? null,
            entity_type: "ca_invoice",
            entity_id: targetInvoice,
            action: "invoice_paid",
            detail: { provider: "razorpay", payment_id: paymentId, amount },
          } as never);
        }

        return new Response("ok");
      },
    },
  },
});
