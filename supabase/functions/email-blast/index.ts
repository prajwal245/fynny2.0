import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { rejectDisallowedOrigin, rejectOversizedBody } from "../_shared/cors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const originBlock = rejectDisallowedOrigin(req);
  if (originBlock) return originBlock;
  const sizeBlock = rejectOversizedBody(req, 2_000_000);
  if (sizeBlock) return sizeBlock;
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: authErr } = await supabase.auth.getClaims(token);
    if (authErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);

    const { data: isAdmin } = await supabase.rpc("is_admin_user");
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    const body = await req.json();
    const subject = String(body.subject ?? "").trim();
    const html = String(body.body ?? "").trim();
    const audience = String(body.audience ?? "all_users");
    let emails: string[] = Array.isArray(body.emails) ? body.emails.filter(Boolean) : [];
    if (!subject || !html) return json({ error: "subject and body are required" }, 400);
    if (!RESEND_API_KEY) return json({ error: "Email service not configured" }, 500);

    // Resolve audience -> emails server-side (service role) if no explicit list provided.
    if (!emails.length) {
      const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const admin = createClient(SUPABASE_URL, SERVICE, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      let businessIds: string[] | null = null;
      if (audience !== "all_users") {
        const statusFilter =
          audience === "pro_users" ? "active" :
          audience === "trial_users" ? "trial" :
          audience === "churned_users" ? "cancelled" : null;
        if (statusFilter) {
          const { data: subs } = await admin
            .from("subscriptions").select("business_id").eq("status", statusFilter);
          businessIds = (subs ?? []).map((s: { business_id: string }) => s.business_id).filter(Boolean);
          if (!businessIds.length) return json({ sent: 0, failed: 0, total: 0 });
        }
      }
      // Page through auth users (max 1000 per page)
      const collected: string[] = [];
      for (let page = 1; page <= 10; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) break;
        for (const u of data.users) {
          if (!u.email) continue;
          if (businessIds) {
            // need profile.business_id check
            const { data: prof } = await admin
              .from("profiles").select("business_id").eq("user_id", u.id).maybeSingle();
            if (!prof?.business_id || !businessIds.includes(prof.business_id)) continue;
          }
          collected.push(u.email);
        }
        if (data.users.length < 1000) break;
      }
      emails = collected;
    }
    if (!emails.length) return json({ sent: 0, failed: 0, total: 0 });

    let sent = 0;
    let failed = 0;
    for (const to of emails) {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "FYNHelp <noreply@fynhelp.com>",
          to,
          subject,
          html,
        }),
      });
      if (r.ok) sent++;
      else failed++;
    }
    return json({ sent, failed, total: emails.length });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
