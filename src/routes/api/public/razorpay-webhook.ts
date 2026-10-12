/**
 * Razorpay webhook: keeps each firm's plan in step with its subscription.
 *
 * In the Razorpay Dashboard → Webhooks, add
 *   https://<your domain>/api/public/razorpay-webhook
 * with a secret (set the same value as RAZORPAY_WEBHOOK_SECRET) and the
 * subscription.* events (activated, charged, pending, halted, cancelled,
 * completed, paused, resumed, authenticated).
 */
import { createFileRoute } from "@tanstack/react-router";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export const Route = createFileRoute("/api/public/razorpay-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["RAZORPAY_WEBHOOK_SECRET"];
        if (!secret) return json({ error: "Payments are not configured" }, 503);
        const raw = await request.text();
        if (raw.length > 500_000) return json({ error: "Payload too large" }, 413);
        const billing = await import("@/lib/practice/billing.server");
        if (!(await billing.webhookSignatureValid(raw, request.headers.get("x-razorpay-signature"), secret)))
          return json({ error: "Bad signature" }, 401);
        let payload: Parameters<typeof billing.handleRazorpayWebhook>[2];
        try {
          payload = JSON.parse(raw);
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }
        const { adminDb } = await import("@/lib/practice/db.server");
        const db = await adminDb();
        // Razorpay sends the same id on every retry of one event.
        const eventId =
          request.headers.get("x-razorpay-event-id") ??
          `${payload.event ?? "event"}:${payload.payload?.subscription?.entity?.id ?? ""}:${(payload as { created_at?: number }).created_at ?? ""}`;
        const res = await billing.handleRazorpayWebhook(db, eventId, payload);
        return json({ ok: true, ...res });
      },
    },
  },
});
