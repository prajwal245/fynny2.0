import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const encoder = new TextEncoder();

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

// Parses Stripe-Signature header of form: t=NNN,v1=hex,v1=hex,v0=...
function parseStripeSig(header: string): { t: string | null; v1: string[] } {
  const parts = header.split(",");
  let t: string | null = null;
  const v1: string[] = [];
  for (const part of parts) {
    const [k, v] = part.split("=");
    if (!k || !v) continue;
    if (k.trim() === "t") t = v.trim();
    else if (k.trim() === "v1") v1.push(v.trim());
  }
  return { t, v1 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  const admin = createClient(SUPABASE_URL, SERVICE);
  const rawBody = await req.text();
  const sigHeader = req.headers.get("stripe-signature") ?? "";
  const url = new URL(req.url);
  const orgId = url.searchParams.get("org") ?? "";

  let parsed: any = null;
  try { parsed = JSON.parse(rawBody); } catch { /* ignore */ }
  const eventType = parsed?.type ?? "unknown";

  const respondOk = (extra?: Record<string, unknown>) =>
    new Response(JSON.stringify({ ok: true, ...(extra ?? {}) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    if (!orgId) {
      await admin.from("webhook_events").insert({
        provider: "stripe",
        event_type: eventType,
        organization_id: null,
        payload: parsed ?? { raw: rawBody.slice(0, 500) },
        processed: false,
        error: "missing org query param",
      });
      return new Response(JSON.stringify({ error: "missing org" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: integration } = await admin
      .from("integrations")
      .select("id, organization_id, metadata")
      .eq("organization_id", orgId)
      .eq("provider", "stripe")
      .maybeSingle();

    const webhookSecret = (integration?.metadata as any)?.webhook_secret as string | undefined;
    if (!integration || !webhookSecret) {
      await admin.from("webhook_events").insert({
        provider: "stripe",
        event_type: eventType,
        organization_id: orgId,
        payload: parsed ?? { raw: rawBody.slice(0, 500) },
        processed: false,
        error: "no integration or webhook_secret",
      });
      return new Response(JSON.stringify({ error: "unknown integration" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { t, v1 } = parseStripeSig(sigHeader);
    if (!t || v1.length === 0) {
      await admin.from("webhook_events").insert({
        provider: "stripe", event_type: eventType, organization_id: orgId,
        payload: parsed ?? { raw: rawBody.slice(0, 500) },
        processed: false, error: "malformed signature header",
      });
      return new Response(JSON.stringify({ error: "bad signature" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Replay protection — reject if older than 5 minutes
    const tsMs = Number(t) * 1000;
    if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > 5 * 60 * 1000) {
      await admin.from("webhook_events").insert({
        provider: "stripe", event_type: eventType, organization_id: orgId,
        payload: parsed ?? { raw: rawBody.slice(0, 500) },
        processed: false, error: "timestamp outside tolerance",
      });
      return new Response(JSON.stringify({ error: "stale timestamp" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const signedPayload = `${t}.${rawBody}`;
    const expected = await hmacSha256Hex(webhookSecret, signedPayload);
    const match = v1.some((s) => timingSafeEqual(expected, s));
    if (!match) {
      await admin.from("webhook_events").insert({
        provider: "stripe", event_type: eventType, organization_id: orgId,
        payload: parsed ?? { raw: rawBody.slice(0, 500) },
        processed: false, error: "invalid signature",
      });
      return new Response(JSON.stringify({ error: "invalid signature" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Signature valid — process
    let processed = false;
    let errorMsg: string | null = null;

    try {
      const businessId = orgId;
      const obj = parsed?.data?.object ?? {};

      const insertTxn = async (row: {
        amountMinor: number; // signed, smallest currency unit
        description: string;
        date: string;
        sourceRef: string;
      }) => {
        const amount = row.amountMinor / 100;
        const MAX_SINGLE_TXN = 5000000; // Rs 50 lakhs
        if (Math.abs(amount) > MAX_SINGLE_TXN) {
          await admin.from("webhook_events").insert({
            provider: "stripe",
            event_type: "AMOUNT_SANITY_BREACH",
            organization_id: businessId,
            payload: { amount, sourceRef: row.sourceRef, original_minor: row.amountMinor },
            processed: false,
            error: `Amount ${Math.abs(amount)} exceeds sanity limit of ${MAX_SINGLE_TXN}. Flagged for manual review.`,
          });
          return;
        }
        if (amount === 0) return;
        const { error } = await admin.from("bank_transactions").insert({
          business_id: businessId,
          date: row.date,
          description: row.description,
          type: amount >= 0 ? "credit" : "debit",
          amount: Math.abs(amount),
          balance: 0,
          category: "stripe",
          reconciled: false,
          is_demo: false,
          source_reference: row.sourceRef,
        });
        if (error) {
          if ((error as { code?: string }).code === "23505") return; // duplicate — idempotent skip
          throw error;
        }
      };

      const dateFrom = (created?: number) =>
        (created ? new Date(created * 1000) : new Date()).toISOString().slice(0, 10);

      if (eventType === "payment_intent.succeeded") {
        await insertTxn({
          amountMinor: Number(obj.amount_received ?? obj.amount ?? 0),
          description: `Stripe payment_intent ${obj.id ?? ""}`.trim(),
          date: dateFrom(obj.created),
          sourceRef: `stripe_pi_${obj.id ?? ""}`,
        });
        processed = true;
      } else if (eventType === "invoice.paid") {
        await insertTxn({
          amountMinor: Number(obj.amount_paid ?? obj.amount_due ?? 0),
          description: `Stripe invoice ${obj.id ?? ""}`.trim(),
          date: dateFrom(obj.created),
          sourceRef: `stripe_inv_${obj.id ?? ""}`,
        });
        processed = true;
      } else if (eventType === "charge.refunded") {
        const refundAmount = Number(obj.amount_refunded ?? 0);
        const refundId = obj.id ?? "";
        await insertTxn({
          amountMinor: -Math.abs(refundAmount),
          description: `Stripe refund ${refundId}`.trim(),
          date: dateFrom(obj.created),
          sourceRef: `stripe_refund_${refundId}`,
        });
        processed = true;
      }
    } catch (e) {
      errorMsg = (e as Error).message ?? "processing error";
    }

    await admin.from("webhook_events").insert({
      provider: "stripe",
      event_type: eventType,
      organization_id: orgId,
      payload: parsed ?? { raw: rawBody.slice(0, 500) },
      processed,
      error: errorMsg,
    });

    return respondOk({ event: eventType, processed });
  } catch (e) {
    try {
      await admin.from("webhook_events").insert({
        provider: "stripe",
        event_type: eventType,
        organization_id: orgId || null,
        payload: parsed ?? { raw: rawBody.slice(0, 500) },
        processed: false,
        error: (e as Error).message ?? "unhandled",
      });
    } catch { /* ignore */ }
    return respondOk({ event: eventType, processed: false, warn: true });
  }
});
