import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
    const key_id = String(body.key_id ?? "").trim();       // App ID
    const key_secret = String(body.key_secret ?? "").trim(); // Secret Key
    if (!organization_id || !key_id || !key_secret) {
      return json({ error: "organization_id, key_id and key_secret are required" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE);

    const { data: profile, error: profErr } = await admin
      .from("profiles").select("business_id, org_id").eq("user_id", userId).maybeSingle();
    if (profErr) return json({ error: "Failed to load profile" }, 500);
    const ownedOrg = profile?.business_id ?? profile?.org_id ?? null;
    if (!ownedOrg || String(ownedOrg) !== organization_id) {
      return json({ error: "You do not own this organization" }, 403);
    }

    const rateLimitAction = "cashfree_verify";
    const now = Date.now();
    const { data: rateRow } = await admin.from("auth_rate_limits")
      .select("id, attempt_count, first_attempt_at, locked_until")
      .eq("identifier", organization_id).eq("action", rateLimitAction).maybeSingle();
    if (rateRow) {
      if (rateRow.locked_until && new Date(rateRow.locked_until).getTime() > now) {
        const m = Math.ceil((new Date(rateRow.locked_until).getTime() - now) / 60000);
        return json({ error: `Too many verification attempts. Try again in ${m} minutes.` }, 429);
      }
      const windowStart = new Date(rateRow.first_attempt_at).getTime();
      if (now - windowStart < 15 * 60 * 1000) {
        if (rateRow.attempt_count >= 3) {
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
          attempt_count: 1, first_attempt_at: new Date().toISOString(),
          last_attempt_at: new Date().toISOString(), locked_until: null,
        }).eq("id", rateRow.id);
      }
    } else {
      await admin.from("auth_rate_limits").insert({
        identifier: organization_id, action: rateLimitAction, attempt_count: 1,
        first_attempt_at: new Date().toISOString(), last_attempt_at: new Date().toISOString(),
      });
    }

    // Cashfree PG v3: GET /pg/orders with x-client-id / x-client-secret headers.
    // A missing order_id returns 400 with meaningful error but PROVES auth works.
    // An auth failure returns 401.
    const verifyRes = await fetch("https://api.cashfree.com/pg/orders/fynhelp-verify-nonexistent", {
      method: "GET",
      headers: {
        "x-client-id": key_id,
        "x-client-secret": key_secret,
        "x-api-version": "2023-08-01",
        "Accept": "application/json",
      },
    });
    const text = await verifyRes.text();
    if (verifyRes.status === 401 || verifyRes.status === 403) {
      await admin.from("webhook_events").insert({
        provider: "cashfree", event_type: "verify_failed",
        payload: { organization_id, status: verifyRes.status, response: text.slice(0, 500) },
        status: "error",
      });
      return json({ error: "Cashfree rejected these credentials. Check your App ID and Secret Key." }, 400);
    }
    // 400/404 with "order_not_found" or similar = auth passed
    if (verifyRes.status >= 500) {
      return json({ error: `Cashfree verification failed (${verifyRes.status}). Try again.` }, 400);
    }

    const nowIso = new Date().toISOString();
    const metadata = { key_id, key_secret, verified_at: nowIso, connected_at: nowIso, mode: "live" };
    const { error: upsertErr } = await admin.from("integrations").upsert({
      organization_id, provider: "cashfree", status: "active",
      access_token: null, metadata, updated_at: nowIso,
    }, { onConflict: "organization_id,provider" });
    if (upsertErr) return json({ error: `Failed to save integration: ${upsertErr.message}` }, 500);

    return json({ success: true, provider: "cashfree", key_id, mode: "live" });
  } catch (e) {
    return json({ error: (e as Error).message ?? "Unexpected error" }, 500);
  }
});
