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
    const message = String(body.message ?? "").trim();
    const alert_type = String(body.alert_type ?? "generic");

    if (!organization_id || !message) {
      return json({ error: "organization_id and message are required" }, 400);
    }
    if (message.length > 4000) {
      return json({ error: "message too long (max 4000 chars)" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE);

    // Verify caller owns this organization
    const { data: profile } = await admin
      .from("profiles")
      .select("business_id, org_id")
      .eq("user_id", userId)
      .maybeSingle();
    const ownedOrg = profile?.business_id ?? profile?.org_id ?? null;
    if (!ownedOrg || String(ownedOrg) !== organization_id) {
      return json({ error: "You do not own this organization" }, 403);
    }

    const { data: integ } = await admin
      .from("integrations")
      .select("metadata, status")
      .eq("organization_id", organization_id)
      .eq("provider", "slack")
      .eq("status", "active")
      .maybeSingle();

    const webhookUrl = (integ?.metadata as any)?.token as string | undefined;
    if (!webhookUrl || !webhookUrl.startsWith("https://hooks.slack.com/")) {
      return json({ success: true, delivered: false, error: "Slack not connected" });
    }

    let delivered = false;
    let errText: string | null = null;
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: message,
          blocks: [{ type: "section", text: { type: "mrkdwn", text: message } }],
        }),
      });
      delivered = res.ok;
      if (!res.ok) errText = `Slack ${res.status}: ${(await res.text()).slice(0, 200)}`;
    } catch (e) {
      errText = (e as Error).message ?? "fetch failed";
    }

    if (!delivered) {
      await admin.from("webhook_events").insert({
        provider: "slack",
        event_type: `alert_failed:${alert_type}`,
        payload: { organization_id, error: errText, message_preview: message.slice(0, 200) },
      }).then(() => {}, () => {});
    }

    return json({ success: true, delivered });
  } catch (e) {
    return json({ error: (e as Error).message ?? "Unexpected error" }, 500);
  }
});
