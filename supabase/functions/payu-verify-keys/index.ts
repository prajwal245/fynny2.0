import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha512Hex(input: string) {
  const buf = await crypto.subtle.digest("SHA-512", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
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
    const key_id = String(body.key_id ?? "").trim();       // Merchant Key
    const key_secret = String(body.key_secret ?? "").trim(); // Merchant Salt
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

    // Rate limit: 3 per 15 min, 30 min lockout
    const rateLimitAction = "payu_verify";
    const rateLimitWindow = 15 * 60 * 1000;
    const maxAttempts = 3;
    const now = Date.now();
    const { data: rateRow } = await admin
      .from("auth_rate_limits")
      .select("id, attempt_count, first_attempt_at, locked_until")
      .eq("identifier", organization_id).eq("action", rateLimitAction).maybeSingle();
    if (rateRow) {
      if (rateRow.locked_until && new Date(rateRow.locked_until).getTime() > now) {
        const m = Math.ceil((new Date(rateRow.locked_until).getTime() - now) / 60000);
        return json({ error: `Too many verification attempts. Try again in ${m} minutes.` }, 429);
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

    // PayU verify_payment: hash = sha512(key|command|var1|salt). var1 = dummy txn id.
    const command = "verify_payment";
    const var1 = "fynhelp-verify-" + crypto.randomUUID();
    const hash = await sha512Hex(`${key_id}|${command}|${var1}|${key_secret}`);
    const form = new URLSearchParams({ key: key_id, command, var1, hash });
    const verifyRes = await fetch("https://info.payu.in/merchant/postservice.php?form=2", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const text = await verifyRes.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { /* html error */ }

    // status:1 (success) or status:0 with "Invalid" for unknown txn are BOTH proofs the credentials work.
    // status:0 with "check" hash / merchant errors → invalid keys.
    const okStatus = parsed?.status === 1;
    const knownGood = parsed && (okStatus || /no transaction|not found|invalid.*mihpayid|invalid.*var1/i.test(String(parsed?.msg ?? "")));
    const looksAuthFail = !parsed || /invalid.*merchant|invalid.*key|invalid.*hash|checksum|unauthorized/i.test(text);

    if (!knownGood && looksAuthFail) {
      await admin.from("webhook_events").insert({
        provider: "payu", event_type: "verify_failed",
        payload: { organization_id, response: text.slice(0, 500) },
        status: "error",
      }).select().maybeSingle();
      return json({ error: "PayU rejected these credentials. Check your Merchant Key and Merchant Salt." }, 400);
    }

    const nowIso = new Date().toISOString();
    const metadata = {
      key_id, key_secret,
      verified_at: nowIso, connected_at: nowIso, mode: "live",
    };
    const { error: upsertErr } = await admin.from("integrations").upsert({
      organization_id, provider: "payu", status: "active",
      access_token: null, metadata, updated_at: nowIso,
    }, { onConflict: "organization_id,provider" });
    if (upsertErr) return json({ error: `Failed to save integration: ${upsertErr.message}` }, 500);

    return json({ success: true, provider: "payu", key_id, mode: "live" });
  } catch (e) {
    return json({ error: (e as Error).message ?? "Unexpected error" }, 500);
  }
});
