import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { rejectDisallowedOrigin, rejectOversizedBody } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
  "Content-Type": "application/json",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: cors });

const ALLOWED_ROLES = [
  "super_admin",
  "admin",
  "ops_admin",
  "support_agent",
  "analyst",
  "blog_admin",
  "intern",
  "moderator",
  "user",
] as const;
type Role = (typeof ALLOWED_ROLES)[number];

// Least-privilege default: no elevated role at all.
const LEAST_PRIVILEGE: Role[] = [];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();
function rateLimited(key: string): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  arr.push(now);
  hits.set(key, arr);
  return arr.length > RATE_LIMIT;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const originBlock = rejectDisallowedOrigin(req);
  if (originBlock) return originBlock;
  const sizeBlock = rejectOversizedBody(req, 2_000_000);
  if (sizeBlock) return sizeBlock;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ success: false, error: "Unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: userRes } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
  const caller = userRes?.user;
  if (!caller) return json({ success: false, error: "Unauthorized" }, 401);

  if (rateLimited(caller.id)) return json({ success: false, error: "Rate limit exceeded" }, 429);

  // Authorization is derived from the database, never from the request body.
  const { data: callerRoles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", caller.id);
  const isSuper = (callerRoles ?? []).some((r) => r.role === "super_admin");
  if (!isSuper) return json({ success: false, error: "Forbidden: super admin only" }, 403);

  let body: { op?: string; user_id?: string; roles?: string[] };
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: "Invalid body" }, 400);
  }
  const op = body.op ?? "list";

  const listAll = async () => {
    const { data: authUsers, error: authErr } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (authErr) return json({ success: false, error: authErr.message }, 500);

    const { data: roleRows, error: roleErr } = await admin
      .from("user_roles")
      .select("user_id, role, created_at");
    if (roleErr) return json({ success: false, error: roleErr.message }, 500);

    const byUser = new Map<string, string[]>();
    for (const r of roleRows ?? []) {
      byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r.role as string]);
    }

    const users = (authUsers?.users ?? []).map((u) => ({
      id: u.id,
      email: u.email ?? "",
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      email_confirmed: Boolean(u.email_confirmed_at),
      roles: (byUser.get(u.id) ?? []).sort(),
    }));

    return json({ success: true, users, allowed_roles: ALLOWED_ROLES });
  };

  if (op === "list") return await listAll();

  if (op === "set" || op === "reset") {
    const targetId = String(body.user_id ?? "");
    if (!UUID_RE.test(targetId)) return json({ success: false, error: "Invalid user_id" }, 400);

    let next: Role[] =
      op === "reset"
        ? [...LEAST_PRIVILEGE]
        : Array.from(new Set((body.roles ?? []).map(String))).filter((r): r is Role =>
            (ALLOWED_ROLES as readonly string[]).includes(r),
          );
    if (op === "set" && (body.roles ?? []).some((r) => !(ALLOWED_ROLES as readonly string[]).includes(String(r)))) {
      return json({ success: false, error: "Unknown role in request" }, 400);
    }
    next = next.slice(0, 6);

    const { data: currentRows } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", targetId);
    const current = (currentRows ?? []).map((r) => r.role as string);

    // Guardrail 1: never let a super admin strip their own super_admin role.
    if (targetId === caller.id && current.includes("super_admin") && !next.includes("super_admin")) {
      return json(
        { success: false, error: "You cannot remove your own super admin role." },
        400,
      );
    }

    // Guardrail 2: never leave the platform without a super admin.
    if (current.includes("super_admin") && !next.includes("super_admin")) {
      const { count } = await admin
        .from("user_roles")
        .select("user_id", { count: "exact", head: true })
        .eq("role", "super_admin");
      if ((count ?? 0) <= 1) {
        return json({ success: false, error: "At least one super admin must remain." }, 400);
      }
    }

    const toRemove = current.filter((r) => !next.includes(r as Role));
    const toAdd = next.filter((r) => !current.includes(r));

    if (toRemove.length) {
      const { error } = await admin
        .from("user_roles")
        .delete()
        .eq("user_id", targetId)
        .in("role", toRemove);
      if (error) return json({ success: false, error: error.message }, 500);
    }
    if (toAdd.length) {
      const { error } = await admin
        .from("user_roles")
        .insert(toAdd.map((role) => ({ user_id: targetId, role })));
      if (error) return json({ success: false, error: error.message }, 500);
    }

    await admin.from("admin_audit_logs").insert({
      admin_user_id: caller.id,
      action: op === "reset" ? "roles.reset_least_privilege" : "roles.update",
      target_type: "user",
      target_id: targetId,
      details: { before: current.sort(), after: next.sort(), added: toAdd, removed: toRemove },
    });

    console.log(
      JSON.stringify({
        fn: "admin-roles",
        op,
        actor: caller.id,
        target: targetId,
        added: toAdd,
        removed: toRemove,
      }),
    );

    return json({ success: true, roles: next.sort(), added: toAdd, removed: toRemove });
  }

  return json({ success: false, error: "Unknown op" }, 400);
});
