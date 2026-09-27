import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const STRIPE_BASE = "https://api.stripe.com/v1";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsRes, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsRes?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claimsRes.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const organization_id = String(body.organization_id ?? "").trim();
    const key_id = String(body.key_id ?? "").trim();
    const key_secret = String(body.key_secret ?? "").trim();

    if (!organization_id || !key_id || !key_secret) {
      return json({ error: "organization_id, key_id and key_secret are required" }, 400);
    }
    if (!/^pk_(live|test)_[A-Za-z0-9]+$/.test(key_id)) {
      return json({ error: "Invalid publishable key. Must start with pk_live_ or pk_test_" }, 400);
    }
    if (!/^sk_(live|test)_[A-Za-z0-9]+$/.test(key_secret)) {
      return json({ error: "Invalid secret key. Must start with sk_live_ or sk_test_" }, 400);
    }
    if (key_id.startsWith("pk_live_") !== key_secret.startsWith("sk_live_")) {
      return json({ error: "Publishable and secret keys must both be live or both test." }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE);

    // Ownership check
    const { data: profile, error: profErr } = await admin
      .from("profiles")
      .select("business_id, org_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (profErr) return json({ error: "Failed to load profile" }, 500);
    const ownedOrg = profile?.business_id ?? profile?.org_id ?? null;
    if (!ownedOrg || String(ownedOrg) !== organization_id) {
      return json({ error: "You do not own this organization" }, 403);
    }

    // Rate limit — 3 attempts per 15 minutes per organization
    {
      const rateLimitAction = "stripe_verify";
      const rateLimitWindow = 15 * 60 * 1000;
      const maxAttempts = 3;
      const { data: rateRow } = await admin
        .from("auth_rate_limits")
        .select("id, attempt_count, first_attempt_at, locked_until")
        .eq("identifier", organization_id)
        .eq("action", rateLimitAction)
        .maybeSingle();
      const now = Date.now();
      if (rateRow) {
        if (rateRow.locked_until && new Date(rateRow.locked_until).getTime() > now) {
          const minutesLeft = Math.ceil((new Date(rateRow.locked_until).getTime() - now) / 60000);
          return json({ error: `Too many verification attempts. Try again in ${minutesLeft} minutes.` }, 429);
        }
        const windowStart = new Date(rateRow.first_attempt_at).getTime();
        if (now - windowStart < rateLimitWindow) {
          if (rateRow.attempt_count >= maxAttempts) {
            await admin.from("auth_rate_limits").update({
              locked_until: new Date(now + 30 * 60 * 1000).toISOString(),
              last_attempt_at: new Date().toISOString(),
            }).eq("id", rateRow.id);
            return json({ error: "Too many verification attempts. Locked for 30 minutes." }, 429);
          }
          await admin.from("auth_rate_limits").update({
            attempt_count: rateRow.attempt_count + 1,
            last_attempt_at: new Date().toISOString(),
          }).eq("id", rateRow.id);
        } else {
          await admin.from("auth_rate_limits").update({
            attempt_count: 1,
            first_attempt_at: new Date().toISOString(),
            last_attempt_at: new Date().toISOString(),
            locked_until: null,
          }).eq("id", rateRow.id);
        }
      } else {
        await admin.from("auth_rate_limits").insert({
          identifier: organization_id,
          action: rateLimitAction,
          attempt_count: 1,
          first_attempt_at: new Date().toISOString(),
          last_attempt_at: new Date().toISOString(),
        });
      }
    }

    // Verify keys with Stripe
    const verifyRes = await fetch(`${STRIPE_BASE}/balance`, {
      method: "GET",
      headers: { Authorization: `Bearer ${key_secret}` },
    });
    if (verifyRes.status === 401) {
      return json({ error: "Stripe rejected these keys. Double-check the Secret Key." }, 400);
    }
    if (!verifyRes.ok) {
      const text = await verifyRes.text();
      return json({ error: `Stripe verification failed (${verifyRes.status}): ${text.slice(0, 200)}` }, 400);
    }
    await verifyRes.text();

    const is_live = key_secret.startsWith("sk_live_");
    const webhookUrl =
      `${SUPABASE_URL}/functions/v1/stripe-webhook?org=${encodeURIComponent(organization_id)}`;

    // Auto-register webhook (Stripe returns whsec_ secret in response)
    let webhook_id: string | null = null;
    let webhook_secret: string | null = null;
    let webhook_warning: string | null = null;
    try {
      const form = new URLSearchParams();
      form.append("url", webhookUrl);
      form.append("api_version", "2024-06-20");
      for (const ev of [
        "payment_intent.succeeded",
        "charge.refunded",
        "invoice.paid",
        "invoice.payment_failed",
      ]) {
        form.append("enabled_events[]", ev);
      }
      const whRes = await fetch(`${STRIPE_BASE}/webhook_endpoints`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key_secret}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
      });
      const whText = await whRes.text();
      if (whRes.ok) {
        try {
          const parsed = JSON.parse(whText);
          webhook_id = parsed?.id ?? null;
          webhook_secret = parsed?.secret ?? null;
          if (!webhook_secret) {
            webhook_warning =
              "Webhook created but Stripe did not return a signing secret. Reveal it in Stripe Dashboard → Developers → Webhooks and paste it manually.";
          }
        } catch { /* ignore */ }
      } else {
        webhook_warning =
          `Keys verified but webhook auto-registration failed (${whRes.status}). ` +
          `Add this URL manually in Stripe Dashboard → Developers → Webhooks: ${webhookUrl}`;
      }
    } catch (_e) {
      webhook_warning =
        `Keys verified but webhook auto-registration failed. ` +
        `Add this URL manually in Stripe Dashboard → Developers → Webhooks: ${webhookUrl}`;
    }

    const nowIso = new Date().toISOString();
    // SECURITY NOTE: key_secret and webhook_secret stored in metadata jsonb server-side only.
    // Frontend never queries metadata (see useIntegrations.ts). RLS scopes by organization_id.
    // FUTURE: migrate to Supabase Vault (pgsodium) for at-rest encryption. Never log or return
    // these values in any API response.
    const metadata = {
      key_id,           // publishable — safe to reveal to client on response
      key_secret,       // server-only
      webhook_id,
      webhook_secret,   // server-only
      webhook_url: webhookUrl,
      is_live,
      mode: is_live ? "live" : "test",
      verified_at: nowIso,
      connected_at: nowIso,
      webhook_warning,
    };

    const { error: upsertErr } = await admin
      .from("integrations")
      .upsert(
        {
          organization_id,
          provider: "stripe",
          status: "active",
          access_token: null,
          metadata,
          updated_at: nowIso,
        },
        { onConflict: "organization_id,provider" },
      );
    if (upsertErr) return json({ error: `Failed to save integration: ${upsertErr.message}` }, 500);

    return json({
      success: true,
      provider: "stripe",
      key_id,
      mode: is_live ? "live" : "test",
      webhook_registered: !!webhook_id && !!webhook_secret,
      webhook_warning,
      webhook_url: webhookUrl,
    });
  } catch (e) {
    return json({ error: (e as Error).message ?? "Unexpected error" }, 500);
  }
});
