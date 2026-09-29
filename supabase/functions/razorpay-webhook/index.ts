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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  const admin = createClient(SUPABASE_URL, SERVICE);
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  const url = new URL(req.url);
  const orgId = url.searchParams.get("org") ?? "";

  let parsed: any = null;
  try { parsed = JSON.parse(rawBody); } catch { /* keep null */ }
  const eventType = parsed?.event ?? "unknown";

  const respondOk = (extra?: Record<string, unknown>) =>
    new Response(JSON.stringify({ ok: true, ...(extra ?? {}) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    if (!orgId) {
      await admin.from("webhook_events").insert({
        provider: "razorpay",
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
      .eq("provider", "razorpay")
      .maybeSingle();

    const webhookSecret = (integration?.metadata as any)?.webhook_secret as string | undefined;
    if (!integration || !webhookSecret) {
      await admin.from("webhook_events").insert({
        provider: "razorpay",
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

    const expected = await hmacSha256Hex(webhookSecret, rawBody);
    if (!timingSafeEqual(expected, signature)) {
      await admin.from("webhook_events").insert({
        provider: "razorpay",
        event_type: eventType,
        organization_id: orgId,
        payload: parsed ?? { raw: rawBody.slice(0, 500) },
        processed: false,
        error: "invalid signature",
      });
      return new Response(JSON.stringify({ error: "invalid signature" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Signature valid — process
    let processed = false;
    let errorMsg: string | null = null;

    try {
      const businessId = orgId; // organization_id is the business uuid string
      const payload = parsed?.payload ?? {};

      const insertTxn = async (row: {
        amountPaise: number; // signed, in paise
        description: string;
        date: string;
        sourceRef: string;
      }) => {
        const amount = row.amountPaise / 100;
        // Sanity bounds: reject obviously wrong amounts. Catches corrupted payloads / test-data pollution.
        const MAX_SINGLE_TXN = 5000000; // Rs 50 lakhs
        if (Math.abs(amount) > MAX_SINGLE_TXN) {
          await admin.from("webhook_events").insert({
            provider: "razorpay",
            event_type: "AMOUNT_SANITY_BREACH",
            organization_id: businessId,
            payload: { amount, sourceRef: row.sourceRef, original_paise: row.amountPaise },
            processed: false,
            error: `Amount Rs ${Math.abs(amount)} exceeds sanity limit of Rs ${MAX_SINGLE_TXN}. Flagged for manual review.`,
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
          category: "razorpay",
          reconciled: false,
          is_demo: false,
          source_reference: row.sourceRef,
        });
        if (error) {
          if ((error as { code?: string }).code === "23505") {
            // Duplicate — event already processed. Skip silently (idempotency).
            return;
          }
          throw error;
        }
      };

      if (eventType === "payment.captured" || eventType === "order.paid") {
        const p = payload.payment?.entity ?? payload.order?.entity;
        if (p) {
          const entityId = p.id ?? "";
          await insertTxn({
            amountPaise: Number(p.amount ?? 0),
            description: `Razorpay ${eventType} ${entityId}`.trim(),
            date: (p.created_at
              ? new Date(Number(p.created_at) * 1000)
              : new Date()
            ).toISOString().slice(0, 10),
            sourceRef: `rzp_${eventType}_${entityId}`,
          });
          processed = true;
        }
      } else if (eventType === "refund.created" || eventType === "refund.processed") {
        const r = payload.refund?.entity;
        if (r) {
          const entityId = r.id ?? "";
          await insertTxn({
            amountPaise: -Math.abs(Number(r.amount ?? 0)),
            description: `Razorpay ${eventType} ${entityId}`.trim(),
            date: (r.created_at
              ? new Date(Number(r.created_at) * 1000)
              : new Date()
            ).toISOString().slice(0, 10),
            sourceRef: `rzp_${eventType}_${entityId}`,
          });
          processed = true;
        }
      }
    } catch (e) {
      errorMsg = (e as Error).message ?? "processing error";
    }

    await admin.from("webhook_events").insert({
      provider: "razorpay",
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
        provider: "razorpay",
        event_type: eventType,
        organization_id: orgId || null,
        payload: parsed ?? { raw: rawBody.slice(0, 500) },
        processed: false,
        error: (e as Error).message ?? "unhandled",
      });
    } catch { /* ignore */ }
    // Always 200 to Razorpay to avoid retries storm
    return respondOk({ event: eventType, processed: false, warn: true });
  }
});
