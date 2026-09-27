/**
 * WhatsApp Business Cloud API webhook.
 *
 * GET  — Meta's subscription check (hub.verify_token must equal WHATSAPP_VERIFY_TOKEN).
 * POST — incoming messages, signed with X-Hub-Signature-256 using WHATSAPP_APP_SECRET.
 *        Documents and photos are stored and queued for the Extract agent;
 *        extraction runs on the next practice tick.
 */
import { createFileRoute } from "@tanstack/react-router";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export const Route = createFileRoute("/api/public/whatsapp-webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const expected = process.env["WHATSAPP_VERIFY_TOKEN"];
        if (expected && url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === expected) {
          return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
        }
        return json({ error: "Verification failed" }, 403);
      },
      POST: async ({ request }) => {
        const secret = process.env["WHATSAPP_APP_SECRET"];
        if (!secret) return json({ error: "WhatsApp is not configured" }, 503);
        const raw = await request.text();
        if (raw.length > 1_000_000) return json({ error: "Payload too large" }, 413);
        const { verifySignature, handleWhatsappWebhook } = await import("@/lib/practice/whatsapp.server");
        if (!(await verifySignature(raw, request.headers.get("x-hub-signature-256"), secret))) return json({ error: "Bad signature" }, 401);
        let payload: unknown;
        try { payload = JSON.parse(raw); } catch { return json({ error: "Invalid JSON" }, 400); }
        const results = await handleWhatsappWebhook(payload as Parameters<typeof handleWhatsappWebhook>[0]);
        // Always 200 once the signature is valid, so Meta does not redeliver.
        return json({ received: results.length });
      },
    },
  },
});
