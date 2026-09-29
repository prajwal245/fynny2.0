import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsRes, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsRes?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claimsRes.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const organization_id = String(body.organization_id ?? "").trim();
    const seller_id = String(body.seller_id ?? "").trim();
    const marketplace_id = String(body.marketplace_id ?? "").trim();
    const refresh_token = String(body.refresh_token ?? "").trim();
    if (!organization_id || !seller_id || !marketplace_id || !refresh_token) {
      return json({ error: "organization_id, seller_id, marketplace_id and refresh_token are required" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: profile } = await admin.from("profiles").select("business_id, org_id").eq("user_id", userId).maybeSingle();
    const ownedOrg = profile?.business_id ?? profile?.org_id ?? null;
    if (!ownedOrg || String(ownedOrg) !== organization_id) return json({ error: "You do not own this organization" }, 403);

    // Rate limit: max 3 attempts per org per 15 min (same as Razorpay)
    const rateLimitAction = "amazon_verify";
    const rateLimitWindow = 15 * 60 * 1000;
    const maxAttempts = 3;
    const { data: rateRow } = await admin.from("auth_rate_limits")
      .select("id, attempt_count, first_attempt_at, locked_until")
      .eq("identifier", organization_id).eq("action", rateLimitAction).maybeSingle();
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
          attempt_count: rateRow.attempt_count + 1, last_attempt_at: new Date().toISOString(),
        }).eq("id", rateRow.id);
      } else {
        await admin.from("auth_rate_limits").update({
          attempt_count: 1, first_attempt_at: new Date().toISOString(),
          last_attempt_at: new Date().toISOString(), locked_until: null,
        }).eq("id", rateRow.id);
      }
    } else {
      await admin.from("auth_rate_limits").insert({
        identifier: organization_id, action: rateLimitAction,
        attempt_count: 1, first_attempt_at: new Date().toISOString(), last_attempt_at: new Date().toISOString(),
      });
    }

    const clientId = Deno.env.get("AMAZON_SP_CLIENT_ID");
    const clientSecret = Deno.env.get("AMAZON_SP_CLIENT_SECRET");
    if (!clientId || !clientSecret) {
      return json({ error: "Amazon SP-API not configured. Add AMAZON_SP_CLIENT_ID and AMAZON_SP_CLIENT_SECRET." }, 500);
    }

    // Verify by exchanging refresh_token for an access token
    const verifyRes = await fetch("https://api.amazon.com/auth/o2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    const verifyBody = await verifyRes.json().catch(() => ({}));
    if (!verifyRes.ok || !verifyBody.access_token) {
      await admin.from("webhook_events").insert({
        provider: "amazon_seller", event_type: "verify_failed",
        payload: { status: verifyRes.status, error: verifyBody.error ?? "unknown", organization_id },
      }).select().maybeSingle();
      return json({ error: `Amazon rejected these credentials: ${verifyBody.error_description ?? verifyBody.error ?? verifyRes.status}` }, 400);
    }

    const nowIso = new Date().toISOString();
    const metadata = {
      seller_id, marketplace_id, refresh_token,
      verified_at: nowIso, connected_at: nowIso,
    };
    const { error: upsertErr } = await admin.from("integrations").upsert({
      organization_id, provider: "amazon_seller", status: "active",
      access_token: null, metadata, updated_at: nowIso,
    }, { onConflict: "organization_id,provider" });
    if (upsertErr) return json({ error: `Failed to save integration: ${upsertErr.message}` }, 500);

    return json({ success: true, provider: "amazon_seller", seller_id });
  } catch (e) {
    return json({ error: (e as Error).message ?? "Unexpected error" }, 500);
  }
});
