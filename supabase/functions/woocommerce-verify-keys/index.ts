import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

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
    let store_url = String(body.store_url ?? "").trim();
    const consumer_key = String(body.consumer_key ?? "").trim();
    const consumer_secret = String(body.consumer_secret ?? "").trim();

    if (!organization_id || !store_url || !consumer_key || !consumer_secret) {
      return json({ error: "organization_id, store_url, consumer_key and consumer_secret are required" }, 400);
    }
    if (!/^https:\/\//i.test(store_url)) {
      return json({ error: "store_url must start with https:// (http:// is not allowed)" }, 400);
    }
    // Normalize — strip trailing slash
    store_url = store_url.replace(/\/+$/, "");
    try {
      const u = new URL(store_url);
      if (u.protocol !== "https:") {
        return json({ error: "store_url must use HTTPS" }, 400);
      }
    } catch {
      return json({ error: "store_url is not a valid URL" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE);

    // Ownership
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

    // Rate limit — 3 attempts / 15 min / org
    {
      const rateLimitAction = "woocommerce_verify";
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

    // Verify — HTTPS + Basic auth is the recommended approach for WooCommerce REST v3
    const verifyUrl = `${store_url}/wp-json/wc/v3/system_status`;
    let verifyRes: Response;
    try {
      verifyRes = await fetch(verifyUrl, {
        method: "GET",
        headers: {
          Authorization: "Basic " + btoa(`${consumer_key}:${consumer_secret}`),
          Accept: "application/json",
        },
      });
    } catch (e) {
      return json({ error: `Could not reach WooCommerce store: ${(e as Error).message}` }, 400);
    }
    if (verifyRes.status === 401 || verifyRes.status === 403) {
      return json({ error: "WooCommerce rejected these credentials. Check the Consumer Key and Consumer Secret and ensure the key has Read permissions." }, 400);
    }
    if (verifyRes.status === 404) {
      return json({ error: "WooCommerce REST API not found at this URL. Confirm the store URL and that WooCommerce is installed with permalinks enabled." }, 400);
    }
    if (!verifyRes.ok) {
      const text = await verifyRes.text();
      return json({ error: `WooCommerce verification failed (${verifyRes.status}): ${text.slice(0, 200)}` }, 400);
    }
    await verifyRes.text();

    const nowIso = new Date().toISOString();
    // SECURITY NOTE: consumer_secret stored in metadata jsonb server-side only.
    // Frontend never queries metadata (see useIntegrations.ts). RLS scopes by organization_id.
    // Never log or return consumer_secret in any API response.
    const metadata = {
      store_url,
      consumer_key,
      consumer_secret,
      verified_at: nowIso,
      connected_at: nowIso,
    };

    const { error: upsertErr } = await admin
      .from("integrations")
      .upsert(
        {
          organization_id,
          provider: "woocommerce",
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
      provider: "woocommerce",
      store_url,
    });
  } catch (e) {
    return json({ error: (e as Error).message ?? "Unexpected error" }, 500);
  }
});
