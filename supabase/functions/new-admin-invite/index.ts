import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { rejectDisallowedOrigin, rejectOversizedBody } from "../_shared/cors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const VALID_ROLES = ["super_admin", "admin", "ops_admin", "support_agent", "analyst"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const originBlock = rejectDisallowedOrigin(req);
  if (originBlock) return originBlock;
  const sizeBlock = rejectOversizedBody(req, 2_000_000);
  if (sizeBlock) return sizeBlock;
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims } = await userClient.auth.getClaims(token);
    if (!claims?.claims) return json({ error: "Unauthorized" }, 401);

    // Only super_admin or admin can invite
    const { data: roles } = await userClient
      .from("user_roles")
      .select("role")
      .eq("user_id", claims.claims.sub);
    const callerRoles = (roles ?? []).map((r: { role: string }) => r.role);
    if (!callerRoles.includes("super_admin") && !callerRoles.includes("admin")) {
      return json({ error: "Forbidden" }, 403);
    }

    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const role = String(body.role ?? "");
    if (!email || !VALID_ROLES.includes(role)) {
      return json({ error: "Valid email and role required" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const ALLOWED_ORIGINS = new Set([
      "https://fynhelp.com",
      "https://www.fynhelp.com",
      "https://fynhelp.lovable.app",
    ]);
    const requestOrigin = req.headers.get("origin") ?? "";
    const redirectBase = ALLOWED_ORIGINS.has(requestOrigin)
      ? requestOrigin
      : "https://fynhelp.com";
    const redirectTo = `${redirectBase}/admin/login`;
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
    if (error) return json({ error: error.message }, 400);

    const newUserId = data.user?.id;
    if (newUserId) {
      await admin.from("user_roles").insert({ user_id: newUserId, role });
    }
    return json({ ok: true, user_id: newUserId, email, role });
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
