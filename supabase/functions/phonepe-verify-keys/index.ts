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
    // key_id = Merchant ID, key_secret = Salt Key
    const key_id = String(body.key_id ?? "").trim();
    const key_secret = String(body.key_secret ?? "").trim();
    const salt_index = String(body.salt_index ?? "1").trim();
    if (!organization_id || !key_id || !key_secret) {
      return json({ error: "organization_id, key_id (merchant id) and key_secret (salt key) are required" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: profile, error: profErr } = await admin
      .from("profiles").select("business_id, org_id").eq("user_id", userId).maybeSingle();
    if (profErr) return json({ error: "Failed to load profile" }, 500);
    const ownedOrg = profile?.business_id ?? profile?.org_id ?? null;
    if (!ownedOrg || String(ownedOrg) !== organization_id) {
      return json({ error: "You do not own this organization" }, 403);
    }

    const rateLimitAction = "phonepe_verify";
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

    // PhonePe API auth is complex (SHA256 X-VERIFY on every call, endpoint returns success for our merchant id
    // only after a real transaction exists). We accept the keys after basic format checks and mark as pending
    // API verification. The first real webhook (verified via checksum) confirms the salt is correct.
    const nowIso = new Date().toISOString();
    const metadata = {
      key_id, key_secret, salt_index,
      verified_at: nowIso, connected_at: nowIso, mode: "live",
      verified_by_api: false,
      verification_note: "Keys stored. PhonePe cannot be verified without a live transaction; the first authenticated webhook will confirm the salt is correct.",
    };
    const { error: upsertErr } = await admin.from("integrations").upsert({
      organization_id, provider: "phonepe_business", status: "active",
      access_token: null, metadata, updated_at: nowIso,
    }, { onConflict: "organization_id,provider" });
    if (upsertErr) return json({ error: `Failed to save integration: ${upsertErr.message}` }, 500);

    return json({
      success: true, provider: "phonepe_business", key_id, mode: "live",
      verified_by_api: false,
      webhook_warning: "PhonePe merchant credentials stored. They will be fully verified on the first authenticated webhook from PhonePe.",
    });
  } catch (e) {
    return json({ error: (e as Error).message ?? "Unexpected error" }, 500);
  }
});
